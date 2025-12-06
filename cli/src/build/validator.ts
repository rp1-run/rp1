/**
 * Validation module for OpenCode artifacts.
 * Provides L1 (syntax) and L2 (schema) validation for generated artifacts.
 */

import { parse as parseYaml } from "yaml";
import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import { validationError } from "../../shared/errors.js";

/**
 * Extract frontmatter from content.
 */
const extractFrontmatter = (
  content: string,
  file: string,
): E.Either<CLIError, { metadata: Record<string, unknown>; body: string }> => {
  if (!content.startsWith("---")) {
    return E.left(
      validationError(
        file,
        "L1",
        "Content must start with YAML frontmatter (---)",
      ),
    );
  }

  const parts = content.split("---");
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
