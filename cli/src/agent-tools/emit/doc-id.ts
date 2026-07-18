/**
 * Stable document identity (doc_id) utility for artifacts.
 * Generates UUID-based doc_ids and manages markdown frontmatter injection.
 */

import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse, stringify } from "yaml";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";

/** Result of resolving a doc_id for a file */
export interface DocIdResult {
	readonly docId: string;
	readonly isNew: boolean;
	/**
	 * Where the doc_id came from. "frontmatter" is authoritative (the file
	 * itself carries the identity); "existing" reuses a previously registered
	 * artifact row; "generated" is a freshly minted UUID.
	 */
	readonly source: "frontmatter" | "existing" | "generated";
}

const MARKDOWN_EXTENSIONS = new Set([".md", ".mdx"]);
const FRONTMATTER_REGEX = /^---\r?\n([\s\S]*?)\r?\n---/;

/**
 * Check whether a file path refers to a markdown file by extension.
 */
export const isMarkdownFile = (filePath: string): boolean =>
	MARKDOWN_EXTENSIONS.has(extname(filePath).toLowerCase());

/**
 * Generate a new doc_id using crypto.randomUUID().
 */
export const generateDocId = (): string => crypto.randomUUID();

/**
 * Parse YAML frontmatter from markdown content.
 * Returns the parsed object and the remaining body, or null if no frontmatter exists.
 */
export const parseFrontmatter = (
	content: string,
): { frontmatter: Record<string, unknown>; body: string } | null => {
	const match = content.match(FRONTMATTER_REGEX);
	if (!match) {
		return null;
	}

	const yamlText = match[1];
	const body = content.slice(match[0].length);
	const frontmatter = (parse(yamlText) ?? {}) as Record<string, unknown>;

	return { frontmatter, body };
};

/**
 * Inject or update rp1_doc_id in markdown content frontmatter.
 * Handles three cases:
 * 1. No frontmatter: prepends a new frontmatter block
 * 2. Existing frontmatter without rp1_doc_id: adds the field
 * 3. Existing frontmatter with rp1_doc_id: returns content unchanged
 */
export const injectFrontmatter = (
	content: string,
	docId: string,
): { content: string; isNew: boolean } => {
	const parsed = parseFrontmatter(content);

	if (!parsed) {
		const newFrontmatter = `---\nrp1_doc_id: ${docId}\n---\n`;
		return { content: newFrontmatter + content, isNew: true };
	}

	if (parsed.frontmatter.rp1_doc_id) {
		return { content, isNew: false };
	}

	parsed.frontmatter.rp1_doc_id = docId;
	const serialized = stringify(parsed.frontmatter).trimEnd();
	const newContent = `---\n${serialized}\n---${parsed.body}`;
	return { content: newContent, isNew: true };
};

/**
 * Force rp1_doc_id in a markdown file's frontmatter to the given value,
 * overwriting any existing id. Used to re-heal a file after a concurrent
 * registration race settles on a different doc_id than the one this
 * process injected.
 */
export const overwriteDocIdFrontmatter = async (
	filePath: string,
	docId: string,
): Promise<void> => {
	if (!isMarkdownFile(filePath)) return;

	const content = await readFile(filePath, "utf-8");
	const parsed = parseFrontmatter(content);

	if (!parsed) {
		await writeFile(
			filePath,
			`---\nrp1_doc_id: ${docId}\n---\n${content}`,
			"utf-8",
		);
		return;
	}

	if (parsed.frontmatter.rp1_doc_id === docId) return;

	parsed.frontmatter.rp1_doc_id = docId;
	const serialized = stringify(parsed.frontmatter).trimEnd();
	await writeFile(filePath, `---\n${serialized}\n---${parsed.body}`, "utf-8");
};

/**
 * Resolve the doc_id for a file path.
 *
 * For markdown files (.md, .mdx):
 * - Reads the file and parses frontmatter
 * - If rp1_doc_id exists in frontmatter, returns it (idempotent)
 * - If no rp1_doc_id, reuses `existingDocId` when provided (healing a
 *   rewrite that stripped frontmatter) or generates one, then injects it
 * - Writes the updated content back to the file
 *
 * For non-markdown files (which cannot carry frontmatter):
 * - Reuses `existingDocId` when provided, otherwise generates a UUID;
 *   the file is never modified
 *
 * `existingDocId` is the doc_id of the artifact row already registered at
 * this location, so re-registering the same file keeps a stable identity
 * instead of minting a duplicate artifact row per emit.
 */
export const resolveDocId = (
	filePath: string,
	existingDocId?: string,
): TE.TaskEither<CLIError, DocIdResult> => {
	if (!isMarkdownFile(filePath)) {
		return TE.right(
			existingDocId
				? { docId: existingDocId, isNew: false, source: "existing" as const }
				: { docId: generateDocId(), isNew: true, source: "generated" as const },
		);
	}

	return TE.tryCatch(
		async () => {
			const content = await readFile(filePath, "utf-8");
			const docId = existingDocId ?? generateDocId();
			const result = injectFrontmatter(content, docId);

			if (!result.isNew) {
				const parsed = parseFrontmatter(content);
				return {
					docId: String(parsed?.frontmatter.rp1_doc_id),
					isNew: false,
					source: "frontmatter" as const,
				};
			}

			await writeFile(filePath, result.content, "utf-8");
			return {
				docId,
				isNew: existingDocId === undefined,
				source: existingDocId ? ("existing" as const) : ("generated" as const),
			};
		},
		(error) =>
			runtimeError(
				`Failed to resolve doc_id for ${filePath}: ${error instanceof Error ? error.message : String(error)}`,
			),
	);
};
