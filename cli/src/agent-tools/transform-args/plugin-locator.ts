/**
 * Plugin command locator for transform-args module.
 * Resolves plugin-command identifiers to file paths and extracts argument-hint from frontmatter.
 */

import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import { getClaudePluginDirs } from "../../shared/paths.js";

/**
 * Error types for plugin lookup operations.
 */
export interface PluginLookupError {
	readonly _tag: "PluginLookupError";
	readonly reason:
		| "invalid-format"
		| "unknown-plugin"
		| "file-not-found"
		| "read-error"
		| "invalid-frontmatter"
		| "no-argument-hint";
	readonly message: string;
	readonly pluginCommand?: string;
}

/**
 * Result of a successful plugin lookup.
 */
export interface PluginLookupResult {
	readonly argumentHint: string;
	readonly pluginCommand: string;
	readonly filePath: string;
}

/**
 * Fallback indicator when lookup fails but processing should continue.
 */
export interface PluginLookupFallback {
	readonly _tag: "fallback";
	readonly reason: string;
	readonly pluginCommand: string;
}

/**
 * Union type for lookup outcome.
 */
export type PluginLookupOutcome = PluginLookupResult | PluginLookupFallback;

/**
 * Create a plugin lookup error.
 */
export const pluginLookupError = (
	reason: PluginLookupError["reason"],
	message: string,
	pluginCommand?: string,
): PluginLookupError => ({
	_tag: "PluginLookupError",
	reason,
	message,
	pluginCommand,
});

/**
 * Create a fallback indicator.
 */
export const pluginLookupFallback = (
	reason: string,
	pluginCommand: string,
): PluginLookupFallback => ({
	_tag: "fallback",
	reason,
	pluginCommand,
});

/**
 * Plugin prefix to directory mapping.
 * Maps plugin identifiers (e.g., 'rp1-dev') to plugin directories (e.g., 'dev').
 */
const PLUGIN_PREFIX_MAP: Record<string, string> = {
	"rp1-base": "base",
	"rp1-dev": "dev",
	"rp1-utils": "utils",
};

/**
 * Regex pattern for validating plugin-command format.
 * Format: {plugin-prefix}:{command-name}
 * Example: rp1-dev:build
 */
const PLUGIN_COMMAND_PATTERN = /^([a-z0-9-]+):([a-z][a-z0-9-]*)$/;

/**
 * Validate plugin-command format and extract components.
 */
export const parsePluginCommand = (
	pluginCommand: string,
): E.Either<PluginLookupError, { pluginId: string; commandName: string }> => {
	const match = pluginCommand.match(PLUGIN_COMMAND_PATTERN);

	if (!match) {
		return E.left(
			pluginLookupError(
				"invalid-format",
				`Invalid plugin-command format: "${pluginCommand}". Expected format: {plugin-name}:{command-name} (e.g., rp1-dev:build)`,
				pluginCommand,
			),
		);
	}

	const [, pluginId, commandName] = match;
	return E.right({ pluginId, commandName });
};

/**
 * Map plugin identifier to directory name.
 */
export const resolvePluginDir = (
	pluginId: string,
): E.Either<PluginLookupError, string> => {
	const pluginDir = PLUGIN_PREFIX_MAP[pluginId];

	if (!pluginDir) {
		return E.left(
			pluginLookupError(
				"unknown-plugin",
				`Unknown plugin: "${pluginId}". Known plugins: ${Object.keys(PLUGIN_PREFIX_MAP).join(", ")}`,
				pluginId,
			),
		);
	}

	return E.right(pluginDir);
};

/**
 * Construct the path to a plugin command file.
 */
export const resolvePluginPath = (
	pluginCommand: string,
	projectRoot: string,
): E.Either<PluginLookupError, string> =>
	pipe(
		parsePluginCommand(pluginCommand),
		E.chain(({ pluginId, commandName }) =>
			pipe(
				resolvePluginDir(pluginId),
				E.map((pluginDir) =>
					path.join(
						projectRoot,
						"plugins",
						pluginDir,
						"commands",
						`${commandName}.md`,
					),
				),
			),
		),
	);

/**
 * Structure of installed_plugins.json used by Claude Code.
 */
interface InstalledPluginsJson {
	readonly version: number;
	readonly plugins: Record<
		string,
		ReadonlyArray<{
			readonly installPath: string;
			readonly [key: string]: unknown;
		}>
	>;
}

/**
 * Resolve a plugin command path from Claude Code's installed_plugins.json.
 *
 * Searches for the plugin by prefix match (e.g., "rp1-dev" matches "rp1-dev@rp1-local")
 * and constructs the command file path from the first matching entry's installPath.
 * Verifies the resolved command file exists before returning.
 *
 * @param pluginCommand - Plugin-command identifier (e.g., "rp1-dev:build")
 * @param home - Home directory override (for testing)
 * @returns TaskEither with resolved file path or error
 */
export const resolveFromInstalledPlugins = (
	pluginCommand: string,
	home?: string,
): TE.TaskEither<PluginLookupError, string> =>
	pipe(
		parsePluginCommand(pluginCommand),
		TE.fromEither,
		TE.chain(({ pluginId, commandName }) =>
			TE.tryCatch(
				async () => {
					const dirs = getClaudePluginDirs(home);

					let pluginsDir: string | null = null;
					for (const dir of dirs) {
						const jsonFile = Bun.file(path.join(dir, "installed_plugins.json"));
						if (await jsonFile.exists()) {
							pluginsDir = dir;
							break;
						}
					}

					if (!pluginsDir) {
						throw new Error("No Claude Code plugins directory found");
					}

					const jsonFile = Bun.file(
						path.join(pluginsDir, "installed_plugins.json"),
					);
					const content = await jsonFile.text();
					const data = JSON.parse(content) as InstalledPluginsJson;

					const prefix = `${pluginId}@`;
					const matchingKey = Object.keys(data.plugins).find((key) =>
						key.startsWith(prefix),
					);

					if (!matchingKey) {
						throw new Error(
							`Plugin "${pluginId}" not found in installed_plugins.json`,
						);
					}

					const entries = data.plugins[matchingKey];
					if (!entries || entries.length === 0) {
						throw new Error(
							`Plugin "${pluginId}" has no entries in installed_plugins.json`,
						);
					}

					const installPath = entries[0].installPath;
					const filePath = path.join(
						installPath,
						"commands",
						`${commandName}.md`,
					);

					const commandFile = Bun.file(filePath);
					if (!(await commandFile.exists())) {
						throw new Error(
							`Command file not found at installed plugin path: ${filePath}`,
						);
					}

					return filePath;
				},
				(e): PluginLookupError =>
					pluginLookupError(
						"file-not-found",
						e instanceof Error ? e.message : String(e),
						pluginCommand,
					),
			),
		),
	);

/**
 * Extract YAML frontmatter from markdown content.
 */
export const extractFrontmatter = (
	content: string,
	filePath: string,
): E.Either<PluginLookupError, Record<string, unknown>> => {
	if (!content.startsWith("---")) {
		return E.left(
			pluginLookupError(
				"invalid-frontmatter",
				`Missing YAML frontmatter in ${filePath} (must start with ---)`,
			),
		);
	}

	const parts = content.split("---");
	if (parts.length < 3) {
		return E.left(
			pluginLookupError(
				"invalid-frontmatter",
				`Invalid frontmatter structure in ${filePath} (must have opening and closing ---)`,
			),
		);
	}

	const frontmatterText = parts[1];

	try {
		const metadata = parseYaml(frontmatterText) as Record<string, unknown>;
		if (metadata === null || typeof metadata !== "object") {
			return E.left(
				pluginLookupError(
					"invalid-frontmatter",
					`Frontmatter is empty or not an object in ${filePath}`,
				),
			);
		}
		return E.right(metadata);
	} catch (e) {
		return E.left(
			pluginLookupError(
				"invalid-frontmatter",
				`YAML parse error in ${filePath}: ${e}`,
			),
		);
	}
};

/**
 * Extract argument-hint field from frontmatter.
 * Returns empty string if argument-hint is not present (valid for commands with no arguments).
 */
export const extractArgumentHint = (
	metadata: Record<string, unknown>,
	_filePath: string,
): E.Either<PluginLookupError, string> => {
	const argumentHint = metadata["argument-hint"];

	// Missing argument-hint is valid - command has no arguments
	if (argumentHint === undefined || argumentHint === null) {
		return E.right("");
	}

	if (typeof argumentHint !== "string") {
		return E.left(
			pluginLookupError(
				"invalid-frontmatter",
				`argument-hint field must be a string, got ${typeof argumentHint}`,
			),
		);
	}

	return E.right(argumentHint);
};

/**
 * Read file content using Bun.file().
 */
const readFile = (filePath: string): TE.TaskEither<PluginLookupError, string> =>
	TE.tryCatch(
		async () => {
			const file = Bun.file(filePath);
			const exists = await file.exists();

			if (!exists) {
				throw new Error(`File not found: ${filePath}`);
			}

			return await file.text();
		},
		(e): PluginLookupError => {
			const message = e instanceof Error ? e.message : String(e);
			if (message.includes("not found") || message.includes("ENOENT")) {
				return pluginLookupError(
					"file-not-found",
					`Command file not found: ${filePath}`,
				);
			}
			return pluginLookupError("read-error", `Failed to read file: ${message}`);
		},
	);

/**
 * Look up a plugin command and extract its argument-hint.
 *
 * This function resolves a plugin-command identifier (e.g., "rp1-dev:build")
 * to the corresponding command file, reads the YAML frontmatter, and extracts
 * the argument-hint field.
 *
 * @param pluginCommand - Plugin-command identifier (e.g., "rp1-dev:build")
 * @param projectRoot - Project root directory (defaults to cwd)
 * @param home - Home directory override for installed plugins resolution (for testing)
 * @returns TaskEither with lookup result or error
 */
export const lookupPluginCommand = (
	pluginCommand: string,
	projectRoot: string = process.cwd(),
	home?: string,
): TE.TaskEither<PluginLookupError, PluginLookupResult> => {
	const resolveFilePath: TE.TaskEither<PluginLookupError, string> = pipe(
		resolveFromInstalledPlugins(pluginCommand, home),
		TE.orElse(() =>
			pipe(resolvePluginPath(pluginCommand, projectRoot), TE.fromEither),
		),
	);

	return pipe(
		resolveFilePath,
		TE.chain((filePath) =>
			pipe(
				readFile(filePath),
				TE.chain((content) =>
					pipe(
						extractFrontmatter(content, filePath),
						E.chain((metadata) => extractArgumentHint(metadata, filePath)),
						E.map(
							(argumentHint): PluginLookupResult => ({
								argumentHint,
								pluginCommand,
								filePath,
							}),
						),
						TE.fromEither,
					),
				),
			),
		),
	);
};

/**
 * Look up a plugin command with graceful fallback.
 *
 * Unlike lookupPluginCommand, this function never fails. Instead, it returns
 * either a successful lookup result or a fallback indicator with the reason
 * for fallback. Warnings are logged to stderr.
 *
 * @param pluginCommand - Plugin-command identifier (e.g., "rp1-dev:build")
 * @param projectRoot - Project root directory (defaults to cwd)
 * @param home - Home directory override for installed plugins resolution (for testing)
 * @returns TaskEither that always succeeds with either result or fallback
 */
export const lookupPluginCommandWithFallback = (
	pluginCommand: string,
	projectRoot: string = process.cwd(),
	home?: string,
): TE.TaskEither<never, PluginLookupOutcome> =>
	pipe(
		lookupPluginCommand(pluginCommand, projectRoot, home),
		TE.fold(
			(error) =>
				TE.right<never, PluginLookupOutcome>(
					pipe(
						(() => {
							console.error(
								`Warning: ${error.message}. Using fallback argument parsing.`,
							);
							return undefined;
						})(),
						() => pluginLookupFallback(error.message, pluginCommand),
					),
				),
			(result) => TE.right<never, PluginLookupOutcome>(result),
		),
	);

/**
 * Type guard to check if lookup outcome is a fallback.
 */
export const isFallback = (
	outcome: PluginLookupOutcome,
): outcome is PluginLookupFallback => {
	return "_tag" in outcome && outcome._tag === "fallback";
};

/**
 * Type guard to check if lookup outcome is a successful result.
 */
export const isResult = (
	outcome: PluginLookupOutcome,
): outcome is PluginLookupResult => {
	return !isFallback(outcome);
};
