import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	ApplicationMenu,
	type ApplicationMenuItemConfig,
	BrowserView,
	BrowserWindow,
	Utils,
} from "electrobun/bun";
import cliPackage from "../../../cli/package.json";
import { type CLIError, formatError } from "../../../cli/shared/errors.js";
import { launchArcade } from "../../../cli/src/arcade/launch.js";
import {
	DaemonExecutableResolutionError,
	resolveDaemonExecutablePath,
} from "../../../cli/web-ui/src/daemon/executable.js";
import {
	appendArcadeRuntimeQuery,
	createNativeArcadeCacheBust,
} from "./runtime-url.js";

type LaunchStatus = "loading" | "failure";
type NativeWindow = InstanceType<typeof BrowserWindow>;
type NativeWebview = NativeWindow["webview"] & {
	readonly executeJavascript?: (js: string) => void;
	readonly on?: (
		name:
			| "did-commit-navigation"
			| "did-navigate"
			| "did-navigate-in-page"
			| "dom-ready",
		handler: (event: unknown) => void,
	) => void;
};

interface LaunchOptions {
	readonly projectPath?: string;
	readonly rp1ExecutablePath?: string;
	readonly environmentExecutablePath?: string;
	readonly errors: readonly string[];
}

interface LaunchViewState {
	readonly status: LaunchStatus;
	readonly title: string;
	readonly message: string;
	readonly detail?: string;
}

type NativeBridgeRpcSchema = {
	readonly bun: {
		readonly requests: Record<never, never>;
		readonly messages: {
			readonly "rp1:open-external-url": {
				readonly url?: unknown;
			};
		};
	};
	readonly webview: {
		readonly requests: Record<never, never>;
		readonly messages: Record<never, never>;
	};
};

const LAUNCH_VIEW_TEMPLATE = readFileSync(
	resolve(import.meta.dir, "../views/launch/index.html"),
	"utf8",
);
const CLI_VERSION = `${cliPackage.version}-dev`;
const APP_NAME = "rp1 Arcade";
const WINDOW_TITLE = "rp1 Arcade";
const WEB_DOCUMENT_TITLE = APP_NAME;
const OPENING_TITLE = `Opening ${APP_NAME}`;
const NATIVE_OPEN_EXTERNAL_MESSAGE = "rp1:open-external-url";
const ARCADE_NAVIGATION_RULES = [
	"^*",
	"views://launch/*",
	"http://127.0.0.1:*/*",
	"http://localhost:*/*",
	"http://[::1]:*/*",
];
const APPLICATION_MENU: ApplicationMenuItemConfig[] = [
	{
		label: APP_NAME,
		submenu: [
			{
				label: `Quit ${APP_NAME}`,
				role: "quit",
				accelerator: "Command+Q",
			},
		],
	},
	{
		label: "Edit",
		submenu: [
			{ role: "undo", accelerator: "Command+Z" },
			{ role: "redo", accelerator: "Shift+Command+Z" },
			{ type: "separator" },
			{ role: "cut", accelerator: "Command+X" },
			{ role: "copy", accelerator: "Command+C" },
			{ role: "paste", accelerator: "Command+V" },
			{ role: "pasteAndMatchStyle", accelerator: "Shift+Command+V" },
			{ type: "separator" },
			{ role: "selectAll", accelerator: "Command+A" },
		],
	},
];

const parseFlagValue = (
	args: readonly string[],
	index: number,
	flag: string,
): {
	readonly value?: string;
	readonly nextIndex: number;
	readonly error?: string;
} => {
	const next = args[index + 1];
	if (!next || next.startsWith("-")) {
		return {
			nextIndex: index,
			error: `Missing value for ${flag}.`,
		};
	}

	return {
		value: next,
		nextIndex: index + 1,
	};
};

export const parseLaunchOptions = (
	args: readonly string[] = process.argv.slice(2),
	env: Record<string, string | undefined> = process.env,
): LaunchOptions => {
	const errors: string[] = [];
	let projectPath: string | undefined;
	let rp1ExecutablePath: string | undefined;

	for (let index = 0; index < args.length; index++) {
		const arg = args[index];

		if (arg === "--project") {
			const parsed = parseFlagValue(args, index, "--project");
			if (parsed.error) {
				errors.push(parsed.error);
			}
			if (parsed.value) {
				projectPath = resolve(parsed.value);
			}
			index = parsed.nextIndex;
		} else if (arg === "--rp1-executable") {
			const parsed = parseFlagValue(args, index, "--rp1-executable");
			if (parsed.error) {
				errors.push(parsed.error);
			}
			if (parsed.value) {
				rp1ExecutablePath = resolve(parsed.value);
			}
			index = parsed.nextIndex;
		} else if (arg.startsWith("--project=")) {
			const value = arg.slice("--project=".length).trim();
			if (value.length === 0) {
				errors.push("Missing value for --project.");
			} else {
				projectPath = resolve(value);
			}
		} else if (arg.startsWith("--rp1-executable=")) {
			const value = arg.slice("--rp1-executable=".length).trim();
			if (value.length === 0) {
				errors.push("Missing value for --rp1-executable.");
			} else {
				rp1ExecutablePath = resolve(value);
			}
		}
	}

	const envProjectPath = env.RP1_NATIVE_PROJECT_PATH?.trim();
	if (!projectPath && envProjectPath) {
		projectPath = resolve(envProjectPath);
	}

	const environmentExecutablePath = env.RP1_NATIVE_RP1_EXECUTABLE?.trim();

	return {
		projectPath,
		rp1ExecutablePath,
		environmentExecutablePath: environmentExecutablePath
			? resolve(environmentExecutablePath)
			: undefined,
		errors,
	};
};

const escapeScriptJson = (value: LaunchViewState): string =>
	JSON.stringify(value).replace(/</g, "\\u003c");

const createLaunchViewHtml = (state: LaunchViewState): string => {
	const stateScript = `<script>window.__RP1_LAUNCH_STATE__=${escapeScriptJson(state)};</script>`;
	return LAUNCH_VIEW_TEMPLATE.replace("</head>", `${stateScript}</head>`);
};

const createInitialState = (options: LaunchOptions): LaunchViewState => {
	const firstError = options.errors[0];
	if (firstError) {
		return {
			status: "failure",
			title: "Launch options need attention",
			message: firstError,
			detail:
				"Use --project <path>, --rp1-executable <path>, RP1_NATIVE_PROJECT_PATH, or RP1_NATIVE_RP1_EXECUTABLE.",
		};
	}

	if (!options.projectPath) {
		return {
			status: "loading",
			title: OPENING_TITLE,
			message: "Loading registered projects.",
			detail: "No project path supplied; opening the Arcade projects view.",
		};
	}

	return {
		status: "loading",
		title: OPENING_TITLE,
		message: "Preparing the native shell.",
		detail: options.projectPath,
	};
};

const setNavigationRules = (window: NativeWindow): void => {
	const webview = window.webview as {
		setNavigationRules: (rules: string[]) => void;
	};
	webview.setNavigationRules([...ARCADE_NAVIGATION_RULES]);
};

const loadWindowUrl = (window: NativeWindow, url: string): void => {
	const webview = window.webview as {
		loadURL: (url: string) => void;
	};
	webview.loadURL(url);
};

const loadLaunchView = (window: NativeWindow, state: LaunchViewState): void => {
	const webview = window.webview as {
		loadHTML: (html: string) => void;
	};
	webview.loadHTML(createLaunchViewHtml(state));
};

const pinDocumentTitleScript = (title: string): string => `
(() => {
	const title = ${JSON.stringify(title)};
	const globalKey = "__RP1_NATIVE_TITLE_PINNED__";
	if (window[globalKey] === title) {
		document.title = title;
		return;
	}
	window[globalKey] = title;
	const applyTitle = () => {
		if (document.title !== title) document.title = title;
	};
	applyTitle();
	const titleElement =
		document.querySelector("title") ||
		document.head?.appendChild(document.createElement("title"));
	if (titleElement) {
		new MutationObserver(applyTitle).observe(titleElement, {
			childList: true,
			characterData: true,
			subtree: true,
		});
	}
})();
`;

const setVisibleWindowTitle = (window: NativeWindow): void => {
	const webview = window.webview as NativeWebview;
	webview.executeJavascript?.(pinDocumentTitleScript(WEB_DOCUMENT_TITLE));
	window.setTitle(WINDOW_TITLE);
};

const pinVisibleWindowTitle = (window: NativeWindow): void => {
	setVisibleWindowTitle(window);
	const webview = window.webview as NativeWebview;
	const restoreTitle = () => setVisibleWindowTitle(window);
	webview.on?.("did-commit-navigation", restoreTitle);
	webview.on?.("did-navigate", restoreTitle);
	webview.on?.("did-navigate-in-page", restoreTitle);
	webview.on?.("dom-ready", restoreTitle);
};

const isLoopbackArcadeUrl = (url: string): boolean => {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "http:") return false;
		return (
			parsed.hostname === "127.0.0.1" ||
			parsed.hostname === "localhost" ||
			parsed.hostname === "[::1]" ||
			parsed.hostname === "::1"
		);
	} catch {
		return false;
	}
};

const readExternalUrl = (payload: unknown): string | null => {
	if (typeof payload !== "object" || payload === null || !("url" in payload)) {
		return null;
	}

	const url = (payload as { readonly url?: unknown }).url;
	if (typeof url !== "string" || url.trim().length === 0) {
		return null;
	}

	try {
		const parsed = new URL(url);
		return parsed.protocol === "http:" || parsed.protocol === "https:"
			? parsed.toString()
			: null;
	} catch {
		return null;
	}
};

const createNativeBridgeRpc = () =>
	BrowserView.defineRPC<NativeBridgeRpcSchema>({
		handlers: {
			messages: {
				[NATIVE_OPEN_EXTERNAL_MESSAGE]: (payload: unknown) => {
					const url = readExternalUrl(payload);
					if (url) {
						Utils.openExternal(url);
					}
				},
			},
		},
	});

const isCliError = (error: unknown): error is CLIError =>
	typeof error === "object" &&
	error !== null &&
	"_tag" in error &&
	typeof (error as { readonly _tag?: unknown })._tag === "string";

const formatFailureState = (error: unknown): LaunchViewState => {
	if (error instanceof DaemonExecutableResolutionError) {
		return {
			status: "failure",
			title: "RP1 executable not found",
			message:
				"The native shell could not resolve an executable rp1 binary for daemon startup.",
			detail: error.message,
		};
	}

	if (error instanceof Error && error.name === "DaemonPortConflictError") {
		return {
			status: "failure",
			title: "Arcade port is unavailable",
			message:
				"Another process is using the Arcade daemon port, so the native shell could not open Arcade.",
			detail: error.message,
		};
	}

	if (isCliError(error)) {
		return {
			status: "failure",
			title:
				error._tag === "NotFoundError"
					? "Project cannot be opened"
					: "Arcade launch failed",
			message: formatError(error, false),
		};
	}

	if (error instanceof Error) {
		return {
			status: "failure",
			title: "Arcade launch failed",
			message:
				"The native shell could not start or connect to Arcade for this launch.",
			detail: error.message,
		};
	}

	return {
		status: "failure",
		title: "Arcade launch failed",
		message:
			"The native shell could not start or connect to Arcade for this launch.",
	};
};

const resolveNativeExecutablePath = (options: LaunchOptions): string => {
	const env = {
		...process.env,
		...(options.environmentExecutablePath
			? { RP1_NATIVE_RP1_EXECUTABLE: options.environmentExecutablePath }
			: {}),
	};

	return resolveDaemonExecutablePath({
		explicitPath: options.rp1ExecutablePath,
		native: true,
		env,
	});
};

const launchNativeShell = async (
	window: NativeWindow,
	options: LaunchOptions,
): Promise<void> => {
	const executablePath = resolveNativeExecutablePath(options);
	const result = await launchArcade({
		projectPath: options.projectPath,
		rp1ExecutablePath: executablePath,
		cliVersion: CLI_VERSION,
		openProjectListWhenMissing: true,
	});

	if (!isLoopbackArcadeUrl(result.url)) {
		throw new Error(`Arcade returned a non-loopback URL: ${result.url}`);
	}

	const arcadeUrl = appendArcadeRuntimeQuery(result.url, {
		hostMode: "native",
		cacheBust: createNativeArcadeCacheBust(),
	});

	setVisibleWindowTitle(window);
	loadWindowUrl(window, arcadeUrl);
};

const launchOptions = parseLaunchOptions();
const initialState = createInitialState(launchOptions);

ApplicationMenu.setApplicationMenu(APPLICATION_MENU);

const mainWindow = new BrowserWindow({
	title: WINDOW_TITLE,
	rpc: createNativeBridgeRpc(),
	frame: {
		width: 1280,
		height: 860,
		x: 80,
		y: 80,
	},
});

pinVisibleWindowTitle(mainWindow);
setNavigationRules(mainWindow);
loadLaunchView(mainWindow, initialState);

if (launchOptions.errors.length === 0) {
	void launchNativeShell(mainWindow, launchOptions).catch((error) => {
		loadLaunchView(mainWindow, formatFailureState(error));
	});
}
