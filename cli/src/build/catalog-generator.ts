import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CatalogRenderableEntry,
	collectCatalogRegistry,
	renderCatalogMarkdown,
} from "../catalog/index.js";

export type CatalogEntry = CatalogRenderableEntry;

/**
 * Scan all plugin skill directories and collect catalog entries.
 */
export const collectCatalogEntries = async (
	projectRoot: string,
): Promise<{ entries: CatalogEntry[]; errors: string[] }> => {
	const { entries, errors } = await collectCatalogRegistry(projectRoot);
	return {
		entries: entries.map((entry) => ({
			name: entry.name,
			plugin: entry.plugin,
			description: entry.description,
			category: entry.category,
			isWorkflow: entry.isWorkflow,
			keyArgs: entry.keyArgs,
		})),
		errors,
	};
};

/**
 * Render catalog entries into markdown content.
 */
export const renderCatalog = (entries: readonly CatalogEntry[]): string =>
	renderCatalogMarkdown(entries);

/**
 * Generate CATALOG.md at the target path from all plugin skill frontmatter.
 * Returns the list of errors encountered during parsing (non-fatal).
 */
export const generateCatalog = async (
	projectRoot: string,
	outputPath?: string,
): Promise<{ entries: CatalogEntry[]; errors: string[] }> => {
	const { entries, errors } = await collectCatalogEntries(projectRoot);

	const catalogContent = renderCatalog(entries);
	const targetPath =
		outputPath ??
		join(projectRoot, "plugins", "base", "skills", "guide", "CATALOG.md");

	const targetDir = join(targetPath, "..");
	await mkdir(targetDir, { recursive: true });
	await writeFile(targetPath, catalogContent);

	return { entries, errors };
};
