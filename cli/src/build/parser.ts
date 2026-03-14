/**
 * Frontmatter parsing for Claude Code commands, agents, and skills.
 */

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { parse as parseYaml } from "yaml";
import type { CLIError } from "../../shared/errors.js";
import { parseError } from "../../shared/errors.js";
import type {
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
	SkillMetadata,
} from "./models.js";

/**
 * Normalize date values to ISO format strings.
 */
const normalizeDate = (value: unknown): string => {
	if (value instanceof Date) {
		return value.toISOString().split("T")[0];
	}
	if (typeof value === "string") {
		return value;
	}
	return String(value);
};

/**
 * Extract YAML frontmatter and content from markdown.
 */
const extractFrontmatter = (
	content: string,
	filePath: string,
): E.Either<CLIError, { metadata: Record<string, unknown>; body: string }> => {
	if (!content.startsWith("---")) {
		return E.left(
			parseError(filePath, "Missing YAML frontmatter (must start with ---)"),
		);
	}

	const parts = content.split("---");
	if (parts.length < 3) {
		return E.left(
			parseError(
				filePath,
				"Invalid frontmatter structure (must have opening and closing ---)",
			),
		);
	}

	const frontmatterText = parts[1];
	const bodyParts = parts.slice(2);
	const body = bodyParts.join("---").trim();

	try {
		const metadata = parseYaml(frontmatterText) as Record<string, unknown>;
		if (metadata === null || typeof metadata !== "object") {
			return E.left(
				parseError(filePath, "Frontmatter is empty or not an object"),
			);
		}
		return E.right({ metadata, body });
	} catch (e) {
		return E.left(parseError(filePath, `YAML parse error: ${e}`));
	}
};

/**
 * Parse Claude Code command markdown with YAML frontmatter.
 */
export const parseCommand = (
	filePath: string,
): TE.TaskEither<CLIError, ClaudeCodeCommand> =>
	pipe(
		TE.tryCatch(
			() => readFile(filePath, "utf-8"),
			(e) => parseError(filePath, `Failed to read file: ${e}`),
		),
		TE.chain((content) =>
			pipe(extractFrontmatter(content, filePath), TE.fromEither),
		),
		TE.chain(({ metadata, body }) => {
			const name = metadata.name;
			const version = metadata.version;
			const description = metadata.description;
			const author = metadata.author;
			const created = metadata.created;

			if (!name || !version || !description || !author || !created) {
				const missing = [
					!name && "name",
					!version && "version",
					!description && "description",
					!author && "author",
					!created && "created",
				].filter(Boolean);
				return TE.left(
					parseError(
						filePath,
						`Missing required fields: ${missing.join(", ")}`,
					),
				);
			}

			const command: ClaudeCodeCommand = {
				name: String(name),
				version: String(version),
				description: String(description),
				argumentHint: metadata["argument-hint"] as string | undefined,
				tags: Array.isArray(metadata.tags) ? metadata.tags : [],
				created: normalizeDate(created),
				updated: metadata.updated ? normalizeDate(metadata.updated) : undefined,
				author: String(author),
				content: body,
			};

			return TE.right(command);
		}),
	);

/**
 * Parse Claude Code agent markdown with YAML frontmatter.
 */
export const parseAgent = (
	filePath: string,
): TE.TaskEither<CLIError, ClaudeCodeAgent> =>
	pipe(
		TE.tryCatch(
			() => readFile(filePath, "utf-8"),
			(e) => parseError(filePath, `Failed to read file: ${e}`),
		),
		TE.chain((content) =>
			pipe(extractFrontmatter(content, filePath), TE.fromEither),
		),
		TE.chain(({ metadata, body }) => {
			const name = metadata.name;
			const description = metadata.description;
			const model = metadata.model;

			if (!name || !description) {
				const missing = [!name && "name", !description && "description"].filter(
					Boolean,
				);
				return TE.left(
					parseError(
						filePath,
						`Missing required fields: ${missing.join(", ")}`,
					),
				);
			}

			// Handle tools as list or comma-separated string
			let tools: string[] = [];
			const toolsRaw = metadata.tools;
			if (Array.isArray(toolsRaw)) {
				tools = toolsRaw.map(String);
			} else if (typeof toolsRaw === "string") {
				tools = toolsRaw.split(",").map((t) => t.trim());
			}

			const agent: ClaudeCodeAgent = {
				name: String(name),
				description: String(description),
				tools,
				model: model ? String(model) : "inherit",
				content: body,
			};

			return TE.right(agent);
		}),
	);

/**
 * Extract rp1-specific metadata from the frontmatter `metadata` map.
 * Returns undefined when the metadata map is absent or not an object,
 * preserving backward compatibility with pre-migration skills.
 */
const extractSkillMetadata = (raw: unknown): SkillMetadata | undefined => {
	if (
		raw === null ||
		raw === undefined ||
		typeof raw !== "object" ||
		Array.isArray(raw)
	) {
		return undefined;
	}

	const meta = raw as Record<string, unknown>;
	const result: SkillMetadata = {
		version: typeof meta.version === "string" ? meta.version : undefined,
		tags: Array.isArray(meta.tags) ? meta.tags.map(String) : undefined,
		created: meta.created != null ? normalizeDate(meta.created) : undefined,
		updated: meta.updated != null ? normalizeDate(meta.updated) : undefined,
		author: typeof meta.author === "string" ? meta.author : undefined,
		argumentHint:
			typeof meta["argument-hint"] === "string"
				? meta["argument-hint"]
				: undefined,
		subAgents: Array.isArray(meta.sub_agents)
			? meta.sub_agents.map(String)
			: undefined,
	};

	// Return undefined if all fields are undefined (no meaningful metadata)
	const hasAnyField = Object.values(result).some((v) => v !== undefined);
	return hasAnyField ? result : undefined;
};

/**
 * Parse Claude Code skill from SKILL.md + supporting files.
 */
export const parseSkill = (
	skillDir: string,
): TE.TaskEither<CLIError, ClaudeCodeSkill> =>
	pipe(
		TE.tryCatch(
			async () => {
				const skillMdPath = join(skillDir, "SKILL.md");
				const content = await readFile(skillMdPath, "utf-8");
				return { content, skillMdPath };
			},
			(e) => parseError(skillDir, `Failed to read SKILL.md: ${e}`),
		),
		TE.chain(({ content, skillMdPath }) =>
			pipe(
				extractFrontmatter(content, skillMdPath),
				TE.fromEither,
				TE.map(({ metadata, body }) => ({ metadata, body, skillMdPath })),
			),
		),
		TE.chain(({ metadata, body }) => {
			const name = metadata.name;
			const description = metadata.description;
			const allowedTools = metadata["allowed-tools"];

			if (!name || !description) {
				const missing = [!name && "name", !description && "description"].filter(
					Boolean,
				);
				return TE.left(
					parseError(
						skillDir,
						`Missing required fields: ${missing.join(", ")}`,
					),
				);
			}

			// Validate description length (Anthropic Skills v1.0 requirement)
			const descStr = String(description);
			if (descStr.length < 20) {
				return TE.left(
					parseError(
						skillDir,
						`Skill description must be >= 20 characters, got ${descStr.length}: ${descStr}`,
					),
				);
			}

			// Extract allowed-tools as string (Claude Code format: comma-separated)
			const allowedToolsStr =
				typeof allowedTools === "string" ? allowedTools : undefined;

			// Extract rp1-specific metadata from the nested `metadata` map
			const skillMetadata = extractSkillMetadata(metadata.metadata);

			return TE.right({
				name: String(name),
				description: descStr,
				allowedTools: allowedToolsStr,
				skillMetadata,
				body,
			});
		}),
		TE.chain(({ name, description, allowedTools, skillMetadata, body }) =>
			pipe(
				TE.tryCatch(
					async () => {
						// Find all files in skill directory recursively, excluding SKILL.md
						// (SKILL.md is generated with transformations, not copied verbatim)
						const allFiles = await findFilesRecursive(skillDir);
						const supportingFiles = allFiles
							.map((f) => relative(skillDir, f))
							.filter((f) => f !== "SKILL.md");
						return supportingFiles;
					},
					(e) => parseError(skillDir, `Failed to scan supporting files: ${e}`),
				),
				TE.map((supportingFiles) => ({
					name,
					description,
					allowedTools,
					content: body,
					supportingFiles,
					metadata: skillMetadata,
				})),
			),
		),
	);

/**
 * Recursively find all files in a directory.
 */
async function findFilesRecursive(dir: string): Promise<string[]> {
	const files: string[] = [];
	const entries = await readdir(dir, { withFileTypes: true });

	for (const entry of entries) {
		const fullPath = join(dir, entry.name);
		if (entry.isDirectory()) {
			files.push(...(await findFilesRecursive(fullPath)));
		} else if (entry.isFile()) {
			files.push(fullPath);
		}
	}

	return files;
}
