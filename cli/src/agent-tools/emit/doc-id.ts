/**
 * Stable document identity (doc_id) utility for artifacts.
 * Generates UUID-based doc_ids and manages markdown frontmatter injection.
 */

import { readFile, writeFile } from "node:fs/promises";
import { extname } from "node:path";
import { parse, stringify } from "yaml";

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
 * Read the rp1_doc_id carried in a markdown file's frontmatter without
 * modifying the file. Returns null for non-markdown files, files without
 * an rp1_doc_id, and unreadable files. This is the only pre-registration
 * identity probe: a speculative doc_id must never be written to the file
 * before the registration transaction picks the winning identity, or a
 * concurrent registration could adopt a transient losing id as
 * authoritative.
 */
export const readFrontmatterDocId = async (
	filePath: string,
): Promise<string | null> => {
	if (!isMarkdownFile(filePath)) return null;

	let content: string;
	try {
		content = await readFile(filePath, "utf-8");
	} catch {
		return null;
	}

	const docId = parseFrontmatter(content)?.frontmatter.rp1_doc_id;
	return docId ? String(docId) : null;
};

/**
 * Force rp1_doc_id in a markdown file's frontmatter to the given value,
 * overwriting any existing id. Called after the registration transaction
 * settles the winning identity, to stamp it into the file.
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
