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
import type { CLIError } from "../../../shared/errors.js";
import { notFoundError, usageError } from "../../../shared/errors.js";
import type { BundledPlugin } from "../../assets/reader.js";
import {
	collectPlatformPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../../assets/reader.js";

/** Parsed namespace from a skill/agent name like "rp1-dev:build". */
export interface ParsedNamespace {
	readonly pluginShort: string;
	readonly artifactName: string;
}

/**
 * Parse a namespace reference like "rp1-dev:build" into plugin short name and artifact name.
 * Strips the "rp1-" prefix from the plugin portion.
 */
export const parseNamespace = (
	name: string,
): E.Either<CLIError, ParsedNamespace> => {
	const colonIndex = name.indexOf(":");
	if (colonIndex < 0) {
		return E.left(
			usageError(
				`Invalid name format: "${name}"`,
				'Use "<plugin>:<name>" format (e.g., "rp1-dev:build").',
			),
		);
	}

	const pluginPart = name.slice(0, colonIndex);
	const artifactName = name.slice(colonIndex + 1);

	if (!pluginPart || !artifactName) {
		return E.left(
			usageError(
				`Invalid name format: "${name}"`,
				'Both plugin and name parts are required (e.g., "rp1-dev:build").',
			),
		);
	}

	const pluginShort = pluginPart.replace(/^rp1-/, "");

	return E.right({ pluginShort, artifactName });
};

/**
 * Match a skill entry by canonical name.
 * Entry names are "{prefix}{canonicalName}/SKILL.md" where prefix is "" or "rp1-".
 */
const matchSkillEntry = (
	entry: { name: string },
	artifactName: string,
): boolean => {
	if (!entry.name.endsWith("/SKILL.md")) return false;
	const dirName = entry.name.slice(0, -"/SKILL.md".length);
	// Handle nested path segments (e.g., "rp1-build/subdir/SKILL.md" won't match,
	// but "rp1-build/SKILL.md" will via the final segment)
	const baseName = dirName.includes("/") ? dirName.split("/").pop()! : dirName;
	const canonical = baseName.replace(/^rp1-/, "");
	return canonical === artifactName;
};

/**
 * Match an agent entry by canonical name.
 * Entry names are "{canonicalName}" with .md or .toml extension.
 */
const matchAgentEntry = (
	entry: { name: string },
	artifactName: string,
): boolean => {
	const name = entry.name.replace(/\.(md|toml)$/, "");
	return name === artifactName;
};

/**
 * Search a plugin's skills and agents for a matching entry.
 * Returns the entry path on match, or null.
 */
const findInPlugin = (
	plugin: BundledPlugin,
	artifactName: string,
): string | null => {
	const skillEntry = plugin.skills.find((e) =>
		matchSkillEntry(e, artifactName),
	);
	if (skillEntry) return skillEntry.path;

	const agentEntry = plugin.agents.find((e) =>
		matchAgentEntry(e, artifactName),
	);
	if (agentEntry) return agentEntry.path;

	return null;
};

/**
 * Find a skill or agent in the embedded manifest by canonical name.
 * Searches all platforms for a matching plugin and artifact.
 * Returns the embedded blob path on success.
 */
const findInBundledManifest = (
	parsed: ParsedNamespace,
): E.Either<CLIError, string> => {
	const { pluginShort, artifactName } = parsed;
	const pluginName = `rp1-${pluginShort}`;

	const assetsResult = getBundledAssets();
	if (assetsResult._tag === "Left") return assetsResult;

	for (const platform of Object.values(assetsResult.right.platforms)) {
		if (!platform) continue;
		const plugin = collectPlatformPlugins(platform).find(
			(p) => p.name === pluginName,
		);
		if (!plugin) continue;

		const path = findInPlugin(plugin, artifactName);
		if (path) return E.right(path);
	}

	return E.left(
		notFoundError(
			`rp1-${pluginShort}:${artifactName}`,
			`Could not find schema for "${pluginShort}:${artifactName}" in the embedded manifest.`,
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
	parsed: ParsedNamespace,
): Promise<string | null> => {
	const { pluginShort, artifactName } = parsed;
	const pluginName = `rp1-${pluginShort}`;
	const repoRoot = getRepoRoot();
	const distDir = join(repoRoot, "dist");

	// Scan all platform directories under dist/
	let platformDirs: string[];
	try {
		const { readdir } = await import("node:fs/promises");
		platformDirs = await readdir(distDir);
	} catch {
		return null;
	}

	for (const platformName of platformDirs) {
		const manifestPath = join(distDir, platformName, "bundle-manifest.json");
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

		// Search skills
		const skillEntry = (plugin.skills ?? []).find((e) =>
			matchSkillEntry(e, artifactName),
		);
		if (skillEntry) {
			return join(distDir, platformName, skillEntry.path);
		}

		// Search agents
		const agentEntry = (plugin.agents ?? []).find((e) =>
			matchAgentEntry(e, artifactName),
		);
		if (agentEntry) {
			return join(distDir, platformName, agentEntry.path);
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
 * Resolve a namespace name to a schema file path.
 * Uses the embedded manifest (production) or dist/ bundle-manifest.json files (development).
 */
export const resolveSchemaPath = (
	parsed: ParsedNamespace,
): TE.TaskEither<CLIError, string> => {
	// Production: use embedded manifest
	if (hasBundledAssets()) {
		return TE.fromEither(findInBundledManifest(parsed));
	}

	// Development: read bundle-manifest.json from dist/
	return TE.tryCatch(
		async () => {
			const result = await findInDevManifests(parsed);
			if (result) return result;

			throw new Error(
				`Could not find schema for "${parsed.pluginShort}:${parsed.artifactName}" in dist/ bundle manifests. ` +
					"Ensure you have run a build first.",
			);
		},
		(err) =>
			notFoundError(
				`rp1-${parsed.pluginShort}:${parsed.artifactName}`,
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
			TE.fromEither(parseNamespace(name)),
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
