/**
 * Argument transformer for transform-args module.
 * Core orchestration that combines schema, settings, and raw arguments.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type {
	ArgumentSchema,
	MergedSettings,
	TransformResult,
} from "./models.js";
import {
	isFallback,
	lookupPluginCommandWithFallback,
	type PluginLookupOutcome,
} from "./plugin-locator.js";
import { parseArgumentHint } from "./schema.js";
import { loadSettings } from "./settings-loader.js";
import { type CLIArguments, mergeSettings } from "./settings-merger.js";

/**
 * Error returned when transformation fails.
 */
export interface TransformError {
	readonly _tag: "TransformError";
	readonly reason: "missing-required-arg" | "schema-parse-error";
	readonly message: string;
}

/**
 * Create a transform error.
 */
export const transformError = (
	reason: TransformError["reason"],
	message: string,
): TransformError => ({
	_tag: "TransformError",
	reason,
	message,
});

/**
 * Parsed CLI input with flags and positional arguments separated.
 */
interface ParsedCLI {
	readonly positionalArgs: readonly string[];
	readonly flags: Record<string, string | boolean>;
}

/**
 * Convert a name to UPPER_SNAKE_CASE.
 * Converts kebab-case to UPPER_SNAKE_CASE.
 */
export const toUpperSnakeCase = (name: string): string =>
	name.toUpperCase().replace(/-/g, "_");

/**
 * Parse raw arguments into positional args and flags.
 *
 * Flags are in the form:
 * - --name (boolean, true)
 * - --name=value (string value)
 * - --no-name (boolean, false)
 *
 * All other arguments are positional.
 */
export const parseRawArguments = (rawArgs: readonly string[]): ParsedCLI => {
	const positionalArgs: string[] = [];
	const flags: Record<string, string | boolean> = {};

	for (const arg of rawArgs) {
		if (arg.startsWith("--")) {
			const equalsIndex = arg.indexOf("=");
			if (equalsIndex !== -1) {
				const name = arg.slice(2, equalsIndex);
				const value = arg.slice(equalsIndex + 1);
				flags[name] = value;
			} else if (arg.startsWith("--no-")) {
				const name = arg.slice(5);
				flags[name] = false;
			} else {
				const name = arg.slice(2);
				flags[name] = true;
			}
		} else {
			positionalArgs.push(arg);
		}
	}

	return { positionalArgs, flags };
};

/**
 * Map positional arguments to schema-defined names in schema mode.
 * Validates required arguments and handles variadic arguments.
 */
const mapPositionalArgsWithSchema = (
	positionalArgs: readonly string[],
	schema: ArgumentSchema,
): E.Either<TransformError, Record<string, string>> => {
	const result: Record<string, string> = {};
	let argIndex = 0;

	for (let i = 0; i < schema.positional.length; i++) {
		const posArg = schema.positional[i];

		if (posArg.variadic) {
			const remaining = positionalArgs.slice(argIndex);
			if (remaining.length > 0) {
				result[posArg.name] = remaining.join(" ");
			}
			break;
		}

		if (argIndex < positionalArgs.length) {
			result[posArg.name] = positionalArgs[argIndex];
			argIndex++;
		} else if (posArg.required) {
			return E.left(
				transformError(
					"missing-required-arg",
					`Required argument <${posArg.name}> not provided`,
				),
			);
		}
	}

	const extraArgs = positionalArgs.slice(argIndex);
	if (extraArgs.length > 0 && !schema.positional.some((p) => p.variadic)) {
		result.ARGUMENTS = extraArgs.join(" ");
	}

	return E.right(result);
};

/**
 * Apply flag defaults from schema and merge with CLI flags.
 * Returns flags with schema-defined names.
 */
const applyFlagDefaults = (
	cliFlags: Record<string, string | boolean>,
	schema: ArgumentSchema,
): Record<string, string | boolean> => {
	const result: Record<string, string | boolean> = {};

	for (const flagDef of schema.flags) {
		result[flagDef.name] = flagDef.defaultValue;
	}

	for (const [name, value] of Object.entries(cliFlags)) {
		result[name] = value;
	}

	return result;
};

/**
 * Map positional arguments in fallback mode using ARG_1, ARG_2, etc.
 */
const mapPositionalArgsFallback = (
	positionalArgs: readonly string[],
): Record<string, string> => {
	const result: Record<string, string> = {};

	for (let i = 0; i < positionalArgs.length; i++) {
		result[`ARG_${i + 1}`] = positionalArgs[i];
	}

	if (positionalArgs.length > 0) {
		result.ARGUMENTS = positionalArgs.join(" ");
	}

	return result;
};

/**
 * Convert all variable names to UPPER_SNAKE_CASE and stringify values.
 */
const convertToOutputVariables = (
	variables: Record<string, string | boolean | unknown>,
): Record<string, string> => {
	const result: Record<string, string> = {};

	for (const [name, value] of Object.entries(variables)) {
		const upperName = toUpperSnakeCase(name);
		if (typeof value === "boolean") {
			result[upperName] = value.toString();
		} else if (typeof value === "string") {
			result[upperName] = value;
		} else if (value !== undefined && value !== null) {
			result[upperName] = String(value);
		}
	}

	return result;
};

/**
 * Apply settings to variables, filling in defaults from merged settings.
 * Precedence: CLI flags > settings > schema defaults.
 * Settings CAN override schema defaults, but NOT CLI flags.
 */
const applySettings = (
	variables: Record<string, string>,
	flags: Record<string, string | boolean>,
	mergedSettings: MergedSettings,
): Record<string, string> => {
	const result: Record<string, string> = { ...variables };

	// Normalize CLI flag keys to UPPER_SNAKE_CASE for comparison
	// This handles underscore/hyphen equivalence (git_worktree vs git-worktree)
	const cliProvidedKeys = new Set(Object.keys(flags).map(toUpperSnakeCase));

	// Apply settings values - can override schema defaults but not CLI flags
	for (const [key, value] of Object.entries(mergedSettings.values)) {
		const upperKey = toUpperSnakeCase(key);
		// Only skip if CLI flag was explicitly provided
		if (!cliProvidedKeys.has(upperKey)) {
			if (typeof value === "boolean") {
				result[upperKey] = value.toString();
			} else if (typeof value === "string") {
				result[upperKey] = value;
			} else if (value !== undefined && value !== null) {
				result[upperKey] = String(value);
			}
		}
	}

	return result;
};

/**
 * Transform input with a known schema.
 */
const transformWithSchema = (
	parsedCLI: ParsedCLI,
	schema: ArgumentSchema,
	mergedSettings: MergedSettings,
): E.Either<TransformError, TransformResult> =>
	pipe(
		mapPositionalArgsWithSchema(parsedCLI.positionalArgs, schema),
		E.map((positionalVars) => {
			const flagsWithDefaults = applyFlagDefaults(parsedCLI.flags, schema);
			const allVars: Record<string, string | boolean> = {
				...positionalVars,
				...flagsWithDefaults,
			};

			let variables = convertToOutputVariables(allVars);
			variables = applySettings(variables, parsedCLI.flags, mergedSettings);

			return {
				variables,
				warnings: [] as readonly string[],
				schemaUsed: true,
			};
		}),
	);

/**
 * Transform input in fallback mode (no schema).
 */
const transformWithFallback = (
	parsedCLI: ParsedCLI,
	fallbackReason: string,
	mergedSettings: MergedSettings,
): TransformResult => {
	const positionalVars = mapPositionalArgsFallback(parsedCLI.positionalArgs);
	const allVars: Record<string, string | boolean> = {
		...positionalVars,
		...parsedCLI.flags,
	};

	let variables = convertToOutputVariables(allVars);
	variables = applySettings(variables, parsedCLI.flags, mergedSettings);

	return {
		variables,
		warnings: [fallbackReason] as readonly string[],
		schemaUsed: false,
	};
};

/**
 * Transform arguments for a plugin command.
 *
 * This is the main entry point for the transformation pipeline:
 * 1. Look up plugin command schema (or fallback)
 * 2. Load and merge settings
 * 3. Parse raw arguments
 * 4. Transform using schema or fallback
 * 5. Return TransformResult
 *
 * @param pluginCommand - Plugin-command identifier (e.g., "rp1-dev:build")
 * @param rawArgs - Raw argument strings from CLI
 * @param projectRoot - Project root directory (defaults to cwd)
 * @returns TaskEither with TransformResult or TransformError
 */
export const transformArgs = (
	pluginCommand: string,
	rawArgs: readonly string[],
	projectRoot: string = process.cwd(),
): TE.TaskEither<TransformError, TransformResult> =>
	pipe(
		lookupPluginCommandWithFallback(pluginCommand, projectRoot),
		TE.chain((lookupOutcome: PluginLookupOutcome) =>
			pipe(
				loadSettings(projectRoot),
				TE.chain((loadedSettings) => {
					const parsedCLI = parseRawArguments(rawArgs);
					const cliArguments: CLIArguments = { ...parsedCLI.flags };
					const mergedSettings = mergeSettings({
						globalSettings: loadedSettings.global,
						localSettings: loadedSettings.local,
						cliArguments,
					});

					if (isFallback(lookupOutcome)) {
						return TE.right(
							transformWithFallback(
								parsedCLI,
								lookupOutcome.reason,
								mergedSettings,
							),
						);
					}

					const schemaResult = parseArgumentHint(lookupOutcome.argumentHint);

					if (E.isLeft(schemaResult)) {
						const reason = `Schema parse error: ${schemaResult.left.message}`;
						console.error(
							`Warning: ${reason}. Using fallback argument parsing.`,
						);
						return TE.right(
							transformWithFallback(parsedCLI, reason, mergedSettings),
						);
					}

					const transformResult = transformWithSchema(
						parsedCLI,
						schemaResult.right,
						mergedSettings,
					);

					return TE.fromEither(transformResult);
				}),
			),
		),
	);

/**
 * Transform arguments synchronously when schema is already known.
 * Useful for testing or when schema is pre-loaded.
 *
 * @param schema - Argument schema (or null for fallback)
 * @param rawArgs - Raw argument strings from CLI
 * @param mergedSettings - Pre-merged settings
 * @returns Either TransformError or TransformResult
 */
export const transformArgsSync = (
	schema: ArgumentSchema | null,
	rawArgs: readonly string[],
	mergedSettings: MergedSettings,
): E.Either<TransformError, TransformResult> => {
	const parsedCLI = parseRawArguments(rawArgs);

	if (schema === null) {
		return E.right(
			transformWithFallback(parsedCLI, "No schema provided", mergedSettings),
		);
	}

	return transformWithSchema(parsedCLI, schema, mergedSettings);
};
