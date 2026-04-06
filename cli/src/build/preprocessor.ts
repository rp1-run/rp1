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
import type { PlatformRegistry } from "./models.js";
import { registerTags } from "./tags/index.js";
import type { BuildPlatform } from "./template-context.js";

const PLACEHOLDER_PREFIX = "@@RP1_CODEBLOCK_";
const OUTPUT_TAG_PREFIX = "@@RP1_OUTPUTTAG_";
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
 * Extract Liquid output tags ({{ ... }}) that are NOT platform-related,
 * replacing them with unique placeholders. This prevents LiquidJS from
 * trying to evaluate expressions like {{$RP1_ROOT}} which are not valid
 * Liquid but are used as template variable references in skill content.
 */
const extractOutputTags = (
	content: string,
): { processed: string; tags: string[] } => {
	const tags: string[] = [];
	const outputTagRegex = /\{\{[^}]*\}\}/g;

	const processed = content.replace(outputTagRegex, (match) => {
		const index = tags.length;
		tags.push(match);
		return `${OUTPUT_TAG_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
	});

	return { processed, tags };
};

/**
 * Reinsert extracted output tags into content by replacing placeholders.
 */
const reinsertOutputTags = (content: string, tags: string[]): string => {
	let result = content;
	for (let i = 0; i < tags.length; i++) {
		result = result.replace(
			`${OUTPUT_TAG_PREFIX}${i}${PLACEHOLDER_SUFFIX}`,
			tags[i],
		);
	}
	return result;
};

/**
 * Create a Liquid instance configured for pre-processing source files.
 * Uses strictVariables: false so that unknown variables (like {{ variable }})
 * in source content are silently ignored rather than throwing errors.
 * Registers custom semantic tags for platform-specific rendering.
 */
const createPreprocessorLiquid = (): Liquid => {
	const liquid = new Liquid({
		strictVariables: false,
		strictFilters: false,
	});
	registerTags(liquid);
	return liquid;
};

/**
 * Pre-process platform conditionals in source file content.
 *
 * Supports:
 * - {% if platform == "..." %} ... {% endif %}
 * - {% unless platform == "..." %} ... {% endunless %}
 * - {% case platform %} {% when "..." %} ... {% endcase %}
 * - Custom semantic tags ({% dispatch_agent %}, {% ask_user %}, etc.)
 * - Nested conditionals
 *
 * Code blocks (triple-backtick fenced) are protected from Liquid processing
 * to prevent errors on Liquid-like syntax in code examples.
 *
 * @param content - Raw source file content
 * @param platform - Target platform identifier
 * @param registry - Platform registry for tool/namespace mappings (optional)
 * @param skillMap - Skill name to path map for Codex resolution (optional)
 * @returns Either a CLIError or the processed content string
 */
export const preprocessConditionals = async (
	content: string,
	platform: BuildPlatform,
	registry?: PlatformRegistry,
	skillMap?: ReadonlyMap<string, string>,
): Promise<E.Either<CLIError, string>> => {
	try {
		const { processed: withoutCode, blocks } = extractCodeBlocks(content);
		const { processed, tags } = extractOutputTags(withoutCode);

		const liquid = createPreprocessorLiquid();
		const context: Record<string, unknown> = { platform };
		if (registry !== undefined) {
			context.registry = registry;
		}
		if (skillMap !== undefined) {
			context.skillMap = skillMap;
		}
		const rendered = await liquid.parseAndRender(processed, context);

		const withTags = reinsertOutputTags(rendered, tags);
		const result = reinsertCodeBlocks(withTags, blocks);

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
