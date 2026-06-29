/**
 * Validation module for OpenCode artifacts.
 * Provides L1 (syntax) and L2 (schema) validation for generated artifacts.
 */

import * as E from "fp-ts/lib/Either.js";
import { parse as parseYaml } from "yaml";
import type { CLIError } from "../../shared/errors.js";
import { validationError } from "../../shared/errors.js";
import type {
	EffortLevel,
	ModelTier,
	SkillCategory,
	WorkflowRunPolicy,
} from "./models.js";
import {
	PROTECTED_AGENTS,
	VALID_EFFORT_LEVELS,
	VALID_MODEL_TIERS,
} from "./models.js";

const VALID_SKILL_CATEGORIES: readonly SkillCategory[] = [
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

const VALID_WORKFLOW_RUN_POLICIES: readonly WorkflowRunPolicy[] = [
	"fresh",
	"resumable",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
	Object.hasOwn(value, key);

const getDeclaredArgumentNames = (
	skillMetadata: Record<string, unknown>,
): Set<string> =>
	new Set(
		(Array.isArray(skillMetadata.arguments)
			? skillMetadata.arguments
			: []
		).flatMap((argument) => {
			if (!isRecord(argument)) {
				return [];
			}

			return typeof argument.name === "string" ? [argument.name] : [];
		}),
	);

const validateTrackedWorkflowMetadata = (
	skillMetadata: Record<string, unknown>,
	file: string,
): E.Either<CLIError, void> => {
	if (skillMetadata.is_workflow !== true) {
		return E.right(undefined);
	}

	const workflowMetadata = isRecord(skillMetadata.workflow)
		? skillMetadata.workflow
		: null;
	if (!workflowMetadata) {
		return E.left(
			validationError(
				file,
				"L2",
				"Missing required field: metadata.workflow.run_policy",
			),
		);
	}

	const runPolicy = workflowMetadata.run_policy;
	if (typeof runPolicy !== "string") {
		return E.left(
			validationError(
				file,
				"L2",
				"Missing required field: metadata.workflow.run_policy",
			),
		);
	}

	if (!VALID_WORKFLOW_RUN_POLICIES.includes(runPolicy as WorkflowRunPolicy)) {
		return E.left(
			validationError(
				file,
				"L2",
				`Field 'metadata.workflow.run_policy' must be one of: ${VALID_WORKFLOW_RUN_POLICIES.join(", ")}`,
			),
		);
	}

	const hasIdentityArgs = hasOwn(workflowMetadata, "identity_args");
	const identityArgsRaw = workflowMetadata.identity_args;

	if (runPolicy === "fresh") {
		if (!hasIdentityArgs) {
			return E.right(undefined);
		}

		if (!Array.isArray(identityArgsRaw) || identityArgsRaw.length > 0) {
			return E.left(
				validationError(
					file,
					"L2",
					"Field 'metadata.workflow.identity_args' must be omitted or an empty array when 'metadata.workflow.run_policy' is 'fresh'",
				),
			);
		}

		return E.right(undefined);
	}

	if (!Array.isArray(identityArgsRaw) || identityArgsRaw.length === 0) {
		return E.left(
			validationError(
				file,
				"L2",
				"Field 'metadata.workflow.identity_args' must be a non-empty array when 'metadata.workflow.run_policy' is 'resumable'",
			),
		);
	}

	if (
		!identityArgsRaw.every(
			(value) => typeof value === "string" && value.length > 0,
		)
	) {
		return E.left(
			validationError(
				file,
				"L2",
				"Field 'metadata.workflow.identity_args' must contain only non-empty argument names",
			),
		);
	}

	const declaredArgumentNames = getDeclaredArgumentNames(skillMetadata);
	const unknownIdentityArgs = identityArgsRaw.filter(
		(argument) => !declaredArgumentNames.has(argument),
	);
	if (unknownIdentityArgs.length > 0) {
		return E.left(
			validationError(
				file,
				"L2",
				`Field 'metadata.workflow.identity_args' references unknown arguments: ${unknownIdentityArgs.join(", ")}`,
			),
		);
	}

	return E.right(undefined);
};

const validateSkillDiscoveryMetadata = (
	metadata: Record<string, unknown>,
	file: string,
): E.Either<CLIError, void> => {
	const skillMetadata = isRecord(metadata.metadata) ? metadata.metadata : null;
	if (!skillMetadata) {
		return E.left(
			validationError(
				file,
				"L2",
				"Missing required fields: metadata.category, metadata.is_workflow",
			),
		);
	}

	const missingFields = [
		!hasOwn(skillMetadata, "category") ? "metadata.category" : null,
		!hasOwn(skillMetadata, "is_workflow") ? "metadata.is_workflow" : null,
	].filter((field): field is string => field !== null);

	if (missingFields.length > 0) {
		return E.left(
			validationError(
				file,
				"L2",
				`Missing required fields: ${missingFields.join(", ")}`,
			),
		);
	}

	const category = skillMetadata.category;
	if (
		typeof category !== "string" ||
		!VALID_SKILL_CATEGORIES.includes(category as SkillCategory)
	) {
		return E.left(
			validationError(
				file,
				"L2",
				`Field 'metadata.category' must be one of: ${VALID_SKILL_CATEGORIES.join(", ")}`,
			),
		);
	}

	if (typeof skillMetadata.is_workflow !== "boolean") {
		return E.left(
			validationError(
				file,
				"L2",
				"Field 'metadata.is_workflow' must be boolean",
			),
		);
	}

	if (
		hasOwn(skillMetadata, "arcade_tracked") &&
		typeof skillMetadata.arcade_tracked !== "boolean"
	) {
		return E.left(
			validationError(
				file,
				"L2",
				"Field 'metadata.arcade_tracked' must be boolean",
			),
		);
	}

	const workflowMetadataResult = validateTrackedWorkflowMetadata(
		skillMetadata,
		file,
	);
	if (E.isLeft(workflowMetadataResult)) {
		return workflowMetadataResult;
	}

	return E.right(undefined);
};

/**
 * Extract frontmatter from content.
 */
const extractFrontmatter = (
	content: string,
	file: string,
): E.Either<CLIError, { metadata: Record<string, unknown>; body: string }> => {
	const normalized = content.replace(/\r\n/g, "\n");
	if (!normalized.startsWith("---")) {
		return E.left(
			validationError(
				file,
				"L1",
				"Content must start with YAML frontmatter (---)",
			),
		);
	}

	const parts = normalized.split("---");
	if (parts.length < 3) {
		return E.left(
			validationError(
				file,
				"L1",
				"Invalid frontmatter structure (must have opening and closing ---)",
			),
		);
	}

	const frontmatterText = parts[1];
	const body = parts.slice(2).join("---").trim();

	try {
		const metadata = parseYaml(frontmatterText) as Record<string, unknown>;
		return E.right({ metadata, body });
	} catch (e) {
		return E.left(
			validationError(file, "L1", `Invalid YAML in frontmatter: ${e}`),
		);
	}
};

// ============================================================================
// L1: Syntax Validation
// ============================================================================

/**
 * L1: Validate OpenCode command has valid YAML frontmatter.
 */
export const validateCommandSyntax = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const result = extractFrontmatter(content, file);
	if (E.isLeft(result)) {
		return result;
	}
	return E.right(undefined);
};

/**
 * L1: Validate OpenCode agent has valid YAML frontmatter.
 */
export const validateAgentSyntax = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const result = extractFrontmatter(content, file);
	if (E.isLeft(result)) {
		return result;
	}
	return E.right(undefined);
};

/**
 * L1: Validate skill has valid YAML frontmatter (Anthropic Skills v1.0).
 */
export const validateSkillSyntax = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const result = extractFrontmatter(content, file);
	if (E.isLeft(result)) {
		return result;
	}
	return E.right(undefined);
};

// ============================================================================
// L2: Schema Validation
// ============================================================================

/**
 * L2: Validate OpenCode command has required fields.
 */
export const validateCommandSchema = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const frontmatterResult = extractFrontmatter(content, file);
	if (E.isLeft(frontmatterResult)) {
		return frontmatterResult;
	}

	const { metadata, body } = frontmatterResult.right;

	if (metadata === null || metadata === undefined) {
		return E.left(validationError(file, "L2", "Frontmatter is empty"));
	}

	// Check required fields (only description in frontmatter)
	if (!("description" in metadata)) {
		return E.left(
			validationError(file, "L2", "Missing required field: description"),
		);
	}

	// Validate field types
	if (typeof metadata.description !== "string") {
		return E.left(
			validationError(file, "L2", "Field 'description' must be string"),
		);
	}

	// Validate that prompt content exists after frontmatter
	if (!body || body.trim().length === 0) {
		return E.left(
			validationError(
				file,
				"L2",
				"Command must have prompt content after frontmatter",
			),
		);
	}

	return E.right(undefined);
};

/**
 * L2: Validate OpenCode agent has required fields.
 */
export const validateAgentSchema = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const frontmatterResult = extractFrontmatter(content, file);
	if (E.isLeft(frontmatterResult)) {
		return frontmatterResult;
	}

	const { metadata } = frontmatterResult.right;

	if (metadata === null || metadata === undefined) {
		return E.left(validationError(file, "L2", "Frontmatter is empty"));
	}

	// Check required fields
	const requiredFields = ["description", "mode", "tools"];
	const missingFields = requiredFields.filter((f) => !(f in metadata));

	if (missingFields.length > 0) {
		return E.left(
			validationError(
				file,
				"L2",
				`Missing required fields: ${missingFields.join(", ")}`,
			),
		);
	}

	// Validate mode
	if (metadata.mode !== "subagent") {
		return E.left(
			validationError(
				file,
				"L2",
				`Agent mode must be 'subagent', got '${metadata.mode}'`,
			),
		);
	}

	// Validate tools is object (dict) (OpenCode format: {bash: true, write: false})
	if (
		typeof metadata.tools !== "object" ||
		metadata.tools === null ||
		Array.isArray(metadata.tools)
	) {
		return E.left(
			validationError(
				file,
				"L2",
				`Field 'tools' must be object (dict), got ${typeof metadata.tools}`,
			),
		);
	}

	return E.right(undefined);
};

/**
 * L2: Validate skill has required fields (Anthropic Skills v1.0).
 */
export const validateSkillSchema = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const frontmatterResult = extractFrontmatter(content, file);
	if (E.isLeft(frontmatterResult)) {
		return frontmatterResult;
	}

	const { metadata } = frontmatterResult.right;

	if (metadata === null || metadata === undefined) {
		return E.left(validationError(file, "L2", "Frontmatter is empty"));
	}

	// Check required fields
	const requiredFields = ["name", "description"];
	const missingFields = requiredFields.filter((f) => !(f in metadata));

	if (missingFields.length > 0) {
		return E.left(
			validationError(
				file,
				"L2",
				`Missing required fields: ${missingFields.join(", ")}`,
			),
		);
	}

	// Validate description length (Anthropic Skills v1.0 requirement)
	const description = String(metadata.description);
	if (description.length < 20) {
		return E.left(
			validationError(
				file,
				"L2",
				`Description too short (must be >= 20 chars): '${description}' (length: ${description.length})`,
			),
		);
	}

	const discoveryMetadataResult = validateSkillDiscoveryMetadata(
		metadata,
		file,
	);
	if (E.isLeft(discoveryMetadataResult)) {
		return discoveryMetadataResult;
	}

	return E.right(undefined);
};

/**
 * Combined L1 + L2 validation for a command.
 */
export const validateCommand = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const syntaxResult = validateCommandSyntax(content, file);
	if (E.isLeft(syntaxResult)) {
		return syntaxResult;
	}
	return validateCommandSchema(content, file);
};

/**
 * Combined L1 + L2 validation for an agent.
 */
export const validateAgent = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const syntaxResult = validateAgentSyntax(content, file);
	if (E.isLeft(syntaxResult)) {
		return syntaxResult;
	}
	return validateAgentSchema(content, file);
};

/**
 * Combined L1 + L2 validation for a skill.
 */
export const validateSkill = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const syntaxResult = validateSkillSyntax(content, file);
	if (E.isLeft(syntaxResult)) {
		return syntaxResult;
	}
	return validateSkillSchema(content, file);
};

// ============================================================================
// Agent Tier and Effort Validation
// ============================================================================

/** Validation result containing both hard errors and advisory warnings. */
export interface AgentTierValidationResult {
	readonly errors: readonly string[];
	readonly warnings: readonly string[];
}

/**
 * Validate an agent's model tier and effort level declarations.
 *
 * Checks:
 * - model must be a known tier alias from VALID_MODEL_TIERS
 * - effort (when present) must be a known level from VALID_EFFORT_LEVELS
 * - fast tier with effort set produces a warning (fast models lack effort control)
 * - protected agents assigned non-deep, non-inherit tiers produce a downgrade warning
 */
export const validateAgentTierAndEffort = (
	agentName: string,
	model: string,
	effort: string | undefined,
	file: string,
): AgentTierValidationResult => {
	const errors: string[] = [];
	const warnings: string[] = [];

	if (!VALID_MODEL_TIERS.includes(model as ModelTier)) {
		errors.push(
			`${file}: unknown model tier '${model}'. Allowed values: ${VALID_MODEL_TIERS.join(", ")}`,
		);
	}

	if (
		effort !== undefined &&
		!VALID_EFFORT_LEVELS.includes(effort as EffortLevel)
	) {
		errors.push(
			`${file}: unknown effort level '${effort}'. Allowed values: ${VALID_EFFORT_LEVELS.join(", ")}`,
		);
	}

	if (model === "fast" && effort !== undefined) {
		warnings.push(
			`${file}: effort '${effort}' set on fast-tier agent '${agentName}'; fast models do not support effort control`,
		);
	}

	if (
		PROTECTED_AGENTS.has(agentName) &&
		model !== "deep" &&
		model !== "inherit"
	) {
		warnings.push(
			`${file}: protected agent '${agentName}' downgraded from deep to '${model}'`,
		);
	}

	return { errors, warnings };
};
