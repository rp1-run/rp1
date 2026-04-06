/**
 * Build-time generator for CATALOG.md from skill frontmatter metadata.
 *
 * Scans all plugins' skill directories, extracts `category` and `is_workflow`
 * from frontmatter metadata, and produces a structured markdown catalog
 * at plugins/base/skills/guide/CATALOG.md.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../shared/errors.js";
import type { SkillCategory } from "./models.js";
import { parseSkill } from "./parser.js";

const PLUGIN_NAMES = ["base", "dev", "utils"] as const;

const CATEGORY_ORDER: readonly SkillCategory[] = [
	"development",
	"investigation",
	"quality",
	"review",
	"documentation",
	"knowledge",
	"strategy",
	"planning",
	"prompt",
];

const CATEGORY_LABELS: Record<SkillCategory, string> = {
	development: "Development",
	investigation: "Investigation",
	quality: "Quality",
	review: "Review",
	documentation: "Documentation",
	knowledge: "Knowledge",
	strategy: "Strategy",
	planning: "Planning",
	prompt: "Prompt",
};

export interface CatalogEntry {
	readonly name: string;
	readonly plugin: string;
	readonly description: string;
	readonly category: SkillCategory;
	readonly isWorkflow: boolean;
	readonly keyArgs: readonly string[];
}

/**
 * Category-level trigger signals describing when to suggest skills
 * in each category. Used in rendered catalog for fast-path lookups.
 */
const CATEGORY_TRIGGERS: Record<SkillCategory, string> = {
	development:
		"User starts a new feature, describes a change, or needs to scaffold a project",
	investigation:
		"User is debugging, examining errors, or testing a design hypothesis",
	quality:
		"User finishes implementation and needs hygiene checks, audits, or comment cleanup",
	review:
		"User prepares a PR, receives review feedback, or needs visual diff understanding",
	documentation:
		"User writes, updates, or previews docs, diagrams, or project overviews",
	knowledge: "User needs codebase context, KB is stale, or wants KB templates",
	strategy:
		"User faces architectural decisions, security concerns, or needs deep research",
	planning:
		"User plans a project, audits a PRD, or manages blueprint lifecycle",
	prompt: "User authors, rewrites, or evaluates agent prompts",
};

/**
 * Scan all plugin skill directories and collect catalog entries.
 */
export const collectCatalogEntries = async (
	projectRoot: string,
): Promise<{ entries: CatalogEntry[]; errors: string[] }> => {
	const entries: CatalogEntry[] = [];
	const errors: string[] = [];

	for (const plugin of PLUGIN_NAMES) {
		const skillsDir = join(projectRoot, "plugins", plugin, "skills");
		let skillDirs: string[];
		try {
			const { readdir, stat } = await import("node:fs/promises");
			const dirEntries = await readdir(skillsDir, { withFileTypes: true });
			skillDirs = [];
			for (const entry of dirEntries) {
				if (entry.isDirectory()) {
					const skillMd = join(skillsDir, entry.name, "SKILL.md");
					try {
						await stat(skillMd);
						skillDirs.push(join(skillsDir, entry.name));
					} catch {
						// No SKILL.md, skip
					}
				}
			}
			skillDirs.sort();
		} catch {
			continue;
		}

		for (const skillDir of skillDirs) {
			const result = await parseSkill(skillDir)();
			if (E.isLeft(result)) {
				errors.push(
					`Failed to parse ${skillDir}: ${formatError(result.left, false)}`,
				);
				continue;
			}

			const skill = result.right;
			const category = skill.metadata?.category;
			if (!category) {
				continue;
			}

			const keyArgs: string[] = [];
			if (skill.metadata?.arguments) {
				for (const arg of skill.metadata.arguments) {
					keyArgs.push(arg.name);
				}
			}

			entries.push({
				name: skill.name,
				plugin,
				description: skill.description,
				category,
				isWorkflow: skill.metadata?.isWorkflow ?? false,
				keyArgs,
			});
		}
	}

	entries.sort((a, b) => {
		const catDiff =
			CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category);
		if (catDiff !== 0) return catDiff;
		return a.name.localeCompare(b.name);
	});

	return { entries, errors };
};

/**
 * Render catalog entries into markdown content.
 */
export const renderCatalog = (entries: readonly CatalogEntry[]): string => {
	const lines: string[] = [];
	lines.push("# rp1 Skill Catalog");
	lines.push("");
	lines.push(
		"> Auto-generated from skill frontmatter metadata. Do not edit manually.",
	);
	lines.push("");

	const byCategory = new Map<SkillCategory, CatalogEntry[]>();
	for (const entry of entries) {
		const list = byCategory.get(entry.category) ?? [];
		list.push(entry);
		byCategory.set(entry.category, list);
	}

	for (const category of CATEGORY_ORDER) {
		const categoryEntries = byCategory.get(category);
		if (!categoryEntries || categoryEntries.length === 0) continue;

		lines.push(`## ${CATEGORY_LABELS[category]}`);
		lines.push("");
		lines.push(`> **Suggest when**: ${CATEGORY_TRIGGERS[category]}`);
		lines.push("");
		lines.push("| Skill | Plugin | Description | Key Args | Workflow |");
		lines.push("|-------|--------|-------------|----------|----------|");

		for (const entry of categoryEntries) {
			const workflow = entry.isWorkflow ? "Yes" : "";
			const args =
				entry.keyArgs.length > 0 ? `\`${entry.keyArgs.join("`, `")}\`` : "";
			lines.push(
				`| \`/${entry.name}\` | ${entry.plugin} | ${entry.description} | ${args} | ${workflow} |`,
			);
		}

		lines.push("");
	}

	return lines.join("\n");
};

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
