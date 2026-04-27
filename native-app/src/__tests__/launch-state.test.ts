import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import cliPackage from "../../../cli/package.json";

class MockDaemonExecutableResolutionError extends Error {
	readonly checkedLocations: readonly unknown[];

	constructor(message = "Unable to resolve rp1 executable") {
		super(message);
		this.name = "DaemonExecutableResolutionError";
		this.checkedLocations = [];
	}
}

interface CapturedWindow {
	readonly initialHtml?: string;
	readonly loadedHtml: string[];
	readonly loadedUrls: string[];
	readonly navigationRules: string[][];
	title: string;
}

const capturedWindows: CapturedWindow[] = [];
const capturedApplicationMenus: unknown[] = [];

class MockBrowserWindow {
	readonly webview: {
		readonly setNavigationRules: (rules: string[]) => void;
		readonly loadURL: (url: string) => void;
		readonly loadHTML: (html: string) => void;
	};

	readonly captured: CapturedWindow;

	constructor(options: { readonly title: string; readonly html?: string }) {
		this.captured = {
			initialHtml: options.html,
			loadedHtml: [],
			loadedUrls: [],
			navigationRules: [],
			title: options.title,
		};
		capturedWindows.push(this.captured);
		this.webview = {
			setNavigationRules: (rules: string[]) => {
				this.captured.navigationRules.push(rules);
			},
			loadURL: (url: string) => {
				this.captured.loadedUrls.push(url);
			},
			loadHTML: (html: string) => {
				this.captured.loadedHtml.push(html);
			},
		};
	}

	setTitle(title: string): void {
		this.captured.title = title;
	}
}

const resolveDaemonExecutablePathMock = mock(() => "/tmp/rp1");
const launchArcadeMock = mock(async () => ({
	kind: "project-list" as const,
	projects: [],
	url: "http://127.0.0.1:7710/projects",
	action: "started" as const,
	wasRunning: false,
	daemonPort: 7710,
}));
const setApplicationMenuMock = mock((menu: unknown) => {
	capturedApplicationMenus.push(menu);
});

mock.module("electrobun/bun", () => ({
	ApplicationMenu: {
		setApplicationMenu: setApplicationMenuMock,
	},
	BrowserWindow: MockBrowserWindow,
}));

mock.module("../../../cli/web-ui/src/daemon/executable.js", () => ({
	DaemonExecutableResolutionError: MockDaemonExecutableResolutionError,
	resolveDaemonExecutablePath: resolveDaemonExecutablePathMock,
}));

mock.module("../../../cli/src/arcade/launch.js", () => ({
	launchArcade: launchArcadeMock,
}));

const nextImportPath = (() => {
	let counter = 0;
	return () => `../bun/index.ts?test=${counter++}`;
})();

const parseLaunchViewHtmlState = (html: string): Record<string, string> => {
	const match = html.match(/window\.__RP1_LAUNCH_STATE__=(.*?);<\/script>/);
	if (!match) throw new Error("Expected launch state script");
	return JSON.parse(match[1] ?? "{}") as Record<string, string>;
};

const runNativeEntrypoint = async (
	args: readonly string[] = [],
	env: Record<string, string | undefined> = {},
): Promise<CapturedWindow> => {
	const originalArgv = process.argv;
	const originalProjectPath = process.env.RP1_NATIVE_PROJECT_PATH;
	const originalExecutablePath = process.env.RP1_NATIVE_RP1_EXECUTABLE;

	process.argv = ["bun", "native-app/src/bun/index.ts", ...args];
	if (env.RP1_NATIVE_PROJECT_PATH === undefined) {
		delete process.env.RP1_NATIVE_PROJECT_PATH;
	} else {
		process.env.RP1_NATIVE_PROJECT_PATH = env.RP1_NATIVE_PROJECT_PATH;
	}
	if (env.RP1_NATIVE_RP1_EXECUTABLE === undefined) {
		delete process.env.RP1_NATIVE_RP1_EXECUTABLE;
	} else {
		process.env.RP1_NATIVE_RP1_EXECUTABLE = env.RP1_NATIVE_RP1_EXECUTABLE;
	}

	try {
		await import(nextImportPath());
		await new Promise((resolve) => setTimeout(resolve, 0));
		const captured = capturedWindows[0];
		if (!captured) throw new Error("Expected native window to be created");
		return captured;
	} finally {
		process.argv = originalArgv;
		if (originalProjectPath === undefined) {
			delete process.env.RP1_NATIVE_PROJECT_PATH;
		} else {
			process.env.RP1_NATIVE_PROJECT_PATH = originalProjectPath;
		}
		if (originalExecutablePath === undefined) {
			delete process.env.RP1_NATIVE_RP1_EXECUTABLE;
		} else {
			process.env.RP1_NATIVE_RP1_EXECUTABLE = originalExecutablePath;
		}
	}
};

describe("native launch state", () => {
	beforeEach(() => {
		capturedWindows.length = 0;
		capturedApplicationMenus.length = 0;
		resolveDaemonExecutablePathMock.mockClear();
		launchArcadeMock.mockClear();
		setApplicationMenuMock.mockClear();
		resolveDaemonExecutablePathMock.mockImplementation(() => "/tmp/rp1");
		launchArcadeMock.mockImplementation(async () => ({
			kind: "project-list" as const,
			projects: [],
			url: "http://127.0.0.1:7710/projects",
			action: "started" as const,
			wasRunning: false,
			daemonPort: 7710,
		}));
	});

	afterEach(() => {
		capturedWindows.length = 0;
		capturedApplicationMenus.length = 0;
	});

	test("installs the standard macOS quit menu shortcut", async () => {
		await runNativeEntrypoint();

		expect(setApplicationMenuMock).toHaveBeenCalledTimes(1);
		expect(capturedApplicationMenus[0]).toEqual([
			{
				label: "RP1 Arcade",
				submenu: [
					{
						label: "Quit RP1 Arcade",
						role: "quit",
						accelerator: "Command+Q",
					},
				],
			},
		]);
	});

	test("loads the project-list route when no project path is supplied", async () => {
		const window = await runNativeEntrypoint();
		const initialState = parseLaunchViewHtmlState(window.loadedHtml[0] ?? "");

		expect(window.initialHtml).toBeUndefined();
		expect(initialState.status).toBe("loading");
		expect(initialState.message).toBe("Loading registered projects.");
		expect(window.navigationRules[0]).toContain("http://127.0.0.1:*/*");
		expect(window.loadedUrls).toEqual(["http://127.0.0.1:7710/projects"]);
		expect(window.title).toBe("RP1 Arcade - Projects");
		expect(launchArcadeMock).toHaveBeenCalledWith({
			projectPath: undefined,
			rp1ExecutablePath: "/tmp/rp1",
			cliVersion: `${cliPackage.version}-dev`,
			openProjectListWhenMissing: true,
		});
	});

	test("renders option parsing failures before launching Arcade", async () => {
		const window = await runNativeEntrypoint(["--project"]);
		const initialState = parseLaunchViewHtmlState(window.loadedHtml[0] ?? "");

		expect(window.initialHtml).toBeUndefined();
		expect(initialState.status).toBe("failure");
		expect(initialState.title).toBe("Launch options need attention");
		expect(initialState.message).toBe("Missing value for --project.");
		expect(window.loadedUrls).toEqual([]);
		expect(launchArcadeMock).not.toHaveBeenCalled();
	});

	test("formats missing executable failures with override guidance", async () => {
		resolveDaemonExecutablePathMock.mockImplementationOnce(() => {
			throw new MockDaemonExecutableResolutionError(
				"Unable to resolve rp1 executable. Checked bundled: /missing/rp1 (missing). Provide --rp1-executable <path> or set RP1_NATIVE_RP1_EXECUTABLE.",
			);
		});

		const window = await runNativeEntrypoint();
		const failureState = parseLaunchViewHtmlState(window.loadedHtml.at(-1) ?? "");

		expect(failureState.status).toBe("failure");
		expect(failureState.title).toBe("RP1 executable not found");
		expect(failureState.detail).toContain("--rp1-executable");
		expect(failureState.detail).toContain("RP1_NATIVE_RP1_EXECUTABLE");
	});

	test("formats invalid project failures as project-open failures", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			throw {
				_tag: "NotFoundError",
				resource: ".rp1 directory at /tmp/not-rp1",
				suggestion: "Choose a valid rp1 project.",
			};
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/not-rp1"]);
		const failureState = parseLaunchViewHtmlState(window.loadedHtml.at(-1) ?? "");

		expect(failureState.status).toBe("failure");
		expect(failureState.title).toBe("Project cannot be opened");
		expect(failureState.message).toContain(
			".rp1 directory at /tmp/not-rp1 not found",
		);
	});

	test("formats daemon port conflicts as port failures", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			const error = new Error("Port 7710 is in use");
			error.name = "DaemonPortConflictError";
			throw error;
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/project"]);
		const failureState = parseLaunchViewHtmlState(window.loadedHtml.at(-1) ?? "");

		expect(failureState.status).toBe("failure");
		expect(failureState.title).toBe("Arcade port is unavailable");
		expect(failureState.detail).toBe("Port 7710 is in use");
	});

	test("formats daemon startup failures without loading stale project content", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			throw new Error("Daemon started but failed to become healthy");
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/project"]);
		const failureState = parseLaunchViewHtmlState(window.loadedHtml.at(-1) ?? "");

		expect(failureState.status).toBe("failure");
		expect(failureState.title).toBe("Arcade launch failed");
		expect(failureState.detail).toBe(
			"Daemon started but failed to become healthy",
		);
		expect(window.loadedUrls).toHaveLength(0);
		expect(window.loadedHtml).toHaveLength(2);
	});

	test("formats project registration failures as launch failures", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			throw new Error("Project registration failed");
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/project"]);
		const failureState = parseLaunchViewHtmlState(window.loadedHtml.at(-1) ?? "");

		expect(failureState.status).toBe("failure");
		expect(failureState.message).toBe(
			"The native shell could not start or connect to Arcade for this launch.",
		);
		expect(failureState.detail).toBe("Project registration failed");
	});
});
