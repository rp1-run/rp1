import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import * as childProcess from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import * as os from "node:os";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	executeSelfUpdate,
	executeUpdateAction,
	formatCheckOutput,
	formatCheckOutputHookText,
	formatCheckOutputJson,
	updateCommand,
} from "../../commands/update/index.js";

const updateAvailable = {
	currentVersion: "1.0.0",
	latestVersion: "1.2.0",
	updateAvailable: true,
	releaseUrl: "https://example.test/release",
	error: null,
	cached: false,
	cacheAgeHours: null,
	cacheExpiresInHours: null,
};

const upToDateCached = {
	...updateAvailable,
	latestVersion: "1.0.0",
	updateAvailable: false,
	cached: true,
	cacheAgeHours: 0.5,
	cacheExpiresInHours: 23.5,
};

const staleFence = {
	hasProject: true,
	oldestVersion: "0.7.0",
	latestFenceVersion: "0.7.5",
	staleFiles: ["AGENTS.md"],
	currentFiles: [],
};

const mockExecSync = (implementation: (cmd: string) => string): void => {
	spyOn(childProcess, "execSync").mockImplementation(
		implementation as unknown as typeof childProcess.execSync,
	);
};

describe("update output formatting", () => {
	const originalLog = console.log;
	const originalError = console.error;
	const originalExit = process.exit;
	const originalHome = process.env.HOME;
	const originalPath = process.env.PATH;
	let tempDir: string;
	let logs: string[];
	let errors: string[];

	class ProcessExit extends Error {
		readonly code: number;

		constructor(code: number | string | null | undefined) {
			super(`process.exit(${code ?? 0})`);
			this.code = Number(code ?? 0);
		}
	}

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-update-coverage-"));
		process.env.HOME = tempDir;
		logs = [];
		errors = [];
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
	});

	afterEach(async () => {
		console.log = originalLog;
		console.error = originalError;
		process.exit = originalExit;
		if (originalHome === undefined) {
			delete process.env.HOME;
		} else {
			process.env.HOME = originalHome;
		}
		if (originalPath === undefined) {
			delete process.env.PATH;
		} else {
			process.env.PATH = originalPath;
		}
		mock.restore();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("formats check output as hook text with stanza staleness context", () => {
		expect(formatCheckOutputHookText(updateAvailable, staleFence)).toBe(
			"rp1 update available: v1.0.0 -> v1.2.0 | Run /self-update to update | stanza update: run rp1 migrate",
		);
		expect(
			formatCheckOutputHookText(
				{ ...updateAvailable, error: "network unavailable" },
				staleFence,
			),
		).toBeNull();
	});

	test("formats check output as JSON with fence metadata", () => {
		formatCheckOutputJson(updateAvailable, staleFence);

		expect(JSON.parse(logs.at(-1) ?? "{}")).toMatchObject({
			current_version: "1.0.0",
			latest_version: "1.2.0",
			update_available: true,
			fence_version: {
				current: "0.7.0",
				latest: "0.7.5",
				update_available: true,
				stale_files: ["AGENTS.md"],
			},
		});
	});

	test("formats human output for available, current, cached, and error states", () => {
		formatCheckOutput(updateAvailable, false, staleFence);
		let output = logs.join("\n");
		expect(output).toContain("A new version is available");
		expect(output).toContain("Stanza configuration is outdated");

		logs = [];
		formatCheckOutput(upToDateCached, false);
		output = logs.join("\n");
		expect(output).toContain("You are up to date");
		expect(output).toContain("cached 30 minutes ago");

		logs = [];
		formatCheckOutput(
			{ ...updateAvailable, error: "registry unavailable" },
			false,
		);
		expect(logs.join("\n")).toContain("Warning:");
		expect(logs.join("\n")).toContain("registry unavailable");
	});

	test("update command help documents lifecycle and plugin subcommands", () => {
		const help = updateCommand.helpInformation();

		expect(help).toContain("plugins [options] [tool]");
		expect(help).toContain("Update rp1 CLI and/or plugins");
		expect(help).toContain("--format");
	});

	test("check mode rejects incompatible and unknown output formats before network work", async () => {
		await expect(
			executeUpdateAction(
				{
					check: true,
					dryRun: false,
					force: false,
					yes: false,
					json: true,
					format: "hook-text",
				},
				undefined,
				false,
			),
		).rejects.toMatchObject({ code: 1 });
		expect(errors.at(-1)).toContain("--json and --format");

		errors = [];
		await expect(
			executeUpdateAction(
				{
					check: true,
					dryRun: false,
					force: false,
					yes: false,
					format: "xml",
				},
				undefined,
				false,
			),
		).rejects.toMatchObject({ code: 1 });
		expect(errors.at(-1)).toContain("Invalid --format value");
	});

	test("check mode formats cached update results as JSON and hook text", async () => {
		await mkdir(join(tempDir, ".config", "rp1"), { recursive: true });
		await writeFile(
			join(tempDir, ".config", "rp1", "version-cache.json"),
			JSON.stringify({
				latestVersion: "99.99.99",
				releaseUrl: "https://example.test/rp1/v99.99.99",
				checkedAt: new Date().toISOString(),
				ttlHours: 24,
			}),
		);
		await expect(
			executeUpdateAction(
				{
					check: true,
					dryRun: false,
					force: false,
					yes: false,
					json: true,
				},
				undefined,
				false,
			),
		).rejects.toMatchObject({ code: 1 });
		const json = JSON.parse(logs.at(0) ?? "{}") as {
			latest_version: string;
			update_available: boolean;
			cached: boolean;
		};
		expect(json).toMatchObject({
			latest_version: "99.99.99",
			update_available: true,
			cached: true,
		});

		logs = [];
		await expect(
			executeUpdateAction(
				{
					check: true,
					dryRun: false,
					force: false,
					yes: false,
					format: "hook-text",
				},
				undefined,
				false,
			),
		).rejects.toMatchObject({ code: 1 });
		expect(logs.at(0)).toContain("rp1 update available");
		expect(logs.at(0)).toContain("v99.99.99");
	});

	test("self-update returns manual-install guidance when no package manager owns rp1", async () => {
		spyOn(os, "platform").mockReturnValue("darwin");
		mockExecSync((cmd: string) => {
			if (cmd === "which brew") {
				throw new Error("brew not found");
			}
			throw new Error(`Unexpected command: ${cmd}`);
		});

		const result = await executeSelfUpdate(
			{ dryRun: false, force: true },
			undefined,
			false,
		);

		expect(result).toEqual({
			success: false,
			exitCode: 2,
			updatedBinary: false,
		});
		expect(logs.join("\n")).toContain("Automatic update is not available");
	});

	test("self-update dry-run reports detected package manager without mutating", async () => {
		spyOn(os, "platform").mockReturnValue("darwin");
		mockExecSync((cmd: string) => {
			if (cmd === "which brew") {
				return "/opt/homebrew/bin/brew";
			}
			if (cmd === "brew list rp1") {
				return "/opt/homebrew/Cellar/rp1/1.0.0";
			}
			throw new Error(`Unexpected command: ${cmd}`);
		});

		const result = await executeSelfUpdate(
			{ dryRun: true, force: true },
			undefined,
			false,
		);

		expect(result).toEqual({
			success: true,
			exitCode: 0,
			updatedBinary: false,
		});
		expect(logs.join("\n")).toContain("Dry run mode");
		expect(logs.join("\n")).toContain("brew upgrade rp1");
	});

	test("self-update reports package manager failures with manual fallback command", async () => {
		spyOn(os, "platform").mockReturnValue("darwin");
		mockExecSync((cmd: string) => {
			if (cmd === "which brew") {
				return "/opt/homebrew/bin/brew";
			}
			if (cmd === "brew list rp1") {
				return "/opt/homebrew/Cellar/rp1/1.0.0";
			}
			if (cmd === "brew upgrade rp1") {
				throw new Error("upgrade failed");
			}
			throw new Error(`Unexpected command: ${cmd}`);
		});

		const result = await executeSelfUpdate(
			{ dryRun: false, force: true },
			undefined,
			false,
		);

		expect(result).toEqual({
			success: false,
			exitCode: 1,
			updatedBinary: false,
		});
		expect(errors.join("\n")).toContain("Update failed");
		expect(logs.join("\n")).toContain("brew upgrade rp1");
	});

	test("self-update records cache and success output after a package manager upgrade", async () => {
		spyOn(os, "platform").mockReturnValue("darwin");
		mockExecSync((cmd: string) => {
			if (cmd === "which brew") {
				return "/opt/homebrew/bin/brew";
			}
			if (cmd === "brew list rp1") {
				return "/opt/homebrew/Cellar/rp1/1.0.0";
			}
			if (cmd === "brew upgrade rp1") {
				return "upgraded rp1";
			}
			if (cmd === "rp1 --version") {
				return "rp1 2.0.0";
			}
			throw new Error(`Unexpected command: ${cmd}`);
		});

		const result = await executeSelfUpdate(
			{ dryRun: false, force: true },
			undefined,
			false,
		);

		expect(result).toEqual({
			success: true,
			exitCode: 0,
			updatedBinary: true,
		});
		expect(logs.join("\n")).toContain("Successfully updated rp1");
	});

	test("dry-run update reports plugin detection failure after self-update preview", async () => {
		process.env.PATH = tempDir;
		spyOn(os, "platform").mockReturnValue("darwin");
		mockExecSync((cmd: string) => {
			if (cmd === "which brew") {
				return "/opt/homebrew/bin/brew";
			}
			if (cmd === "brew list rp1") {
				return "/opt/homebrew/Cellar/rp1/1.0.0";
			}
			throw new Error(`Unexpected command: ${cmd}`);
		});

		await expect(
			executeUpdateAction(
				{
					check: false,
					dryRun: true,
					force: true,
					yes: true,
				},
				undefined,
				false,
			),
		).rejects.toMatchObject({ code: 1 });

		const output = logs.join("\n");
		expect(output).toContain("Dry run mode - showing what would be done");
		expect(output).toContain("Updating plugins for detected tools");
		expect(output).toContain("Skipping project migrations");
	});
});
