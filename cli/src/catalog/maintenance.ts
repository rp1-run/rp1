import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { PluginName } from "../../shared/canonical-name.js";
import { formatError } from "../../shared/errors.js";
import { parseAgent } from "../build/parser.js";
import {
	buildGeneratedInitTemplatesFile,
	INIT_TEMPLATE_OUTPUT_RELATIVE_PATH,
	INIT_TEMPLATE_SOURCE_RELATIVE_PATH,
	readInitInstructionTemplate,
} from "../init/templates/generator.js";
import {
	collectScopedCatalogRegistry,
	renderCatalogMarkdown,
	renderInitSkillAwarenessBlock,
} from "./registry.js";

const DISTRIBUTABLE_AGENT_PLUGINS: readonly PluginName[] = ["base", "dev"];
const DUPLICATE_INVENTORY_TABLE_HEADER = "Installed plugins: rp1-";
const DUPLICATE_INVENTORY_MARKDOWN_ALLOWLIST = new Set([
	"AGENTS.md",
	"CLAUDE.md",
]);

export const GUIDE_CATALOG_RELATIVE_PATH = join(
	"plugins",
	"base",
	"skills",
	"guide",
	"CATALOG.md",
);

export const AGENT_CATALOG_RELATIVE_PATH = join("catalog", "agents.yaml");

export const SKILL_CATALOG_RELATIVE_PATH = join("catalog", "skills.yaml");

export interface CatalogArtifact {
	readonly relativePath: string;
	readonly content: string;
}

export interface CatalogValidationIssue {
	readonly relativePath: string;
	readonly message: string;
}

export interface CatalogValidationResult {
	readonly issues: readonly CatalogValidationIssue[];
}

interface AgentCatalogEntry {
	readonly canonicalName: string;
	readonly description: string;
	readonly plugin: PluginName;
	readonly lastChecksum: string;
}

const normalizeLineEndings = (content: string): string =>
	content.replace(/\r\n/g, "\n");

const compareCatalogIssues = (
	left: CatalogValidationIssue,
	right: CatalogValidationIssue,
): number =>
	left.relativePath.localeCompare(right.relativePath) ||
	left.message.localeCompare(right.message);

const compareAgentEntries = (
	left: AgentCatalogEntry,
	right: AgentCatalogEntry,
): number =>
	left.plugin.localeCompare(right.plugin) ||
	left.canonicalName.localeCompare(right.canonicalName);

const hashContent = (content: string): string =>
	createHash("sha256").update(content).digest("hex");

const renderYamlString = (value: string): string => JSON.stringify(value);

const resolveProjectPath = (
	projectRoot: string,
	relativePath: string,
): string => join(projectRoot, relativePath);

const toRelativeProjectPath = (
	projectRoot: string,
	absolutePath: string,
): string => relative(projectRoot, absolutePath).replaceAll("\\", "/");

const readDirEntriesIfPresent = async (path: string) => {
	try {
		return await readdir(path, { withFileTypes: true });
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return [];
		}

		throw error;
	}
};

const readFileIfPresent = async (path: string): Promise<string | null> => {
	try {
		return await readFile(path, "utf-8");
	} catch (error) {
		if (
			error &&
			typeof error === "object" &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return null;
		}

		throw error;
	}
};

const collectMarkdownFiles = async (
	directoryPath: string,
): Promise<string[]> => {
	const entries = await readDirEntriesIfPresent(directoryPath);
	const markdownFiles: string[] = [];

	for (const entry of entries) {
		const entryPath = join(directoryPath, entry.name);
		if (entry.isDirectory()) {
			markdownFiles.push(...(await collectMarkdownFiles(entryPath)));
			continue;
		}

		if (entry.isFile() && entry.name.endsWith(".md")) {
			markdownFiles.push(entryPath);
		}
	}

	return markdownFiles;
};

const collectDuplicateInventoryMarkdownCandidates = async (
	projectRoot: string,
): Promise<readonly string[]> => {
	const projectEntries = await readDirEntriesIfPresent(projectRoot);
	const rootMarkdownFiles = projectEntries
		.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
		.map((entry) => join(projectRoot, entry.name));
	const docsMarkdownFiles = await collectMarkdownFiles(
		join(projectRoot, "docs"),
	);

	return [...rootMarkdownFiles, ...docsMarkdownFiles]
		.map((path) => toRelativeProjectPath(projectRoot, path))
		.filter((path) => !DUPLICATE_INVENTORY_MARKDOWN_ALLOWLIST.has(path))
		.sort((left, right) => left.localeCompare(right));
};

const collectAgentCatalogEntries = async (
	projectRoot: string,
): Promise<{ entries: AgentCatalogEntry[]; errors: string[] }> => {
	const entries: AgentCatalogEntry[] = [];
	const errors: string[] = [];

	for (const plugin of DISTRIBUTABLE_AGENT_PLUGINS) {
		const agentsDir = join(projectRoot, "plugins", plugin, "agents");
		let agentFiles: string[] = [];

		try {
			const dirEntries = await readdir(agentsDir, { withFileTypes: true });
			agentFiles = dirEntries
				.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
				.map((entry) => join(agentsDir, entry.name))
				.sort();
		} catch {
			continue;
		}

		for (const agentFile of agentFiles) {
			const parsedAgent = await parseAgent(agentFile)();
			if (E.isLeft(parsedAgent)) {
				errors.push(
					`Failed to parse ${agentFile}: ${formatError(parsedAgent.left)}`,
				);
				continue;
			}

			const content = await readFile(agentFile, "utf-8");
			entries.push({
				canonicalName: `rp1-${plugin}:${basename(agentFile, ".md")}`,
				description: parsedAgent.right.description,
				plugin,
				lastChecksum: hashContent(content),
			});
		}
	}

	return {
		entries: [...entries].sort(compareAgentEntries),
		errors,
	};
};

const renderAgentCatalog = (entries: readonly AgentCatalogEntry[]): string => {
	const lines = [
		"# rp1 Agents Catalogue",
		"# Auto-generated by the registry-backed catalog maintenance flow.",
		"# Run `just catalog-generate` to regenerate.",
		"# Run `just catalog-check` to verify freshness.",
		"#",
		"# Transitional derived artifact: preserves agent freshness checks.",
		"# Not authoritative for product discovery.",
		"",
	];

	if (entries.length === 0) {
		lines.push("agents: []");
		return `${lines.join("\n")}\n`;
	}

	lines.push("agents:");

	for (const entry of entries) {
		lines.push(`  - name: ${entry.canonicalName}`);
		lines.push(`    description: ${renderYamlString(entry.description)}`);
		lines.push(`    plugin: ${entry.plugin}`);
		lines.push(`    last_checksum: ${entry.lastChecksum}`);
	}

	return `${lines.join("\n")}\n`;
};

const collectRegistryBackedArtifacts = async (
	projectRoot: string,
): Promise<{ artifacts: CatalogArtifact[]; errors: string[] }> => {
	const { entries, errors } = await collectScopedCatalogRegistry(
		projectRoot,
		"distributable",
	);
	const templateSource = await readInitInstructionTemplate(projectRoot);
	const skillAwarenessBlock = renderInitSkillAwarenessBlock(entries);
	const initTemplatesContent = await buildGeneratedInitTemplatesFile(
		templateSource,
		skillAwarenessBlock,
	);
	const agentCatalog = await collectAgentCatalogEntries(projectRoot);

	return {
		artifacts: [
			{
				relativePath: GUIDE_CATALOG_RELATIVE_PATH,
				content: renderCatalogMarkdown(entries),
			},
			{
				relativePath: INIT_TEMPLATE_OUTPUT_RELATIVE_PATH,
				content: initTemplatesContent,
			},
			{
				relativePath: AGENT_CATALOG_RELATIVE_PATH,
				content: renderAgentCatalog(agentCatalog.entries),
			},
		],
		errors: [...errors, ...agentCatalog.errors],
	};
};

const compareArtifacts = async (
	projectRoot: string,
	artifacts: readonly CatalogArtifact[],
): Promise<CatalogValidationIssue[]> => {
	const issues: CatalogValidationIssue[] = [];

	for (const artifact of artifacts) {
		const path = resolveProjectPath(projectRoot, artifact.relativePath);
		const currentContent = await readFileIfPresent(path);
		if (currentContent === null) {
			issues.push({
				relativePath: artifact.relativePath,
				message: "Missing generated artifact. Run `just catalog-generate`.",
			});
			continue;
		}

		if (
			normalizeLineEndings(currentContent) !==
			normalizeLineEndings(artifact.content)
		) {
			issues.push({
				relativePath: artifact.relativePath,
				message: "Stale generated artifact. Run `just catalog-generate`.",
			});
		}
	}

	return issues;
};

const validateDuplicateInventoryGuards = async (
	projectRoot: string,
): Promise<CatalogValidationIssue[]> => {
	const issues: CatalogValidationIssue[] = [];
	const legacySkillCatalogPath = resolveProjectPath(
		projectRoot,
		SKILL_CATALOG_RELATIVE_PATH,
	);

	if (existsSync(legacySkillCatalogPath)) {
		issues.push({
			relativePath: SKILL_CATALOG_RELATIVE_PATH,
			message:
				"Legacy skill catalog is no longer an approved discovery view. Remove it with `just catalog-generate`.",
		});
	}

	const instructionTemplate = await readInitInstructionTemplate(projectRoot);
	if (instructionTemplate.includes(DUPLICATE_INVENTORY_TABLE_HEADER)) {
		issues.push({
			relativePath: INIT_TEMPLATE_SOURCE_RELATIVE_PATH,
			message:
				"Init instruction template must not embed a hard-coded skill inventory table. Render `{{ skillAwarenessBlock }}` instead.",
		});
	}

	for (const relativePath of await collectDuplicateInventoryMarkdownCandidates(
		projectRoot,
	)) {
		const content = await readFileIfPresent(
			resolveProjectPath(projectRoot, relativePath),
		);
		if (!content || !content.includes(DUPLICATE_INVENTORY_TABLE_HEADER)) {
			continue;
		}

		issues.push({
			relativePath,
			message:
				"Manual skill-awareness inventory tables are not approved discovery views. Use the registry-backed generated surfaces instead.",
		});
	}

	return issues;
};

export const writeCatalogArtifacts = async (
	projectRoot: string,
): Promise<{
	artifacts: readonly CatalogArtifact[];
	errors: readonly string[];
}> => {
	const result = await collectRegistryBackedArtifacts(projectRoot);
	if (result.errors.length > 0) {
		return result;
	}

	for (const artifact of result.artifacts) {
		const path = resolveProjectPath(projectRoot, artifact.relativePath);
		await mkdir(dirname(path), { recursive: true });
		await writeFile(path, artifact.content);
	}

	const legacySkillCatalogPath = resolveProjectPath(
		projectRoot,
		SKILL_CATALOG_RELATIVE_PATH,
	);
	if (existsSync(legacySkillCatalogPath)) {
		await rm(legacySkillCatalogPath);
	}

	return result;
};

export const checkCatalogArtifacts = async (
	projectRoot: string,
): Promise<CatalogValidationResult> => {
	const result = await collectRegistryBackedArtifacts(projectRoot);
	const issues: CatalogValidationIssue[] = [
		...result.errors.map((error) => ({
			relativePath: "catalog-registry",
			message: error,
		})),
	];

	issues.push(...(await compareArtifacts(projectRoot, result.artifacts)));
	issues.push(...(await validateDuplicateInventoryGuards(projectRoot)));

	return {
		issues: [...issues].sort(compareCatalogIssues),
	};
};
