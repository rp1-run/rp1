/**
 * Argument resolution logic for the resolve-args agent tool.
 * Implements 5-layer merge, implies chain resolution, and unresolved detection.
 */

import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CanonicalName } from "../../../shared/canonical-name.js";
import {
	parseUserFacing,
	toCanonicalString,
} from "../../../shared/canonical-name.js";
import {
	type ResolvedDirectorySet,
	resolveDirectorySet,
} from "../../../shared/directory-resolution.js";
import type { CLIError } from "../../../shared/errors.js";
import {
	notFoundError,
	parseError,
	runtimeError,
} from "../../../shared/errors.js";
import type {
	ArgumentDefinition,
	EnvironmentDefinition,
} from "../../build/models.js";
import { loadArgumentDefaultsForSkill } from "../../settings/loader.js";
import type {
	ResolveArgsInput,
	ResolvedArgs,
	ResolvedArgumentValues,
	ResolvedDirectories,
} from "./models.js";
import { resolveSchemaFromNameOrPath } from "./schema-lookup.js";

/**
 * Extract the skill/agent name from a schema file path.
 * For skills: path contains `/skills/<name>/SKILL.md` -> extract <name>
 * For agents: path contains `/agents/<name>.md` -> extract <name>
 * Falls back to basename without extension.
 */
const extractNameFromPath = (schemaPath: string): string => {
	const skillMatch = schemaPath.match(/\/skills\/([^/]+)\/SKILL\.md$/);
	if (skillMatch) {
		return skillMatch[1];
	}

	const agentMatch = schemaPath.match(/\/agents\/([^/]+)\.md$/);
	if (agentMatch) {
		return agentMatch[1];
	}

	const parts = schemaPath.split("/");
	const filename = parts[parts.length - 1];
	return filename.replace(/\.md$/i, "");
};

/**
 * Parse YAML frontmatter from a markdown file to extract arguments and environment.
 */
const parseFrontmatter = (
	content: string,
	filePath: string,
): E.Either<
	CLIError,
	{
		readonly arguments: readonly ArgumentDefinition[];
		readonly environment: readonly EnvironmentDefinition[];
	}
> => {
	if (!content.startsWith("---")) {
		return E.left(
			parseError(filePath, "Missing YAML frontmatter (must start with ---)"),
		);
	}

	const parts = content.split("---");
	if (parts.length < 3) {
		return E.left(
			parseError(filePath, "Incomplete YAML frontmatter (missing closing ---)"),
		);
	}

	const yamlStr = parts[1];
	let metadata: Record<string, unknown>;

	try {
		const { parse: parseYaml } = require("yaml");
		metadata = parseYaml(yamlStr) ?? {};
	} catch (e) {
		return E.left(parseError(filePath, `Invalid YAML frontmatter: ${e}`));
	}

	// Arguments may be at top level (agents) or under metadata (skills)
	const rawArgs =
		metadata.arguments ??
		(metadata.metadata as Record<string, unknown> | undefined)?.arguments;

	const rawEnv =
		metadata.environment ??
		(metadata.metadata as Record<string, unknown> | undefined)?.environment;

	const args: ArgumentDefinition[] = [];
	if (Array.isArray(rawArgs)) {
		for (const item of rawArgs) {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				const obj = item as Record<string, unknown>;

				const sourceField =
					obj.source &&
					typeof obj.source === "object" &&
					!Array.isArray(obj.source)
						? {
								source: {
									env: String(
										(obj.source as Record<string, unknown>).env ?? "",
									),
								},
							}
						: undefined;

				args.push({
					name: String(obj.name ?? ""),
					type: (obj.type as ArgumentDefinition["type"]) ?? "string",
					required: Boolean(obj.required),
					...(obj.default !== undefined && {
						default: obj.default as string | boolean,
					}),
					description: String(obj.description ?? ""),
					...(Array.isArray(obj.aliases) && {
						aliases: obj.aliases.map(String),
					}),
					...(Array.isArray(obj.implies) && {
						implies: obj.implies.map(String),
					}),
					...(Array.isArray(obj.enum_values) && {
						enum_values: obj.enum_values.map(String),
					}),
					...(obj.variadic !== undefined && {
						variadic: Boolean(obj.variadic),
					}),
					...sourceField,
				});
			}
		}
	}

	const env: EnvironmentDefinition[] = [];
	if (Array.isArray(rawEnv)) {
		for (const item of rawEnv) {
			if (item && typeof item === "object" && !Array.isArray(item)) {
				const obj = item as Record<string, unknown>;
				env.push({
					name: String(obj.name ?? ""),
					source: String(obj.source ?? ""),
					description: String(obj.description ?? ""),
				});
			}
		}
	}

	return E.right({ arguments: args, environment: env });
};

/**
 * Parse raw argument string into positional and named values.
 * Supports positional args mapped to required/variadic string args in order,
 * and --flag or --key value patterns.
 */
export const parseRawArgs = (
	rawArgs: string,
	schema: readonly ArgumentDefinition[],
): Record<string, string | boolean> => {
	const result: Record<string, string | boolean> = {};
	if (!rawArgs.trim()) {
		return result;
	}

	const tokens = tokenize(rawArgs);

	// Build alias map: alias phrase -> argument name
	const aliasMap = new Map<string, string>();
	for (const arg of schema) {
		if (arg.aliases) {
			for (const alias of arg.aliases) {
				aliasMap.set(alias.toLowerCase(), arg.name);
			}
		}
	}

	// Ordered list of positional string arguments. Optional strings are named-only
	// unless explicitly marked variadic.
	const positionalArgs = schema.filter(
		(a) => a.type === "string" && (a.required || a.variadic),
	);

	let positionalIndex = 0;
	let i = 0;

	while (i < tokens.length) {
		const token = tokens[i];

		if (token.startsWith("--")) {
			const raw = token.slice(2);

			// Handle --key=value syntax
			const eqIndex = raw.indexOf("=");
			if (eqIndex !== -1) {
				const flagName = raw.slice(0, eqIndex);
				const flagValue = raw.slice(eqIndex + 1);
				const upperName = flagName.replace(/-/g, "_").toUpperCase();
				const matchedArg = schema.find((a) => a.name === upperName);
				result[upperName] =
					matchedArg?.type === "boolean" ? flagValue !== "false" : flagValue;
				i++;
			} else {
				const upperName = raw.replace(/-/g, "_").toUpperCase();

				// Check if this is a known boolean argument
				const matchedArg = schema.find((a) => a.name === upperName);

				if (matchedArg?.type === "boolean") {
					result[upperName] = true;
					i++;
				} else if (i + 1 < tokens.length && !tokens[i + 1].startsWith("--")) {
					result[upperName] = tokens[i + 1];
					i += 2;
				} else {
					result[upperName] = true;
					i++;
				}
			}
		} else {
			const positionalArg = positionalArgs[positionalIndex];

			if (positionalArg?.variadic) {
				const chunks = [token];
				i++;

				while (i < tokens.length && !tokens[i].startsWith("--")) {
					chunks.push(tokens[i]);
					i++;
				}

				result[positionalArg.name] = chunks.join(" ");
				positionalIndex++;
				continue;
			}

			// Check for alias match
			const aliasTarget = aliasMap.get(token.toLowerCase());
			if (aliasTarget) {
				result[aliasTarget] = true;
			} else if (positionalArg) {
				result[positionalArg.name] = token;
				positionalIndex++;
			}
			i++;
		}
	}

	return result;
};

/**
 * Tokenize a raw argument string, respecting quoted strings.
 */
const tokenize = (input: string): string[] => {
	const tokens: string[] = [];
	let current = "";
	let inQuote: string | null = null;

	for (let i = 0; i < input.length; i++) {
		const ch = input[i];

		if (inQuote) {
			if (ch === inQuote) {
				inQuote = null;
			} else {
				current += ch;
			}
		} else if (ch === '"' || ch === "'") {
			inQuote = ch;
		} else if (ch === " " || ch === "\t") {
			if (current) {
				tokens.push(current);
				current = "";
			}
		} else {
			current += ch;
		}
	}

	if (current) {
		tokens.push(current);
	}

	return tokens;
};

/**
 * Resolve implies chains using a fixed-point algorithm.
 * When a boolean flag is true, all flags it implies are also set to true.
 * Repeats until no changes occur (stable state).
 */
export const resolveImpliesChains = (
	resolved: Record<string, string | boolean>,
	schema: readonly ArgumentDefinition[],
): void => {
	let changed = true;
	while (changed) {
		changed = false;
		for (const arg of schema) {
			if (
				arg.type === "boolean" &&
				arg.implies &&
				arg.implies.length > 0 &&
				resolved[arg.name] === true
			) {
				for (const target of arg.implies) {
					if (resolved[target] !== true) {
						resolved[target] = true;
						changed = true;
					}
				}
			}
		}
	}
};

const buildFallbackDirectories = (projectRoot: string): ResolvedDirectories => {
	const resolvedProjectRoot = path.resolve(projectRoot);

	return {
		projectRoot: resolvedProjectRoot,
		projectId: undefined,
		kbRoot: path.join(resolvedProjectRoot, ".rp1", "context"),
		workRoot: path.join(resolvedProjectRoot, ".rp1", "work"),
		codeRoot: resolvedProjectRoot,
		isWorktree: false,
		status: "uninitialized",
		nextStepCommand: "rp1 init",
	};
};

const mapResolvedDirectories = (
	directories: ResolvedDirectorySet,
): ResolvedDirectories => ({
	projectRoot: directories.projectRoot,
	projectId: directories.projectId,
	kbRoot: directories.kbRoot,
	workRoot: directories.workRoot,
	codeRoot: directories.codeRoot,
	isWorktree: directories.isWorktree,
	worktreeName: directories.worktreeName,
	status: directories.projectId === undefined ? "legacy" : "initialized",
	...(directories.projectId === undefined && {
		nextStepCommand: "rp1 migrate" as const,
	}),
});

export const resolveDirectories = (projectRoot: string): ResolvedDirectories =>
	pipe(
		resolveDirectorySet(projectRoot),
		E.match(
			() => buildFallbackDirectories(projectRoot),
			(directories) => mapResolvedDirectories(directories),
		),
	);

/**
 * Resolve arguments using the 5-layer merge precedence.
 *
 * Resolution precedence (highest to lowest):
 * 1. Explicit user input (parsed from raw_args)
 * 2. Project settings (.rp1/settings.toml)
 * 3. User settings (~/.config/rp1/settings.toml)
 * 4. ENV var (source.env on the argument definition)
 * 5. Schema default
 *
 * Required arguments not resolved from any layer are returned in `unresolved`.
 */
export const resolveArgs = (
	input: ResolveArgsInput,
): TE.TaskEither<CLIError, ResolvedArgs> => {
	// Parse canonical name once if input.name is provided
	let canonicalName: CanonicalName | null = null;
	if (input.name) {
		const parsed = parseUserFacing(input.name);
		if (E.isRight(parsed)) {
			canonicalName = parsed.right;
		}
	}

	const directories = resolveDirectories(input.project_root);

	return pipe(
		// Resolve schema file path from name or direct path
		resolveSchemaFromNameOrPath(input.name, input.schema_path),
		// Read and parse the schema file
		TE.chain((resolvedPath) =>
			pipe(
				TE.tryCatch(
					() => Bun.file(resolvedPath).text(),
					() =>
						notFoundError(
							resolvedPath,
							"Schema file not found. Check the path and try again.",
						),
				),
				TE.map((content) => ({ content, resolvedPath })),
			),
		),
		TE.chain(({ content, resolvedPath }) =>
			pipe(
				parseFrontmatter(content, resolvedPath),
				TE.fromEither,
				TE.map((schema) => ({ schema, resolvedPath })),
			),
		),
		TE.chain(({ schema, resolvedPath }) => {
			// Empty schema -> return empty result
			if (schema.arguments.length === 0 && schema.environment.length === 0) {
				return TE.right<CLIError, ResolvedArgs>({
					arguments: {},
					directories,
					environment: {},
					unresolved: [],
				});
			}

			return TE.tryCatch(
				async () => {
					const argDefs = schema.arguments;

					// Layer 1: Parse user input
					const userInput = parseRawArgs(input.raw_args, argDefs);

					// Layers 2+3: Load settings (loader handles merge precedence)
					// Use canonical name from input (e.g., "rp1-dev:build" -> "dev:build")
					// to keep settings keys platform-independent and unambiguous.
					// Falls back to path extraction only for --schema-path usage.
					const skillName = canonicalName
						? toCanonicalString(canonicalName)
						: extractNameFromPath(resolvedPath);
					const settingsDefaults = await loadArgumentDefaultsForSkill(
						skillName,
						directories.projectRoot,
					);

					// Merge all layers per argument
					const resolved: Record<string, string | boolean> = {};

					for (const arg of argDefs) {
						// Layer 1: user input
						if (userInput[arg.name] !== undefined) {
							resolved[arg.name] = userInput[arg.name];
							continue;
						}

						// Layers 2+3: project/user settings (already merged by loader)
						if (settingsDefaults[arg.name] !== undefined) {
							const settingsVal = settingsDefaults[arg.name];
							if (
								typeof settingsVal === "string" ||
								typeof settingsVal === "boolean"
							) {
								resolved[arg.name] = settingsVal;
								continue;
							}
						}

						// Layer 4: ENV var from source.env
						if (arg.source?.env) {
							const envVal = process.env[arg.source.env];
							if (envVal !== undefined) {
								if (arg.type === "boolean") {
									resolved[arg.name] = envVal === "true" || envVal === "1";
								} else {
									resolved[arg.name] = envVal;
								}
								continue;
							}
						}

						// Layer 5: Schema default
						if (arg.default !== undefined) {
							resolved[arg.name] = arg.default;
							continue;
						}

						// Boolean arguments default to false when not specified
						if (arg.type === "boolean") {
							resolved[arg.name] = false;
						}
					}

					// Resolve implies chains (fixed-point)
					resolveImpliesChains(resolved, argDefs);

					// Detect unresolved required arguments
					const unresolved: string[] = [];
					for (const arg of argDefs) {
						if (arg.required && resolved[arg.name] === undefined) {
							unresolved.push(arg.name);
						}
					}

					return {
						arguments: resolved as ResolvedArgumentValues,
						directories,
						environment: {},
						unresolved,
					};
				},
				(err) =>
					runtimeError(
						`Failed to resolve arguments: ${err instanceof Error ? err.message : String(err)}`,
					),
			);
		}),
	);
};
