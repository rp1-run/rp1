import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

class MockDaemonExecutableResolutionError extends Error {
	readonly checkedLocations: readonly unknown[];

	constructor(message = "Unable to resolve rp1 executable") {
		super(message);
		this.name = "DaemonExecutableResolutionError";
		this.checkedLocations = [];
	}
}

interface CapturedWindow {
	readonly initialUrl: string;
	readonly loadedUrls: string[];
	readonly navigationRules: string[][];
	title: string;
}

const capturedWindows: CapturedWindow[] = [];

class MockBrowserWindow {
	readonly webview: {
		readonly setNavigationRules: (rules: string[]) => void;
		readonly loadURL: (url: string) => void;
	};

	readonly captured: CapturedWindow;

	constructor(options: { readonly title: string; readonly url: string }) {
		this.captured = {
			initialUrl: options.url,
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

mock.module("electrobun/bun", () => ({
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

const parseLaunchViewUrl = (url: string): URLSearchParams =>
	new URL(url).searchParams;

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
		resolveDaemonExecutablePathMock.mockClear();
		launchArcadeMock.mockClear();
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
	});

	test("loads the project-list route when no project path is supplied", async () => {
		const window = await runNativeEntrypoint();
		const initialParams = parseLaunchViewUrl(window.initialUrl);

		expect(initialParams.get("status")).toBe("loading");
		expect(initialParams.get("message")).toBe("Loading registered projects.");
		expect(window.navigationRules[0]).toContain("http://127.0.0.1:*/*");
		expect(window.loadedUrls).toEqual(["http://127.0.0.1:7710/projects"]);
		expect(window.title).toBe("RP1 Arcade - Projects");
		expect(launchArcadeMock).toHaveBeenCalledWith({
			projectPath: undefined,
			rp1ExecutablePath: "/tmp/rp1",
			openProjectListWhenMissing: true,
		});
	});

	test("renders option parsing failures before launching Arcade", async () => {
		const window = await runNativeEntrypoint(["--project"]);
		const initialParams = parseLaunchViewUrl(window.initialUrl);

		expect(initialParams.get("status")).toBe("failure");
		expect(initialParams.get("title")).toBe("Launch options need attention");
		expect(initialParams.get("message")).toBe("Missing value for --project.");
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
		const failureParams = parseLaunchViewUrl(window.loadedUrls.at(-1) ?? "");

		expect(failureParams.get("status")).toBe("failure");
		expect(failureParams.get("title")).toBe("RP1 executable not found");
		expect(failureParams.get("detail")).toContain("--rp1-executable");
		expect(failureParams.get("detail")).toContain("RP1_NATIVE_RP1_EXECUTABLE");
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
		const failureParams = parseLaunchViewUrl(window.loadedUrls.at(-1) ?? "");

		expect(failureParams.get("status")).toBe("failure");
		expect(failureParams.get("title")).toBe("Project cannot be opened");
		expect(failureParams.get("message")).toContain(
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
		const failureParams = parseLaunchViewUrl(window.loadedUrls.at(-1) ?? "");

		expect(failureParams.get("status")).toBe("failure");
		expect(failureParams.get("title")).toBe("Arcade port is unavailable");
		expect(failureParams.get("detail")).toBe("Port 7710 is in use");
	});

	test("formats daemon startup failures without loading stale project content", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			throw new Error("Daemon started but failed to become healthy");
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/project"]);
		const failureParams = parseLaunchViewUrl(window.loadedUrls.at(-1) ?? "");

		expect(failureParams.get("status")).toBe("failure");
		expect(failureParams.get("title")).toBe("Arcade launch failed");
		expect(failureParams.get("detail")).toBe(
			"Daemon started but failed to become healthy",
		);
		expect(window.loadedUrls).toHaveLength(1);
	});

	test("formats project registration failures as launch failures", async () => {
		launchArcadeMock.mockImplementationOnce(async () => {
			throw new Error("Project registration failed");
		});

		const window = await runNativeEntrypoint(["--project", "/tmp/project"]);
		const failureParams = parseLaunchViewUrl(window.loadedUrls.at(-1) ?? "");

		expect(failureParams.get("status")).toBe("failure");
		expect(failureParams.get("message")).toBe(
			"The native shell could not start or connect to Arcade for this launch.",
		);
		expect(failureParams.get("detail")).toBe("Project registration failed");
	});
});
