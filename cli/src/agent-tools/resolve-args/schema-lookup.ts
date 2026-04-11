/**
 * Schema file lookup for resolve-args.
 * Resolves a skill/agent namespace name (e.g., "rp1-dev:build") to
 * the asset path by searching the bundled manifest (production) or
 * reading bundle-manifest.json from dist/ (development).
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CanonicalName } from "../../../shared/canonical-name.js";
import {
	parseUserFacing,
	toCanonicalString,
	toPluginName,
	toUserFacing,
} from "../../../shared/canonical-name.js";
import type { CLIError } from "../../../shared/errors.js";
import { notFoundError, usageError } from "../../../shared/errors.js";
import type { BundledPlugin } from "../../assets/reader.js";
import {
	collectPlatformPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../../assets/reader.js";

/**
 * @deprecated Use {@link parseUserFacing} from canonical-name.ts directly.
 * Kept for backwards compatibility with existing test imports.
 */
export const parseNamespace = parseUserFacing;

/** @deprecated Use {@link CanonicalName} from canonical-name.ts directly. */
export type ParsedNamespace = CanonicalName;

/**
 * Match a skill entry by canonical artifact name.
 * Entry names are "{prefix}{artifact}/SKILL.md" where prefix is "" or "rp1-".
 */
const matchSkillEntry = (
	entry: { name: string },
	artifact: string,
): boolean => {
	if (!entry.name.endsWith("/SKILL.md")) return false;
	const dirName = entry.name.slice(0, -"/SKILL.md".length);
	const baseName = dirName.includes("/") ? dirName.split("/").pop()! : dirName;
	const canonical = baseName.replace(/^rp1-/, "");
	return canonical === artifact;
};

/**
 * Match an agent entry by canonical artifact name.
 * Entry names are "{artifact}" with .md or .toml extension.
 */
const matchAgentEntry = (
	entry: { name: string },
	artifact: string,
): boolean => {
	const name = entry.name.replace(/\.(md|toml)$/, "");
	return name === artifact;
};

/**
 * Search a plugin's skills and agents for a matching entry.
 * Returns the entry path on match, or null.
 */
const findInPlugin = (
	plugin: BundledPlugin,
	artifact: string,
): string | null => {
	const skillEntry = plugin.skills.find((e) => matchSkillEntry(e, artifact));
	if (skillEntry) return skillEntry.path;

	const agentEntry = plugin.agents.find((e) => matchAgentEntry(e, artifact));
	if (agentEntry) return agentEntry.path;

	return null;
};

/**
 * Find a skill or agent in the embedded manifest by canonical name.
 * Searches all platforms for a matching plugin and artifact.
 * Returns the embedded blob path on success.
 */
const orderPlatformEntries = <T extends readonly [string, ...unknown[]]>(
	entries: readonly T[],
	platformHint?: string,
): readonly T[] => {
	if (!platformHint) return entries;

	const preferred = entries.filter(
		([platformName]) => platformName === platformHint,
	);
	const remaining = entries.filter(
		([platformName]) => platformName !== platformHint,
	);
	return [...preferred, ...remaining];
};

const findInBundledManifest = (
	name: CanonicalName,
	platformHint?: string,
): E.Either<CLIError, string> => {
	const pluginName = toPluginName(name);

	const assetsResult = getBundledAssets();
	if (assetsResult._tag === "Left") return assetsResult;

	for (const [, platform] of orderPlatformEntries(
		Object.entries(assetsResult.right.platforms),
		platformHint,
	)) {
		if (!platform) continue;
		const plugin = collectPlatformPlugins(platform).find(
			(p) => p.name === pluginName,
		);
		if (!plugin) continue;

		const path = findInPlugin(plugin, name.artifact);
		if (path) return E.right(path);
	}

	return E.left(
		notFoundError(
			toUserFacing(name),
			`Could not find schema for "${toCanonicalString(name)}" in the embedded manifest.`,
		),
	);
};

/**
 * Derive the repository root from this module's location.
 * Path: cli/src/agent-tools/resolve-args/ -> 4 levels up -> repo root
 */
const getRepoRoot = (): string => {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return join(currentDir, "..", "..", "..", "..");
};

/** Entry in a disk bundle manifest. */
interface DiskManifestEntry {
	name: string;
	path: string;
}

/** Plugin in a disk bundle manifest. */
interface DiskManifestPlugin {
	name: string;
	skills: DiskManifestEntry[];
	agents: DiskManifestEntry[];
}

/** Minimal manifest structure read from dist bundle-manifest.json. */
interface DiskManifest {
	plugins: Record<string, DiskManifestPlugin>;
}

/**
 * Dev-mode fallback: read bundle-manifest.json files from dist/ and search them.
 * Returns the absolute filesystem path to the matching skill/agent file.
 */
const findInDevManifests = async (
	name: CanonicalName,
	platformHint?: string,
): Promise<string | null> => {
	const pluginName = toPluginName(name);
	const repoRoot = getRepoRoot();
	const distDir = join(repoRoot, "dist");

	let platformDirs: string[];
	try {
		const { readdir } = await import("node:fs/promises");
		platformDirs = await readdir(distDir);
	} catch {
		return null;
	}

	for (const platformDir of orderPlatformEntries(
		platformDirs.map((platformDir) => [platformDir] as const),
		platformHint,
	).map(([platformDir]) => platformDir)) {
		const manifestPath = join(distDir, platformDir, "bundle-manifest.json");
		let manifest: DiskManifest;
		try {
			const content = await readFile(manifestPath, "utf-8");
			manifest = JSON.parse(content) as DiskManifest;
		} catch {
			continue;
		}

		const plugin = Object.values(manifest.plugins).find(
			(p) => p.name === pluginName,
		);
		if (!plugin) continue;

		const skillEntry = (plugin.skills ?? []).find((e) =>
			matchSkillEntry(e, name.artifact),
		);
		if (skillEntry) {
			return join(distDir, platformDir, skillEntry.path);
		}

		const agentEntry = (plugin.agents ?? []).find((e) =>
			matchAgentEntry(e, name.artifact),
		);
		if (agentEntry) {
			return join(distDir, platformDir, agentEntry.path);
		}
	}

	return null;
};

/**
 * Check if a file exists and is accessible.
 */
const fileExists = async (path: string): Promise<boolean> => {
	try {
		const s = await stat(path);
		return s.isFile();
	} catch {
		return false;
	}
};

/**
 * Resolve a canonical name to a schema file path.
 * Uses the embedded manifest (production) or dist/ bundle-manifest.json files (development).
 */
export const resolveSchemaPath = (
	name: CanonicalName,
	platformHint?: string,
): TE.TaskEither<CLIError, string> => {
	// Production: use embedded manifest
	if (hasBundledAssets()) {
		return TE.fromEither(findInBundledManifest(name, platformHint));
	}

	// Development: read bundle-manifest.json from dist/
	return TE.tryCatch(
		async () => {
			const result = await findInDevManifests(name, platformHint);
			if (result) return result;

			throw new Error(
				`Could not find schema for "${toCanonicalString(name)}" in dist/ bundle manifests. ` +
					"Ensure you have run a build first.",
			);
		},
		(err) =>
			notFoundError(
				toUserFacing(name),
				err instanceof Error ? err.message : String(err),
			),
	);
};

/**
 * Resolve the schema file path from either a direct path override or a namespace name.
 * When schemaPath is provided, it takes precedence over name-based lookup.
 */
export const resolveSchemaFromNameOrPath = (
	name?: string,
	schemaPath?: string,
): TE.TaskEither<CLIError, string> => {
	// --schema-path takes precedence
	if (schemaPath) {
		return pipe(
			TE.tryCatch(
				async () => {
					if (await fileExists(schemaPath)) {
						return schemaPath;
					}
					throw new Error("File not found");
				},
				() =>
					notFoundError(
						schemaPath,
						"Schema file not found. Check the path and try again.",
					),
			),
		);
	}

	// Name-based lookup via manifest
	if (name) {
		return pipe(
			TE.fromEither(parseUserFacing(name)),
			TE.chain(resolveSchemaPath),
		);
	}

	return TE.left(
		usageError(
			"No schema source specified",
			'Provide either "name" (e.g., "rp1-dev:build") or "schema_path" in the input.',
		),
	);
};
