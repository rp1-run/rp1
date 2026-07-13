#!/usr/bin/env bun

import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, parse } from "node:path";

export const TEST_SANDBOX_ENV_KEYS = [
	"HOME",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
	"APPDATA",
	"LOCALAPPDATA",
	"TMPDIR",
	"TEMP",
	"TMP",
	"RP1_TEST_SANDBOX_HOME",
] as const;

export type TestSandboxEnvironmentKey = (typeof TEST_SANDBOX_ENV_KEYS)[number];

export interface TestSandbox {
	readonly root: string;
	readonly home: string;
	readonly environment: NodeJS.ProcessEnv &
		Readonly<Record<TestSandboxEnvironmentKey, string>>;
}

const homeDriveAndPath = (
	home: string,
): { readonly drive: string; readonly path: string } => {
	if (process.platform !== "win32") {
		return { drive: "/", path: home };
	}

	const drive = parse(home).root.replace(/[\\/]$/, "");
	return { drive, path: home.slice(drive.length) || "\\" };
};

export const createTestSandbox = async (): Promise<TestSandbox> => {
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "rp1-test-sandbox-")),
	);
	const home = join(root, "home");
	const config = join(home, ".config");
	const cache = join(home, ".cache");
	const temp = join(home, ".tmp");
	const appData = join(home, ".appdata");
	const localAppData = join(home, ".localappdata");

	await Promise.all(
		[home, config, cache, temp, appData, localAppData].map((path) =>
			mkdir(path, { recursive: true }),
		),
	);
	const canonicalHome = await realpath(home);
	const windowsHome = homeDriveAndPath(canonicalHome);

	return {
		root,
		home: canonicalHome,
		environment: {
			...process.env,
			HOME: canonicalHome,
			USERPROFILE: canonicalHome,
			HOMEDRIVE: windowsHome.drive,
			HOMEPATH: windowsHome.path,
			XDG_CONFIG_HOME: config,
			XDG_CACHE_HOME: cache,
			APPDATA: appData,
			LOCALAPPDATA: localAppData,
			TMPDIR: temp,
			TEMP: temp,
			TMP: temp,
			RP1_TEST_SANDBOX_HOME: canonicalHome,
		},
	};
};

export const runTestsWithIsolatedHome = async (
	testArgs: readonly string[],
): Promise<number> => {
	const sandbox = await createTestSandbox();

	try {
		const child = Bun.spawn([process.execPath, "test", ...testArgs], {
			env: sandbox.environment,
			stdin: "inherit",
			stdout: "inherit",
			stderr: "inherit",
		});
		const forwardInterrupt = () => child.kill("SIGINT");
		const forwardTermination = () => child.kill("SIGTERM");
		process.once("SIGINT", forwardInterrupt);
		process.once("SIGTERM", forwardTermination);

		try {
			return await child.exited;
		} finally {
			process.off("SIGINT", forwardInterrupt);
			process.off("SIGTERM", forwardTermination);
		}
	} finally {
		await rm(sandbox.root, { recursive: true, force: true }).catch((error) => {
			console.warn(
				`Test sandbox cleanup failed for ${sandbox.root}: ${String(error)}`,
			);
		});
	}
};

const main = async (): Promise<void> => {
	const args = process.argv.slice(2);
	const testArgs = args[0] === "--" ? args.slice(1) : args;
	process.exitCode = await runTestsWithIsolatedHome(testArgs);
};

if (import.meta.main) {
	await main();
}
