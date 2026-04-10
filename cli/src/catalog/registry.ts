import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { PluginName } from "../../shared/canonical-name.js";
import {
	PLUGIN_NAMES,
	toCanonicalString,
	toUserFacing,
} from "../../shared/canonical-name.js";
import { formatError } from "../../shared/errors.js";
import type { ArgumentDefinition, SkillCategory } from "../build/models.js";
import { parseSkill } from "../build/parser.js";

export type CatalogDistributionScope = "distributable" | "internal";
export type CatalogScope = "distributable" | "all";

export interface CatalogRenderableEntry {
	readonly name: string;
	readonly plugin: PluginName;
	readonly description: string;
	readonly category: SkillCategory;
	readonly isWorkflow: boolean;
	readonly keyArgs: readonly string[];
}

export interface CatalogRegistryEntry extends CatalogRenderableEntry {
	readonly canonicalName: string;
	readonly userFacingName: string;
	readonly argumentDefs: readonly ArgumentDefinition[];
	readonly distributionScope: CatalogDistributionScope;
	readonly sourcePath: string;
}

export interface CollectedCatalogRegistry {
	readonly entries: CatalogRegistryEntry[];
	readonly errors: string[];
}

const DISTRIBUTABLE_PLUGIN_NAMES: readonly PluginName[] = ["base", "dev"];

export const CATEGORY_ORDER: readonly SkillCategory[] = [
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

export const CATEGORY_LABELS: Record<SkillCategory, string> = {
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

export const CATEGORY_TRIGGERS: Record<SkillCategory, string> = {
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

const CATALOG_SCOPE_PLUGIN_NAMES: Record<CatalogScope, readonly PluginName[]> =
	{
		distributable: DISTRIBUTABLE_PLUGIN_NAMES,
		all: PLUGIN_NAMES,
	};

const DISTRIBUTABLE_PLUGIN_NAME_SET = new Set<PluginName>(
	DISTRIBUTABLE_PLUGIN_NAMES,
);

const compareCatalogEntries = (
	left: CatalogRenderableEntry,
	right: CatalogRenderableEntry,
): number => {
	const categoryDiff =
		CATEGORY_ORDER.indexOf(left.category) -
		CATEGORY_ORDER.indexOf(right.category);
	if (categoryDiff !== 0) {
		return categoryDiff;
	}

	const pluginDiff = left.plugin.localeCompare(right.plugin);
	if (pluginDiff !== 0) {
		return pluginDiff;
	}

	return left.name.localeCompare(right.name);
};

const sortCatalogEntries = <T extends CatalogRenderableEntry>(
	entries: readonly T[],
): T[] => [...entries].sort(compareCatalogEntries);

const listSkillDirectories = async (
	projectRoot: string,
	plugin: PluginName,
): Promise<string[]> => {
	const skillsDir = join(projectRoot, "plugins", plugin, "skills");
	try {
		const dirEntries = await readdir(skillsDir, { withFileTypes: true });
		const skillDirs: string[] = [];

		for (const entry of dirEntries) {
			if (!entry.isDirectory()) {
				continue;
			}

			const skillMdPath = join(skillsDir, entry.name, "SKILL.md");
			try {
				await stat(skillMdPath);
				skillDirs.push(join(skillsDir, entry.name));
			} catch {}
		}

		return skillDirs.sort();
	} catch {
		return [];
	}
};

const toRegistryEntry = (
	plugin: PluginName,
	skillDir: string,
	name: string,
	description: string,
	category: SkillCategory,
	isWorkflow: boolean,
	argumentDefs: readonly ArgumentDefinition[],
): CatalogRegistryEntry => {
	const canonicalName = toCanonicalString({ plugin, artifact: name });

	return {
		canonicalName,
		userFacingName: toUserFacing({ plugin, artifact: name }),
		name,
		plugin,
		description,
		category,
		isWorkflow,
		keyArgs: argumentDefs.map((argument) => argument.name),
		argumentDefs,
		distributionScope: DISTRIBUTABLE_PLUGIN_NAME_SET.has(plugin)
			? "distributable"
			: "internal",
		sourcePath: join(skillDir, "SKILL.md"),
	};
};

export const getCatalogPluginsForScope = (
	scope: CatalogScope,
): readonly PluginName[] => CATALOG_SCOPE_PLUGIN_NAMES[scope];

export const getCatalogDistributionScope = (
	plugin: PluginName,
): CatalogDistributionScope =>
	DISTRIBUTABLE_PLUGIN_NAME_SET.has(plugin) ? "distributable" : "internal";

export const filterCatalogEntriesByScope = <T extends CatalogRenderableEntry>(
	entries: readonly T[],
	scope: CatalogScope,
): T[] => {
	const plugins = new Set<PluginName>(getCatalogPluginsForScope(scope));
	return sortCatalogEntries(
		entries.filter((entry) => plugins.has(entry.plugin)),
	);
};

export const groupCatalogEntriesByCategory = <T extends CatalogRenderableEntry>(
	entries: readonly T[],
): Map<SkillCategory, T[]> => {
	const groupedEntries = new Map<SkillCategory, T[]>();

	for (const entry of sortCatalogEntries(entries)) {
		const categoryEntries = groupedEntries.get(entry.category) ?? [];
		categoryEntries.push(entry);
		groupedEntries.set(entry.category, categoryEntries);
	}

	return groupedEntries;
};

export const buildCatalogLookup = (
	entries: readonly CatalogRegistryEntry[],
	scope: CatalogScope = "all",
): ReadonlyMap<string, CatalogRegistryEntry> =>
	new Map(
		filterCatalogEntriesByScope(entries, scope).map((entry) => [
			entry.canonicalName,
			entry,
		]),
	);

export const findCatalogEntryByCanonicalName = (
	entries: readonly CatalogRegistryEntry[],
	canonicalName: string,
	scope: CatalogScope = "all",
): CatalogRegistryEntry | undefined =>
	buildCatalogLookup(entries, scope).get(canonicalName);

export const selectCatalogEntriesByCanonicalNames = (
	entries: readonly CatalogRegistryEntry[],
	canonicalNames: readonly string[],
	scope: CatalogScope = "all",
): CatalogRegistryEntry[] => {
	const lookup = buildCatalogLookup(entries, scope);
	const selectedEntries: CatalogRegistryEntry[] = [];
	const seenCanonicalNames = new Set<string>();

	for (const canonicalName of canonicalNames) {
		if (seenCanonicalNames.has(canonicalName)) {
			continue;
		}

		const entry = lookup.get(canonicalName);
		if (!entry) {
			continue;
		}

		seenCanonicalNames.add(canonicalName);
		selectedEntries.push(entry);
	}

	return sortCatalogEntries(selectedEntries);
};

export const collectCatalogRegistry = async (
	projectRoot: string,
): Promise<CollectedCatalogRegistry> => {
	const entries: CatalogRegistryEntry[] = [];
	const errors: string[] = [];

	for (const plugin of PLUGIN_NAMES) {
		const skillDirs = await listSkillDirectories(projectRoot, plugin);

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

			const argumentDefs = [...(skill.metadata?.arguments ?? [])];
			entries.push(
				toRegistryEntry(
					plugin,
					skillDir,
					skill.name,
					skill.description,
					category,
					skill.metadata?.isWorkflow ?? false,
					argumentDefs,
				),
			);
		}
	}

	return {
		entries: sortCatalogEntries(entries),
		errors,
	};
};

export const collectScopedCatalogRegistry = async (
	projectRoot: string,
	scope: CatalogScope,
): Promise<CollectedCatalogRegistry> => {
	const { entries, errors } = await collectCatalogRegistry(projectRoot);
	return {
		entries: filterCatalogEntriesByScope(entries, scope),
		errors,
	};
};

export const renderCatalogMarkdown = (
	entries: readonly CatalogRenderableEntry[],
): string => {
	const lines: string[] = [];
	lines.push("# rp1 Skill Catalog");
	lines.push("");
	lines.push(
		"> Auto-generated from skill frontmatter metadata. Do not edit manually.",
	);
	lines.push("");

	const groupedEntries = groupCatalogEntriesByCategory(entries);

	for (const category of CATEGORY_ORDER) {
		const categoryEntries = groupedEntries.get(category);
		if (!categoryEntries || categoryEntries.length === 0) {
			continue;
		}

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
