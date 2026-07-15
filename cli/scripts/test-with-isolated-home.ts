#!/usr/bin/env bun

import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import {
	basename,
	delimiter,
	dirname,
	isAbsolute,
	join,
	parse,
	relative,
	resolve,
} from "node:path";

export const TEST_SANDBOX_ENV_KEYS = [
	"HOME",
	"USERPROFILE",
	"HOMEDRIVE",
	"HOMEPATH",
	"XDG_CONFIG_HOME",
	"XDG_CACHE_HOME",
	"XDG_DATA_HOME",
	"XDG_STATE_HOME",
	"APPDATA",
	"LOCALAPPDATA",
	"TMPDIR",
	"TEMP",
	"TMP",
	"RP1_TEST_SANDBOX_HOME",
] as const;

const RETAINED_READ_ONLY_ENV_KEYS = new Set([
	"PATH",
	"NODE",
	"BUN",
	"PUPPETEER_EXECUTABLE_PATH",
]);
const MUTABLE_USER_STATE_ENV_KEYS = new Set([
	"AWS_CONFIG_FILE",
	"AWS_SHARED_CREDENTIALS_FILE",
	"AZURE_CONFIG_DIR",
	"BUN_INSTALL",
	"BUN_INSTALL_CACHE_DIR",
	"CARGO_HOME",
	"CLAUDE_CONFIG_DIR",
	"CODEX_HOME",
	"COREPACK_HOME",
	"DOCKER_CONFIG",
	"GOBIN",
	"GOMODCACHE",
	"GOPATH",
	"GRADLE_USER_HOME",
	"HISTFILE",
	"KUBECONFIG",
	"MAVEN_CONFIG",
	"NODE_REPL_HISTORY",
	"NPM_CONFIG_CACHE",
	"NPM_CONFIG_USERCONFIG",
	"OBSIDIAN_ROOT",
	"PIP_CACHE_DIR",
	"PIP_CONFIG_FILE",
	"PNPM_HOME",
	"PYTHONUSERBASE",
	"RUSTUP_HOME",
	"SSH_AUTH_SOCK",
	"UV_CACHE_DIR",
	"YARN_CACHE_FOLDER",
]);
const HOME_SCOPED_PATH_KEY =
	/(?:HOME|DIR|DIRECTORY|PATH|FILE|ROOT|CONFIG|CACHE|HISTORY|PREFIX|JSON|CWD)$/;
const OTHER_PATH_KEYS = new Set(["PWD", "OLDPWD", "_", "GOBIN"]);

export type TestSandboxEnvironmentKey = (typeof TEST_SANDBOX_ENV_KEYS)[number];
export type InheritedPathClassification =
	| "sandbox-rewritten"
	| "unset"
	| "retained-read-only";

export interface InheritedEnvironmentAudit {
	readonly environment: NodeJS.ProcessEnv;
	readonly classifications: Readonly<
		Record<string, InheritedPathClassification>
	>;
}

export interface TestSandbox {
	readonly root: string;
	readonly home: string;
	readonly environment: NodeJS.ProcessEnv &
		Readonly<Record<TestSandboxEnvironmentKey, string>>;
}

const isInside = (parent: string, child: string): boolean => {
	const relativePath = relative(parent, child);
	return (
		relativePath === "" ||
		(!relativePath.startsWith("..") && !isAbsolute(relativePath))
	);
};

const pathCandidates = (value: string, home: string): readonly string[] =>
	value
		.split(delimiter)
		.map((candidate) => candidate.trim())
		.filter((candidate) => candidate.length > 0)
		.flatMap((candidate) => {
			if (candidate === "~") return [home];
			if (candidate.startsWith("~/") || candidate.startsWith("~\\")) {
				return [join(home, candidate.slice(2))];
			}
			return isAbsolute(candidate) ? [candidate] : [];
		});

const canonicalizeWithExistingAncestor = async (
	path: string,
): Promise<string> => {
	let ancestor = resolve(path);
	const missingSuffix: string[] = [];

	while (true) {
		try {
			return resolve(await realpath(ancestor), ...missingSuffix);
		} catch (error) {
			const code =
				typeof error === "object" && error !== null && "code" in error
					? error.code
					: undefined;
			const parent = dirname(ancestor);
			if ((code !== "ENOENT" && code !== "ENOTDIR") || parent === ancestor) {
				throw error;
			}
			missingSuffix.unshift(basename(ancestor));
			ancestor = parent;
		}
	}
};

const namesPathInside = async (
	value: string,
	canonicalHome: string,
): Promise<boolean> => {
	for (const candidate of pathCandidates(value, canonicalHome)) {
		const canonicalCandidate = await canonicalizeWithExistingAncestor(
			candidate,
		).catch(() => canonicalHome);
		if (isInside(canonicalHome, canonicalCandidate)) return true;
	}
	return false;
};

export const auditInheritedTestEnvironment = async (
	inherited: NodeJS.ProcessEnv,
	callerHome: string,
): Promise<InheritedEnvironmentAudit> => {
	const canonicalHome = await realpath(callerHome).catch(() => {
		throw new Error(
			"Test environment audit failed: HOME classification=unclassified",
		);
	});
	const environment = { ...inherited };
	const classifications: Record<string, InheritedPathClassification> = {};
	const rewrittenKeys = new Set<string>(TEST_SANDBOX_ENV_KEYS);
	const declaredSandboxHome = inherited.RP1_TEST_SANDBOX_HOME;
	const callerHomeIsAlreadySandboxed = declaredSandboxHome
		? await realpath(declaredSandboxHome)
				.then((sandboxHome) => isInside(sandboxHome, canonicalHome))
				.catch(() => false)
		: false;

	for (const [key, value] of Object.entries(inherited)) {
		if (value === undefined) continue;
		const normalizedKey = key.toUpperCase();

		if (rewrittenKeys.has(normalizedKey)) {
			delete environment[key];
			classifications[key] = "sandbox-rewritten";
			continue;
		}
		if (RETAINED_READ_ONLY_ENV_KEYS.has(normalizedKey)) {
			classifications[key] = "retained-read-only";
			continue;
		}
		if (MUTABLE_USER_STATE_ENV_KEYS.has(normalizedKey)) {
			delete environment[key];
			classifications[key] = "unset";
			continue;
		}
		if (!(await namesPathInside(value, canonicalHome))) continue;
		if (callerHomeIsAlreadySandboxed) continue;
		if (
			HOME_SCOPED_PATH_KEY.test(normalizedKey) ||
			OTHER_PATH_KEYS.has(normalizedKey)
		) {
			delete environment[key];
			classifications[key] = "unset";
			continue;
		}

		throw new Error(
			`Test environment audit failed: ${key} classification=unclassified`,
		);
	}

	return { environment, classifications };
};

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
	const inheritedAudit = await auditInheritedTestEnvironment(
		process.env,
		homedir(),
	);
	const testBrowserExecutablePath =
		inheritedAudit.environment.RP1_TEST_BROWSER_EXECUTABLE_PATH ??
		(await resolveTestBrowserExecutablePath());
	const root = await realpath(
		await mkdtemp(join(tmpdir(), "rp1-test-sandbox-")),
	);
	const home = join(root, "home");
	const config = join(home, ".config");
	const cache = join(home, ".cache");
	const data = join(home, ".local", "share");
	const state = join(home, ".local", "state");
	const temp = join(home, ".tmp");
	const appData = join(home, ".appdata");
	const localAppData = join(home, ".localappdata");

	await Promise.all(
		[home, config, cache, data, state, temp, appData, localAppData].map(
			(path) => mkdir(path, { recursive: true }),
		),
	);
	const canonicalHome = await realpath(home);
	const windowsHome = homeDriveAndPath(canonicalHome);

	return {
		root,
		home: canonicalHome,
		environment: {
			...inheritedAudit.environment,
			...(testBrowserExecutablePath
				? { RP1_TEST_BROWSER_EXECUTABLE_PATH: testBrowserExecutablePath }
				: {}),
			HOME: canonicalHome,
			USERPROFILE: canonicalHome,
			HOMEDRIVE: windowsHome.drive,
			HOMEPATH: windowsHome.path,
			XDG_CONFIG_HOME: config,
			XDG_CACHE_HOME: cache,
			XDG_DATA_HOME: data,
			XDG_STATE_HOME: state,
			APPDATA: appData,
			LOCALAPPDATA: localAppData,
			TMPDIR: temp,
			TEMP: temp,
			TMP: temp,
			RP1_TEST_SANDBOX_HOME: canonicalHome,
		},
	};
};

const resolveTestBrowserExecutablePath = async (): Promise<
	string | undefined
> => {
	try {
		const { default: puppeteer } = await import("puppeteer");
		return await realpath(puppeteer.executablePath());
	} catch {
		// Browser-free test selections remain runnable when Puppeteer is not installed.
		return undefined;
	}
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
