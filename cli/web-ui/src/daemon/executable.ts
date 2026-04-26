import { accessSync, constants, statSync } from "node:fs";
import { delimiter, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export type DaemonExecutableSource =
	| "explicit"
	| "environment"
	| "bundled"
	| "development"
	| "compiled"
	| "path";

export interface CheckedDaemonExecutableLocation {
	readonly source: DaemonExecutableSource;
	readonly path: string;
	readonly status: "missing" | "not_file" | "not_executable";
}

export interface DaemonExecutableResolutionOptions {
	readonly explicitPath?: string;
	readonly native?: boolean;
	readonly env?: Record<string, string | undefined>;
	readonly cwd?: string;
	readonly developmentExecutablePath?: string;
	readonly processExecPath?: string;
	readonly platform?: NodeJS.Platform;
}

export class DaemonExecutableResolutionError extends Error {
	readonly checkedLocations: readonly CheckedDaemonExecutableLocation[];

	constructor(checkedLocations: readonly CheckedDaemonExecutableLocation[]) {
		super(formatCheckedLocations(checkedLocations));
		this.name = "DaemonExecutableResolutionError";
		this.checkedLocations = checkedLocations;
	}
}

interface Candidate {
	readonly source: DaemonExecutableSource;
	readonly path: string;
}

const NATIVE_EXECUTABLE_ENV = "RP1_NATIVE_RP1_EXECUTABLE";

const formatCheckedLocations = (
	locations: readonly CheckedDaemonExecutableLocation[],
): string => {
	if (locations.length === 0) {
		return `Unable to resolve rp1 executable. Provide --rp1-executable <path> or set ${NATIVE_EXECUTABLE_ENV}.`;
	}

	const checked = locations
		.map(
			(location) => `${location.source}: ${location.path} (${location.status})`,
		)
		.join("; ");
	return `Unable to resolve rp1 executable. Checked ${checked}. Provide --rp1-executable <path> or set ${NATIVE_EXECUTABLE_ENV}.`;
};

const moduleRepoRoot = (): string =>
	resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const normalizeCandidatePath = (path: string, cwd: string): string =>
	resolve(cwd, path);

const checkExecutable = (
	candidate: Candidate,
	platform: NodeJS.Platform,
): CheckedDaemonExecutableLocation | null => {
	try {
		const stat = statSync(candidate.path);
		if (!stat.isFile()) {
			return {
				...candidate,
				status: "not_file",
			};
		}

		if (platform !== "win32") {
			try {
				accessSync(candidate.path, constants.X_OK);
			} catch {
				return {
					...candidate,
					status: "not_executable",
				};
			}
		}

		return null;
	} catch {
		return {
			...candidate,
			status: "missing",
		};
	}
};

const tryCandidate = (
	candidate: Candidate,
	platform: NodeJS.Platform,
	checkedLocations: CheckedDaemonExecutableLocation[],
): string | null => {
	const failed = checkExecutable(candidate, platform);
	if (!failed) return candidate.path;
	checkedLocations.push(failed);
	return null;
};

const resolveOverrideCandidate = (
	candidate: Candidate,
	platform: NodeJS.Platform,
): string => {
	const failed = checkExecutable(candidate, platform);
	if (failed) {
		throw new DaemonExecutableResolutionError([failed]);
	}
	return candidate.path;
};

const pathExecutableNames = (platform: NodeJS.Platform): readonly string[] =>
	platform === "win32" ? ["rp1.exe", "rp1.cmd", "rp1.bat", "rp1"] : ["rp1"];

const findPathExecutable = (
	env: Record<string, string | undefined>,
	platform: NodeJS.Platform,
): readonly Candidate[] => {
	const pathValue = env.PATH ?? "";
	if (!pathValue) return [];

	const names = pathExecutableNames(platform);
	return pathValue
		.split(delimiter)
		.filter((entry) => entry.length > 0)
		.flatMap((entry) =>
			names.map((name) => ({
				source: "path" as const,
				path: join(entry, name),
			})),
		);
};

const uniqueCandidates = (
	candidates: readonly Candidate[],
): readonly Candidate[] => {
	const seen = new Set<string>();
	const unique: Candidate[] = [];
	for (const candidate of candidates) {
		const key = `${candidate.source}:${candidate.path}`;
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(candidate);
	}
	return unique;
};

export function resolveDaemonExecutablePath(
	options: DaemonExecutableResolutionOptions = {},
): string {
	const native = options.native ?? false;
	const env = options.env ?? process.env;
	const cwd = options.cwd ?? process.cwd();
	const developmentExecutablePath = options.developmentExecutablePath
		? normalizeCandidatePath(options.developmentExecutablePath, cwd)
		: join(moduleRepoRoot(), "bin", "rp1");
	const processExecPath = options.processExecPath ?? process.execPath;
	const platform = options.platform ?? process.platform;
	const checkedLocations: CheckedDaemonExecutableLocation[] = [];
	const candidates: Candidate[] = [];

	const explicitPath = options.explicitPath?.trim();
	if (explicitPath) {
		return resolveOverrideCandidate(
			{
				source: "explicit",
				path: normalizeCandidatePath(explicitPath, cwd),
			},
			platform,
		);
	}

	if (native) {
		const envPath = env[NATIVE_EXECUTABLE_ENV]?.trim();
		if (envPath) {
			return resolveOverrideCandidate(
				{
					source: "environment",
					path: normalizeCandidatePath(envPath, cwd),
				},
				platform,
			);
		}
	}

	candidates.push(
		{
			source: "bundled",
			path: join(dirname(processExecPath), "rp1"),
		},
		{
			source: "development",
			path: developmentExecutablePath,
		},
	);

	if (!native) {
		if (processExecPath.endsWith("rp1")) {
			candidates.push({
				source: "compiled",
				path: processExecPath,
			});
		}
		candidates.push(...findPathExecutable(env, platform));
	}

	for (const candidate of uniqueCandidates(candidates)) {
		const resolved = tryCandidate(candidate, platform, checkedLocations);
		if (resolved) return resolved;
	}

	throw new DaemonExecutableResolutionError(checkedLocations);
}
