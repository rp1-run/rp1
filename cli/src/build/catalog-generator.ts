import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CatalogRenderableEntry,
	collectScopedCatalogRegistry,
	renderCatalogMarkdown,
} from "../catalog/index.js";
import type { ParseCache } from "./parse-cache.js";

export type CatalogEntry = CatalogRenderableEntry;

/**
 * Collect distributable guide catalog entries from the shared registry.
 */
export const collectCatalogEntries = async (
	projectRoot: string,
	cache?: ParseCache,
): Promise<{ entries: CatalogEntry[]; errors: string[] }> => {
	const { entries, errors } = await collectScopedCatalogRegistry(
		projectRoot,
		"distributable",
		cache,
	);
	return {
		entries: entries.map((entry) => ({
			name: entry.name,
			plugin: entry.plugin,
			description: entry.description,
			category: entry.category,
			isWorkflow: entry.isWorkflow,
			keyArgs: entry.keyArgs,
			runPolicy: entry.runPolicy,
			identityArgs: entry.identityArgs,
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
 * Generate CATALOG.md at the target path from distributable registry entries.
 * Returns the list of errors encountered during parsing (non-fatal).
 */
export const generateCatalog = async (
	projectRoot: string,
	outputPath?: string,
	cache?: ParseCache,
): Promise<{ entries: CatalogEntry[]; errors: string[] }> => {
	const { entries, errors } = await collectCatalogEntries(projectRoot, cache);

	const catalogContent = renderCatalog(entries);
	const targetPath =
		outputPath ??
		join(projectRoot, "plugins", "base", "skills", "guide", "CATALOG.md");

	const targetDir = join(targetPath, "..");
	await mkdir(targetDir, { recursive: true });
	await writeFile(targetPath, catalogContent);

	return { entries, errors };
};
