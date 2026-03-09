/**
 * Platform conditional pre-processor for SKILL.md and agent source files.
 *
 * Evaluates Liquid platform conditionals (if, unless, case/when) in source
 * content before the main template render. Uses a separate Liquid instance
 * with strictVariables: false.
 *
 * Code blocks (fenced with triple backticks) are extracted before Liquid
 * rendering and reinserted after, preventing LiquidJS from throwing on
 * Liquid-like syntax in code examples.
 */

import * as E from "fp-ts/lib/Either.js";
import { Liquid } from "liquidjs";
import type { CLIError } from "../../shared/errors.js";
import { generationError } from "../../shared/errors.js";

const PLACEHOLDER_PREFIX = "@@RP1_CODEBLOCK_";
const PLACEHOLDER_SUFFIX = "@@";

/**
 * Build a regex-safe placeholder string for a code block index.
 */
const makePlaceholder = (index: number): string =>
	`${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;

/**
 * Extract all fenced code blocks from content, replacing them with
 * unique placeholders. Returns the modified content and the extracted blocks.
 *
 * Handles nested/consecutive fenced blocks and preserves the fence
 * characters (``` with optional language tag).
 */
const extractCodeBlocks = (
	content: string,
): { processed: string; blocks: string[] } => {
	const blocks: string[] = [];
	// Match fenced code blocks: ``` optionally followed by a language tag,
	// then any content (non-greedy), then closing ```.
	// The regex uses [^\S\n]* to allow optional leading whitespace on fence lines
	// but not newlines, making it work with indented code blocks.
	const fenceRegex = /^([^\S\n]*```[^\n]*\n[\s\S]*?\n[^\S\n]*```)/gm;

	const processed = content.replace(fenceRegex, (match) => {
		const index = blocks.length;
		blocks.push(match);
		return makePlaceholder(index);
	});

	return { processed, blocks };
};

/**
 * Reinsert extracted code blocks into content by replacing placeholders.
 */
const reinsertCodeBlocks = (content: string, blocks: string[]): string => {
	let result = content;
	for (let i = 0; i < blocks.length; i++) {
		result = result.replace(makePlaceholder(i), blocks[i]);
	}
	return result;
};

/**
 * Create a Liquid instance configured for pre-processing source files.
 * Uses strictVariables: false so that unknown variables (like {{ variable }})
 * in source content are silently ignored rather than throwing errors.
 */
const createPreprocessorLiquid = (): Liquid =>
	new Liquid({
		strictVariables: false,
		strictFilters: false,
	});

/**
 * Pre-process platform conditionals in source file content.
 *
 * Supports:
 * - {% if platform == "..." %} ... {% endif %}
 * - {% unless platform == "..." %} ... {% endunless %}
 * - {% case platform %} {% when "..." %} ... {% endcase %}
 * - Nested conditionals
 *
 * Code blocks (triple-backtick fenced) are protected from Liquid processing
 * to prevent errors on Liquid-like syntax in code examples.
 *
 * @param content - Raw source file content
 * @param platform - Target platform identifier
 * @returns Either a CLIError or the processed content string
 */
export const preprocessConditionals = async (
	content: string,
	platform: "opencode" | "codex" | "claude-code",
): Promise<E.Either<CLIError, string>> => {
	try {
		const { processed, blocks } = extractCodeBlocks(content);

		const liquid = createPreprocessorLiquid();
		const rendered = await liquid.parseAndRender(processed, { platform });

		const result = reinsertCodeBlocks(rendered, blocks);

		return E.right(result);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return E.left(
			generationError(
				"preprocessor",
				`Platform conditional pre-processing failed: ${message}`,
			),
		);
	}
};
