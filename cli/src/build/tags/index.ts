/**
 * Custom Liquid tag registration and shared tag utilities.
 *
 * Exports a registration function that binds all custom semantic tags onto
 * a LiquidJS Liquid instance. Tags are evaluated during the preprocessor phase
 * to produce platform-specific instruction blocks.
 *
 * Each tag module exports a Tag subclass following LiquidJS's custom Tag API.
 * This module provides shared utilities: argument parsing, namespace
 * transformation, and the registerTags() entry point.
 *
 * Mirrors the registerFilters() pattern in cli/src/build/filters/index.ts.
 */

import * as E from "fp-ts/lib/Either.js";
import type { Liquid } from "liquidjs";
import {
	parseUserFacing,
	toPluginName,
} from "../../../shared/canonical-name.js";
import type { BuildPlatform } from "../template-context.js";
import { AskUserTag } from "./ask-user.js";
import { DispatchAgentTag } from "./dispatch-agent.js";
import { EditModelTag } from "./edit-model.js";
import { PermissionsTag } from "./permissions.js";
import { PlanToolTag } from "./plan-tool.js";
import { WebAccessTag } from "./web-access.js";

// ---------------------------------------------------------------------------
// Parsed tag arguments model
// ---------------------------------------------------------------------------

/**
 * Result of parsing tag arguments from a tag token's args string.
 *
 * Supports positional string arguments and named key-value pairs.
 * Named values can be a single string or an array of strings
 * (e.g., `options: "A", "B", "C"`).
 */
export interface ParsedTagArgs {
	readonly positional: readonly string[];
	readonly named: Readonly<Record<string, string | readonly string[]>>;
}

// ---------------------------------------------------------------------------
// Tag argument parser
// ---------------------------------------------------------------------------

/**
 * State machine states for the argument parser.
 */
enum ParserState {
	/** Looking for the start of a token (skipping whitespace/commas). */
	Seeking,
	/** Inside a double-quoted string. */
	InDoubleQuote,
	/** Inside a single-quoted string. */
	InSingleQuote,
	/** Accumulating an unquoted token (keyword or named key). */
	InBareWord,
}

/**
 * Parse a Liquid tag argument string into positional and named arguments.
 *
 * Syntax rules:
 *  - Positional args are comma-separated quoted strings:
 *      `"arg1", "arg2"` or `'arg1', 'arg2'`
 *  - Named args use `key: value` syntax where value is a quoted string:
 *      `options: "A", "B"`
 *  - A named key captures all subsequent quoted values until the next named
 *    key or end of input as an array.
 *  - Bare words (unquoted tokens like `background`) are positional args.
 *  - Commas between arguments are optional separators.
 *
 * @param args - Raw argument string from TagToken.args
 * @returns Parsed positional and named arguments
 */
export function parseTagArgs(args: string): ParsedTagArgs {
	const positional: string[] = [];
	const named: Record<string, string | string[]> = {};

	const trimmed = args.trim();
	if (trimmed.length === 0) {
		return { positional, named };
	}

	let state: ParserState = ParserState.Seeking;
	let currentToken = "";
	let currentNamedKey: string | null = null;

	const flushToken = (token: string): void => {
		if (currentNamedKey !== null) {
			const existing = named[currentNamedKey];
			if (existing === undefined) {
				named[currentNamedKey] = token;
			} else if (typeof existing === "string") {
				named[currentNamedKey] = [existing, token];
			} else {
				named[currentNamedKey] = [...existing, token];
			}
		} else {
			positional.push(token);
		}
	};

	for (let i = 0; i < trimmed.length; i++) {
		const ch = trimmed[i];

		switch (state) {
			case ParserState.Seeking:
				if (ch === '"') {
					state = ParserState.InDoubleQuote;
					currentToken = "";
				} else if (ch === "'") {
					state = ParserState.InSingleQuote;
					currentToken = "";
				} else if (ch !== " " && ch !== "\t" && ch !== "," && ch !== "\n") {
					state = ParserState.InBareWord;
					currentToken = ch;
				}
				break;

			case ParserState.InDoubleQuote:
				if (ch === "\\") {
					if (i + 1 < trimmed.length) {
						currentToken += trimmed[++i];
					}
				} else if (ch === '"') {
					flushToken(currentToken);
					currentToken = "";
					state = ParserState.Seeking;
				} else {
					currentToken += ch;
				}
				break;

			case ParserState.InSingleQuote:
				if (ch === "\\") {
					if (i + 1 < trimmed.length) {
						currentToken += trimmed[++i];
					}
				} else if (ch === "'") {
					flushToken(currentToken);
					currentToken = "";
					state = ParserState.Seeking;
				} else {
					currentToken += ch;
				}
				break;

			case ParserState.InBareWord:
				if (ch === ":") {
					// This bare word is a named key
					currentNamedKey = currentToken.trim();
					currentToken = "";
					state = ParserState.Seeking;
				} else if (ch === "," || ch === " " || ch === "\t" || ch === "\n") {
					// End of bare word, it's a positional value
					const word = currentToken.trim();
					if (word.length > 0) {
						flushToken(word);
					}
					currentToken = "";
					state = ParserState.Seeking;
				} else {
					currentToken += ch;
				}
				break;
		}
	}

	// Flush remaining bare word if any
	if (state === ParserState.InBareWord) {
		const word = currentToken.trim();
		if (word.length > 0) {
			flushToken(word);
		}
	}

	return { positional, named };
}

// ---------------------------------------------------------------------------
// Platform-aware namespace transformation
// ---------------------------------------------------------------------------

/**
 * Transform a canonical agent/skill reference (CC-native colon format)
 * into the platform-appropriate namespace format.
 *
 * | Platform    | Input              | Output               |
 * |-------------|--------------------|----------------------|
 * | claude-code | `rp1-dev:agent`    | `rp1-dev:agent`      |
 * | opencode    | `rp1-dev:agent`    | `@rp1-dev/agent`     |
 * | codex       | `rp1-dev:agent`    | `rp1-dev-agent`      |
 *
 * @param ref - Canonical reference in `rp1-{plugin}:{name}` format
 * @param platform - Target build platform
 * @returns Platform-appropriate namespace reference
 */
export function transformNamespace(
	ref: string,
	platform: BuildPlatform,
): string {
	const parsed = parseUserFacing(ref);
	if (E.isLeft(parsed)) return ref;

	const { artifact } = parsed.right;
	const pluginName = toPluginName(parsed.right);

	switch (platform) {
		case "claude-code":
			return ref;
		case "opencode":
			// rp1-base:agent -> @rp1-base/agent
			return `@${pluginName}/${artifact}`;
		case "codex":
			// rp1-base:agent -> rp1-base-agent
			return `${pluginName}-${artifact}`;
	}
}

// ---------------------------------------------------------------------------
// Tag registration
// ---------------------------------------------------------------------------

/**
 * Register all custom semantic Liquid tags on the given engine instance.
 *
 * Tags are evaluated during the preprocessor phase to produce
 * platform-specific instruction blocks. They read the `platform` variable
 * from the Liquid render context.
 *
 * Tag implementations will be imported and registered here as they are
 * created.
 *
 * @param liquid - LiquidJS Liquid instance to register tags on
 */
export function registerTags(liquid: Liquid): void {
	liquid.registerTag("dispatch_agent", DispatchAgentTag);
	liquid.registerTag("ask_user", AskUserTag);
	liquid.registerTag("edit_model", EditModelTag);
	liquid.registerTag("permissions", PermissionsTag);
	liquid.registerTag("plan_tool", PlanToolTag);
	liquid.registerTag("web_access", WebAccessTag);
}
