/**
 * Schema parser for argument-hint strings.
 * Parses command argument schemas defined in YAML frontmatter.
 */

import * as E from "fp-ts/lib/Either.js";
import type { ArgumentSchema, FlagArg, PositionalArg } from "./models.js";

/**
 * Error returned when schema parsing fails.
 */
export interface SchemaParseError {
	readonly _tag: "SchemaParseError";
	readonly message: string;
	readonly token?: string;
}

/**
 * Create a schema parse error.
 */
export const schemaParseError = (
	message: string,
	token?: string,
): SchemaParseError => ({
	_tag: "SchemaParseError",
	message,
	token,
});

/**
 * Regex patterns for parsing argument-hint tokens.
 */
const REQUIRED_POS = /^<([a-z][a-z0-9-]*)>$/;
const OPTIONAL_POS = /^\[([a-z][a-z0-9-]*)\]$/;
const VARIADIC_POS = /^\[([a-z][a-z0-9-]*)\.\.\.?\]$/;
const BOOL_FLAG = /^\[--([a-z][a-z0-9-]*)\]$/;
const VALUE_FLAG = /^\[--([a-z][a-z0-9-]*)=([^\]]*)\]$/;

/**
 * Token types for internal parsing.
 */
type ParsedToken =
	| { type: "positional"; arg: PositionalArg }
	| { type: "flag"; arg: FlagArg };

/**
 * Parse a single token from the argument-hint string.
 * Returns the parsed token type or null if not recognized.
 */
const parseToken = (token: string): ParsedToken | null => {
	// Try required positional: <name>
	const requiredMatch = token.match(REQUIRED_POS);
	if (requiredMatch) {
		return {
			type: "positional",
			arg: {
				name: requiredMatch[1],
				required: true,
				variadic: false,
			},
		};
	}

	// Try variadic positional: [name...] or [name..]
	// Must check before optional to avoid false match
	const variadicMatch = token.match(VARIADIC_POS);
	if (variadicMatch) {
		return {
			type: "positional",
			arg: {
				name: variadicMatch[1],
				required: false,
				variadic: true,
			},
		};
	}

	// Try optional positional: [name]
	const optionalMatch = token.match(OPTIONAL_POS);
	if (optionalMatch) {
		return {
			type: "positional",
			arg: {
				name: optionalMatch[1],
				required: false,
				variadic: false,
			},
		};
	}

	// Try value flag: [--name=value]
	// Must check before bool flag to avoid false match
	const valueFlagMatch = token.match(VALUE_FLAG);
	if (valueFlagMatch) {
		return {
			type: "flag",
			arg: {
				name: valueFlagMatch[1],
				defaultValue: valueFlagMatch[2],
				isBoolean: false,
			},
		};
	}

	// Try boolean flag: [--name]
	const boolFlagMatch = token.match(BOOL_FLAG);
	if (boolFlagMatch) {
		return {
			type: "flag",
			arg: {
				name: boolFlagMatch[1],
				defaultValue: false,
				isBoolean: true,
			},
		};
	}

	return null;
};

/**
 * Validate that variadic argument is the last positional argument.
 * Returns an error if validation fails.
 */
const validateVariadicPosition = (
	positional: readonly PositionalArg[],
): E.Either<SchemaParseError, void> => {
	const variadicIndex = positional.findIndex((arg) => arg.variadic);

	if (variadicIndex !== -1 && variadicIndex !== positional.length - 1) {
		return E.left(
			schemaParseError(
				`Variadic argument [${positional[variadicIndex].name}...] must be the last positional argument`,
				`[${positional[variadicIndex].name}...]`,
			),
		);
	}

	return E.right(undefined);
};

/**
 * Parse an argument-hint string into an ArgumentSchema.
 *
 * Supported patterns:
 * - `<name>` - Required positional argument
 * - `[name]` - Optional positional argument
 * - `[name...]` - Variadic argument (captures remaining positionals)
 * - `[--flag]` - Boolean flag (defaults to false)
 * - `[--flag=value]` - Flag with default value
 *
 * @param hint - The argument-hint string from command frontmatter
 * @returns Either a SchemaParseError or the parsed ArgumentSchema
 */
export const parseArgumentHint = (
	hint: string,
): E.Either<SchemaParseError, ArgumentSchema> => {
	const trimmed = hint.trim();
	if (trimmed === "") {
		return E.right({
			positional: [],
			flags: [],
			raw: hint,
		});
	}

	const tokens = trimmed.split(/\s+/);

	const positional: PositionalArg[] = [];
	const flags: FlagArg[] = [];
	const unrecognized: string[] = [];

	for (const token of tokens) {
		const parsed = parseToken(token);

		if (parsed === null) {
			unrecognized.push(token);
			continue;
		}

		if (parsed.type === "positional") {
			positional.push(parsed.arg);
		} else {
			flags.push(parsed.arg);
		}
	}

	// Warn about unrecognized tokens but don't fail
	// This allows forward compatibility with new syntax
	if (unrecognized.length > 0) {
		// In strict mode we would fail here, but for now we just ignore
		// unrecognized tokens to maintain backward compatibility
	}

	const validationResult = validateVariadicPosition(positional);
	if (E.isLeft(validationResult)) {
		return validationResult;
	}

	return E.right({
		positional,
		flags,
		raw: hint,
	});
};

/**
 * Create an empty schema for fallback scenarios.
 */
export const emptySchema = (): ArgumentSchema => ({
	positional: [],
	flags: [],
	raw: "",
});
