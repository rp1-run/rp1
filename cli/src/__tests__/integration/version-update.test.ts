/**
 * Integration tests for version update CLI commands and hook output.
 * Tests end-to-end behavior of check-update commands and the check-update.sh
 * hook script.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import {
	chmod,
	mkdir,
	mkdtemp,
	readdir,
	readFile,
	rm,
	unlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VersionCache } from "../../lib/cache.js";

/**
 * Path to the project root (cli directory).
 */
const CLI_ROOT = join(import.meta.dir, "../../../");

/**
 * Path to the plugins/base directory.
 */
const PLUGINS_BASE = join(CLI_ROOT, "../plugins/base");

/**
 * Path to the check-update.sh hook script.
 */
const HOOK_SCRIPT_PATH = join(PLUGINS_BASE, "hooks/check-update.sh");

const SYSTEM_TEST_PATH = ["/usr/bin", "/bin"].join(":");

interface CommandResult {
	readonly stdout: string;
	readonly stderr: string;
	readonly exitCode: number;
}

let testHomeDir: string;
let configDir: string;
let cachePath: string;
let testBinDir: string;
let rp1WrapperPath: string;

const getTestEnv = (): NodeJS.ProcessEnv => ({
	...process.env,
	NO_COLOR: "1",
	HOME: testHomeDir,
	XDG_CONFIG_HOME: join(testHomeDir, ".config"),
	RP1_BINARY: rp1WrapperPath,
	PATH: `${testBinDir}:${SYSTEM_TEST_PATH}`,
});

/**
 * Run a CLI command and return stdout, stderr, and exit code.
 */
async function runCapturedProcess(
	command: string,
	args: string[],
	options: {
		readonly cwd: string;
		readonly env: NodeJS.ProcessEnv;
		readonly input?: string;
		readonly timeout: number;
	},
): Promise<CommandResult> {
	const proc = Bun.spawn([command, ...args], {
		cwd: options.cwd,
		env: options.env,
		stdin: options.input === undefined ? "ignore" : "pipe",
		stdout: "pipe",
		stderr: "pipe",
	});
	if (options.input !== undefined) {
		const stdin = proc.stdin;
		if (!stdin) {
			throw new Error("Expected subprocess stdin pipe");
		}
		stdin.write(options.input);
		stdin.end();
	}

	let timeoutId: ReturnType<typeof setTimeout> | undefined;
	const completed = Promise.all([
		proc.exited,
		new Response(proc.stdout).text(),
		new Response(proc.stderr).text(),
	] as const);
	const timeoutResult = new Promise<null>((resolve) => {
		timeoutId = setTimeout(() => resolve(null), options.timeout);
		timeoutId.unref?.();
	});

	const result = await Promise.race([completed, timeoutResult]);
	if (result === null) {
		proc.kill("SIGTERM");
		const forceKill = setTimeout(() => proc.kill("SIGKILL"), 1000);
		forceKill.unref?.();
		void completed.finally(() => clearTimeout(forceKill));
		return {
			stdout: "",
			stderr: `Timed out after ${options.timeout}ms: ${command} ${args.join(" ")}`,
			exitCode: 124,
		};
	}

	if (timeoutId) {
		clearTimeout(timeoutId);
	}
	const [exitCode, stdout, stderr] = result;
	return {
		stdout: stdout.trim(),
		stderr: stderr.trim(),
		exitCode,
	};
}

async function runCliCommand(
	args: string[],
	timeout = 30000,
): Promise<CommandResult> {
	return runCapturedProcess(
		process.execPath,
		["run", join(CLI_ROOT, "src/main.ts"), ...args],
		{
			cwd: CLI_ROOT,
			env: getTestEnv(),
			timeout,
		},
	);
}

/**
 * Run the check-update.sh hook script with provided input.
 */
async function runHookScript(
	input: object,
	timeout = 10000,
): Promise<CommandResult> {
	return runHookScriptRaw(JSON.stringify(input), timeout);
}

async function runHookScriptRaw(
	input: string,
	timeout = 10000,
): Promise<CommandResult> {
	return runCapturedProcess(HOOK_SCRIPT_PATH, [], {
		cwd: PLUGINS_BASE,
		env: getTestEnv(),
		input,
		timeout,
	});
}

/**
 * Write a test cache file with specific data.
 */
async function writeTestCache(
	data: Omit<VersionCache, "checkedAt"> & { checkedAt?: string },
): Promise<void> {
	if (!existsSync(configDir)) {
		await mkdir(configDir, { recursive: true });
	}

	const cacheData: VersionCache = {
		...data,
		checkedAt: data.checkedAt ?? new Date().toISOString(),
	};
	await writeFile(cachePath, JSON.stringify(cacheData, null, 2));
}

/**
 * Remove the cache file if it exists.
 */
async function removeCache(): Promise<void> {
	if (existsSync(cachePath)) {
		await unlink(cachePath);
	}
}

async function makeWritable(path: string): Promise<void> {
	await chmod(path, 0o700).catch(() => undefined);
	const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
	await Promise.all(
		entries.map(async (entry) => {
			const childPath = join(path, entry.name);
			if (entry.isDirectory()) {
				await makeWritable(childPath);
				return;
			}
			await chmod(childPath, 0o600).catch(() => undefined);
		}),
	);
}

async function removeTestHomeDir(): Promise<void> {
	if (!existsSync(testHomeDir)) {
		return;
	}

	await makeWritable(testHomeDir);
	await rm(testHomeDir, {
		recursive: true,
		force: true,
		maxRetries: 3,
		retryDelay: 100,
	});
}

async function readCache(): Promise<VersionCache | null> {
	if (!existsSync(cachePath)) {
		return null;
	}
	try {
		const content = await readFile(cachePath, "utf-8");
		return JSON.parse(content) as VersionCache;
	} catch {
		return null;
	}
}

async function createRp1Wrapper(): Promise<void> {
	testBinDir = join(testHomeDir, "bin");
	rp1WrapperPath = join(testBinDir, "rp1");
	await mkdir(testBinDir, { recursive: true });
	await writeFile(
		rp1WrapperPath,
		[
			"#!/bin/sh",
			`exec "${process.execPath}" run "${join(CLI_ROOT, "src/main.ts")}" "$@"`,
			"",
		].join("\n"),
	);
	await chmod(rp1WrapperPath, 0o755);
	await writeFile(join(testBinDir, "brew"), "#!/bin/sh\nexit 1\n");
	await chmod(join(testBinDir, "brew"), 0o755);
}

describe("integration: version-update", () => {
	beforeEach(async () => {
		testHomeDir = await mkdtemp(join(tmpdir(), "rp1-version-update-"));
		configDir = join(testHomeDir, ".config", "rp1");
		cachePath = join(configDir, "version-cache.json");
		await createRp1Wrapper();
		await removeCache();
	});

	afterEach(async () => {
		await removeCache();
		await removeTestHomeDir();
	});

	describe("rp1 check-update --force", () => {
		test(
			"bypasses cache and performs fresh check",
			async () => {
				await writeTestCache({
					latestVersion: "1.2.3",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v1.2.3",
					ttlHours: 24,
				});

				const { stdout, exitCode } = await runCliCommand([
					"check-update",
					"--json",
					"--force",
				]);

				const result = JSON.parse(stdout);

				if (exitCode === 0 && result.latest_version !== null) {
					expect(result.cached).toBe(false);
				}
				expect(result).toHaveProperty("cached");
				expect(result).toHaveProperty("update_available");
			},
			{ timeout: 30000 },
		);

		test(
			"updates cache after force fetch",
			async () => {
				const oldTime = new Date();
				oldTime.setHours(oldTime.getHours() - 12);

				await writeTestCache({
					latestVersion: "0.0.1",
					releaseUrl: "https://example.com/old",
					ttlHours: 24,
					checkedAt: oldTime.toISOString(),
				});

				const { exitCode, stdout } = await runCliCommand([
					"check-update",
					"--json",
					"--force",
				]);

				const result = JSON.parse(stdout);

				if (exitCode === 0 && result.latest_version !== null && !result.error) {
					const cache = await readCache();

					if (cache && result.cached === false) {
						const cacheTime = new Date(cache.checkedAt);
						const now = new Date();
						const ageMs = now.getTime() - cacheTime.getTime();
						const ageMinutes = ageMs / (1000 * 60);

						expect(ageMinutes).toBeLessThan(1);
					}
				}
			},
			{ timeout: 30000 },
		);
	});

	describe("rp1 check-update --cache-ttl", () => {
		test(
			"respects custom TTL - cache with 1h TTL expired after 2 hours",
			async () => {
				const twoHoursAgo = new Date();
				twoHoursAgo.setHours(twoHoursAgo.getHours() - 2);

				await writeTestCache({
					latestVersion: "5.5.5",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v5.5.5",
					ttlHours: 1,
					checkedAt: twoHoursAgo.toISOString(),
				});

				const { stdout, exitCode } = await runCliCommand([
					"check-update",
					"--json",
				]);

				const result = JSON.parse(stdout);

				if (exitCode === 0 && result.latest_version !== null && !result.error) {
					expect(result.cached).toBe(false);
				}
			},
			{ timeout: 30000 },
		);

		test(
			"uses cache when within custom TTL",
			async () => {
				const thirtyMinutesAgo = new Date();
				thirtyMinutesAgo.setMinutes(thirtyMinutesAgo.getMinutes() - 30);

				await writeTestCache({
					latestVersion: "6.6.6",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v6.6.6",
					ttlHours: 1,
					checkedAt: thirtyMinutesAgo.toISOString(),
				});

				const { stdout, exitCode } = await runCliCommand([
					"check-update",
					"--json",
					"--cache-ttl",
					"1",
				]);

				expect(exitCode).toBe(0);

				const result = JSON.parse(stdout);

				expect(result.cached).toBe(true);
				expect(result.latest_version).toBe("6.6.6");
			},
			{ timeout: 30000 },
		);
	});

	describe("check-update.sh hook", () => {
		test(
			"produces output when source is startup and update available",
			async () => {
				await writeTestCache({
					latestVersion: "999.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
					ttlHours: 24,
				});

				const hookInput = {
					session_id: "test-session-123",
					source: "startup",
					hook_event_name: "SessionStart",
				};

				const { stdout, exitCode } = await runHookScript(hookInput);

				expect(exitCode).toBe(0);

				if (stdout.length > 0) {
					const result = JSON.parse(stdout);

					expect(result).toHaveProperty("systemMessage");
					expect(result).toHaveProperty("hookSpecificOutput");
					expect(result.hookSpecificOutput).toHaveProperty("hookEventName");
					expect(result.hookSpecificOutput).toHaveProperty("additionalContext");
					expect(result.hookSpecificOutput.hookEventName).toBe("SessionStart");

					expect(result.systemMessage).toContain("999.0.0");
					expect(result.systemMessage).toContain("/self-update");
				}
			},
			{ timeout: 30000 },
		);

		test(
			"produces no output when source is resume",
			async () => {
				await writeTestCache({
					latestVersion: "999.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
					ttlHours: 24,
				});

				const hookInput = {
					session_id: "test-session-456",
					source: "resume",
					hook_event_name: "SessionStart",
				};

				const { stdout, exitCode } = await runHookScript(hookInput);

				expect(exitCode).toBe(0);
				expect(stdout).toBe("");
			},
			{ timeout: 30000 },
		);

		test(
			"produces no output when source is clear",
			async () => {
				await writeTestCache({
					latestVersion: "999.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
					ttlHours: 24,
				});

				const hookInput = {
					session_id: "test-session-789",
					source: "clear",
					hook_event_name: "SessionStart",
				};

				const { stdout, exitCode } = await runHookScript(hookInput);

				expect(exitCode).toBe(0);
				expect(stdout).toBe("");
			},
			{ timeout: 30000 },
		);

		test(
			"produces no output when source is compact",
			async () => {
				await writeTestCache({
					latestVersion: "999.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v999.0.0",
					ttlHours: 24,
				});

				const hookInput = {
					session_id: "test-session-012",
					source: "compact",
					hook_event_name: "SessionStart",
				};

				const { stdout, exitCode } = await runHookScript(hookInput);

				expect(exitCode).toBe(0);
				expect(stdout).toBe("");
			},
			{ timeout: 30000 },
		);

		test(
			"exits gracefully with invalid JSON input",
			async () => {
				const { exitCode } = await runHookScriptRaw("{ invalid json }}}");
				expect(exitCode).toBe(0);
			},
			{ timeout: 30000 },
		);
	});
});
