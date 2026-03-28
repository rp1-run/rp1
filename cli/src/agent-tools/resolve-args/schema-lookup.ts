/**
 * Schema file lookup for resolve-args.
 * Resolves a skill/agent namespace name (e.g., "rp1-dev:build") to
 * the SKILL.md or agent .md file path by looking up plugin directories.
 */

import { readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { notFoundError, usageError } from "../../../shared/errors.js";
import { getClaudePluginDirs } from "../../shared/paths.js";

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
 * Find the rp1 CLI root directory by walking up from the current file's location.
 * In development, this is the repo root containing dist/.
 */
const findCliRoot = (): string | null => {
	// Walk up from this file's directory to find the repo root
	let current = resolve(dirname(new URL(import.meta.url).pathname));
	const root = resolve("/");

	while (current !== root) {
		try {
			const fs = require("node:fs");
			const distPath = join(current, "dist", "claude-code");
			const pluginsPath = join(current, "plugins");
			if (
				fs.statSync(distPath).isDirectory() &&
				fs.statSync(pluginsPath).isDirectory()
			) {
				return current;
			}
		} catch {
			// Continue searching
		}
		current = resolve(current, "..");
	}

	return null;
};

/** Suffixes used by Claude Code marketplace for rp1 plugins. */
const PLUGIN_SUFFIXES = ["@rp1-local", "@rp1-run"] as const;

/** Structure of installed_plugins.json entries. */
interface InstalledPluginEntry {
	readonly installPath: string;
	readonly version?: string;
	readonly isLocal?: boolean;
}

/**
 * Look up the install path for a plugin from Claude Code's installed_plugins.json.
 */
const findInstalledPluginPath = async (
	pluginShort: string,
): Promise<string | null> => {
	const pluginDirs = getClaudePluginDirs();

	for (const pluginDir of pluginDirs) {
		try {
			const jsonPath = join(pluginDir, "installed_plugins.json");
			const content = await readFile(jsonPath, "utf-8");
			const data = JSON.parse(content) as {
				plugins: Record<string, InstalledPluginEntry[]>;
			};

			const pluginName = `rp1-${pluginShort}`;

			for (const suffix of PLUGIN_SUFFIXES) {
				const fullId = `${pluginName}${suffix}`;
				const entries = data.plugins?.[fullId];
				if (entries && entries.length > 0) {
					return entries[0].installPath;
				}
			}
		} catch {
			// Try next directory
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
 * Tries development paths first (dist/), then production installed paths.
 *
 * Search order for skills:
 *   1. dist/claude-code/<pluginShort>/skills/<name>/SKILL.md (dev)
 *   2. <installedPath>/skills/<name>/SKILL.md (production)
 *
 * Search order for agents:
 *   1. dist/claude-code/<pluginShort>/agents/<name>.md (dev)
 *   2. <installedPath>/agents/<name>.md (production)
 *
 * Since we don't know upfront whether the name refers to a skill or agent,
 * we try skill paths first, then agent paths.
 */
export const resolveSchemaPath = (
	parsed: ParsedNamespace,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			const { pluginShort, artifactName } = parsed;

			// 1. Try development mode (dist/)
			const cliRoot = findCliRoot();
			if (cliRoot) {
				const devPluginDir = join(cliRoot, "dist", "claude-code", pluginShort);

				// Try skill path
				const devSkillPath = join(
					devPluginDir,
					"skills",
					artifactName,
					"SKILL.md",
				);
				if (await fileExists(devSkillPath)) {
					return devSkillPath;
				}

				// Try agent path
				const devAgentPath = join(devPluginDir, "agents", `${artifactName}.md`);
				if (await fileExists(devAgentPath)) {
					return devAgentPath;
				}
			}

			// 2. Try production mode (installed plugins)
			const installedPath = await findInstalledPluginPath(pluginShort);
			if (installedPath) {
				// Try skill path
				const prodSkillPath = join(
					installedPath,
					"skills",
					artifactName,
					"SKILL.md",
				);
				if (await fileExists(prodSkillPath)) {
					return prodSkillPath;
				}

				// Try agent path
				const prodAgentPath = join(
					installedPath,
					"agents",
					`${artifactName}.md`,
				);
				if (await fileExists(prodAgentPath)) {
					return prodAgentPath;
				}
			}

			throw new Error(
				`Could not find schema for "${pluginShort}:${artifactName}". ` +
					`Searched skill and agent paths in both development (dist/) and installed plugin directories.`,
			);
		},
		(err) =>
			notFoundError(
				`rp1-${parsed.pluginShort}:${parsed.artifactName}`,
				err instanceof Error ? err.message : String(err),
			),
	);

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

	// Name-based lookup
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
