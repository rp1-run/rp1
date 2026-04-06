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
	ArgumentDefinition,
	ArgumentType,
	ClaudeCodeAgent,
	ClaudeCodeCommand,
	ClaudeCodeSkill,
	EnvironmentDefinition,
	SkillCategory,
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

			// Parse and validate arguments if present
			const argsResult = parseArgumentDefinitions(metadata.arguments, filePath);
			if (E.isLeft(argsResult)) {
				return TE.left(argsResult.left);
			}
			const parsedArgs = argsResult.right;

			// Parse and validate environment if present
			const envResult = parseEnvironmentDefinitions(
				metadata.environment,
				filePath,
			);
			if (E.isLeft(envResult)) {
				return TE.left(envResult.left);
			}
			const parsedEnv = envResult.right;

			const agent: ClaudeCodeAgent = {
				name: String(name),
				description: String(description),
				tools,
				model: model ? String(model) : "inherit",
				content: body,
				...(parsedArgs.length > 0 && { arguments: parsedArgs }),
				...(parsedEnv.length > 0 && { environment: parsedEnv }),
			};

			return TE.right(agent);
		}),
	);

const VALID_ARGUMENT_TYPES: readonly ArgumentType[] = [
	"string",
	"boolean",
	"enum",
];

const UPPER_SNAKE_CASE_RE = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

/**
 * Validate and parse a single argument definition from raw YAML data.
 * Returns Either with ParseError on invalid shape.
 */
const parseArgumentDefinition = (
	raw: unknown,
	index: number,
	filePath: string,
): E.Either<CLIError, ArgumentDefinition> => {
	if (
		raw === null ||
		raw === undefined ||
		typeof raw !== "object" ||
		Array.isArray(raw)
	) {
		return E.left(
			parseError(filePath, `arguments[${index}]: must be an object`),
		);
	}

	const obj = raw as Record<string, unknown>;

	// Required fields
	if (typeof obj.name !== "string" || obj.name.length === 0) {
		return E.left(
			parseError(
				filePath,
				`arguments[${index}]: missing or invalid 'name' (must be a non-empty string)`,
			),
		);
	}

	if (!UPPER_SNAKE_CASE_RE.test(obj.name)) {
		return E.left(
			parseError(
				filePath,
				`arguments[${index}]: name '${obj.name}' must be UPPER_SNAKE_CASE (e.g., FEATURE_ID)`,
			),
		);
	}

	if (
		typeof obj.type !== "string" ||
		!VALID_ARGUMENT_TYPES.includes(obj.type as ArgumentType)
	) {
		return E.left(
			parseError(
				filePath,
				`arguments[${index}]: invalid 'type' '${String(obj.type)}'. Must be one of: ${VALID_ARGUMENT_TYPES.join(", ")}`,
			),
		);
	}

	if (typeof obj.required !== "boolean") {
		return E.left(
			parseError(
				filePath,
				`arguments[${index}]: missing or invalid 'required' (must be a boolean)`,
			),
		);
	}

	if (typeof obj.description !== "string" || obj.description.length === 0) {
		return E.left(
			parseError(
				filePath,
				`arguments[${index}]: missing or invalid 'description' (must be a non-empty string)`,
			),
		);
	}

	// Build the validated definition
	const def: ArgumentDefinition = {
		name: obj.name,
		type: obj.type as ArgumentType,
		required: obj.required,
		description: obj.description,
		...(obj.default !== undefined && {
			default: obj.default as string | boolean,
		}),
		...(Array.isArray(obj.aliases) && { aliases: obj.aliases.map(String) }),
		...(Array.isArray(obj.implies) && { implies: obj.implies.map(String) }),
		...(Array.isArray(obj.enum_values) && {
			enum_values: obj.enum_values.map(String),
		}),
		...(typeof obj.variadic === "boolean" && { variadic: obj.variadic }),
		...(obj.source !== null &&
			obj.source !== undefined &&
			typeof obj.source === "object" &&
			!Array.isArray(obj.source) &&
			typeof (obj.source as Record<string, unknown>).env === "string" && {
				source: { env: (obj.source as Record<string, unknown>).env as string },
			}),
	};

	return E.right(def);
};

/**
 * Validate and parse an array of argument definitions from raw YAML data.
 * Returns the parsed array or a ParseError for the first invalid entry.
 */
const parseArgumentDefinitions = (
	raw: unknown,
	filePath: string,
): E.Either<CLIError, readonly ArgumentDefinition[]> => {
	if (raw === undefined || raw === null) {
		return E.right([]);
	}

	if (!Array.isArray(raw)) {
		return E.left(parseError(filePath, "'arguments' must be an array"));
	}

	const results: ArgumentDefinition[] = [];
	for (let i = 0; i < raw.length; i++) {
		const parsed = parseArgumentDefinition(raw[i], i, filePath);
		if (E.isLeft(parsed)) {
			return parsed;
		}
		results.push(parsed.right);
	}

	return E.right(results);
};

/**
 * Validate and parse an array of environment definitions from raw YAML data.
 */
const parseEnvironmentDefinitions = (
	raw: unknown,
	filePath: string,
): E.Either<CLIError, readonly EnvironmentDefinition[]> => {
	if (raw === undefined || raw === null) {
		return E.right([]);
	}

	if (!Array.isArray(raw)) {
		return E.left(parseError(filePath, "'environment' must be an array"));
	}

	const results: EnvironmentDefinition[] = [];
	for (let i = 0; i < raw.length; i++) {
		const item = raw[i];
		if (
			item === null ||
			item === undefined ||
			typeof item !== "object" ||
			Array.isArray(item)
		) {
			return E.left(
				parseError(filePath, `environment[${i}]: must be an object`),
			);
		}

		const obj = item as Record<string, unknown>;

		if (typeof obj.name !== "string" || obj.name.length === 0) {
			return E.left(
				parseError(filePath, `environment[${i}]: missing or invalid 'name'`),
			);
		}

		if (typeof obj.source !== "string" || obj.source.length === 0) {
			return E.left(
				parseError(filePath, `environment[${i}]: missing or invalid 'source'`),
			);
		}

		if (typeof obj.description !== "string" || obj.description.length === 0) {
			return E.left(
				parseError(
					filePath,
					`environment[${i}]: missing or invalid 'description'`,
				),
			);
		}

		results.push({
			name: obj.name,
			source: obj.source,
			description: obj.description,
		});
	}

	return E.right(results);
};

/**
 * Extract rp1-specific metadata from the frontmatter `metadata` map.
 * Returns Right(undefined) when the metadata map is absent or not an object,
 * preserving backward compatibility with pre-migration skills.
 * Returns Left(ParseError) when arguments or environment are malformed.
 */
const extractSkillMetadata = (
	raw: unknown,
	filePath: string,
): E.Either<CLIError, SkillMetadata | undefined> => {
	if (
		raw === null ||
		raw === undefined ||
		typeof raw !== "object" ||
		Array.isArray(raw)
	) {
		return E.right(undefined);
	}

	const meta = raw as Record<string, unknown>;

	// Parse and validate arguments if present
	const argsResult = parseArgumentDefinitions(meta.arguments, filePath);
	if (E.isLeft(argsResult)) {
		return argsResult;
	}
	const parsedArgs = argsResult.right;

	// Parse and validate environment if present
	const envResult = parseEnvironmentDefinitions(meta.environment, filePath);
	if (E.isLeft(envResult)) {
		return envResult;
	}
	const parsedEnv = envResult.right;

	const VALID_CATEGORIES: readonly SkillCategory[] = [
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

	const categoryRaw = meta.category;
	const category: SkillCategory | undefined =
		typeof categoryRaw === "string" &&
		VALID_CATEGORIES.includes(categoryRaw as SkillCategory)
			? (categoryRaw as SkillCategory)
			: undefined;

	const isWorkflowRaw = meta.is_workflow;
	const isWorkflow: boolean | undefined =
		typeof isWorkflowRaw === "boolean" ? isWorkflowRaw : undefined;

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
		...(parsedArgs.length > 0 && { arguments: parsedArgs }),
		...(parsedEnv.length > 0 && { environment: parsedEnv }),
		...(category !== undefined && { category }),
		...(isWorkflow !== undefined && { isWorkflow }),
	};

	// Return undefined if all fields are undefined (no meaningful metadata)
	const hasAnyField = Object.values(result).some((v) => v !== undefined);
	return E.right(hasAnyField ? result : undefined);
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
			const metadataResult = extractSkillMetadata(metadata.metadata, skillDir);
			if (E.isLeft(metadataResult)) {
				return TE.left(metadataResult.left);
			}
			const skillMetadata = metadataResult.right;

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
