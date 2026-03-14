/**
 * Validation module for Codex build artifacts.
 * Provides L1 (syntax) and L2 (schema) validation for generated skills,
 * and TOML parse + schema validation for agent definitions.
 */

import * as E from "fp-ts/lib/Either.js";
import { parse as parseToml } from "smol-toml";
import { parse as parseYaml } from "yaml";
import type { CLIError } from "../../../shared/errors.js";
import { validationError } from "../../../shared/errors.js";

/**
 * Extract YAML frontmatter from SKILL.md content.
 */
const extractFrontmatter = (
	content: string,
	file: string,
): E.Either<CLIError, Record<string, unknown>> => {
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

	try {
		const metadata = parseYaml(parts[1]) as Record<string, unknown>;
		return E.right(metadata);
	} catch (e) {
		return E.left(
			validationError(file, "L1", `Invalid YAML in frontmatter: ${e}`),
		);
	}
};

/**
 * Validate a Codex skill SKILL.md with L1 (syntax) and L2 (schema) checks.
 *
 * L1: Valid YAML frontmatter structure.
 * L2: Required fields (name, description) present; description >= 20 chars.
 */
export const validateCodexSkill = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	const frontmatterResult = extractFrontmatter(content, file);
	if (E.isLeft(frontmatterResult)) {
		return frontmatterResult;
	}

	const metadata = frontmatterResult.right;

	if (metadata === null || metadata === undefined) {
		return E.left(validationError(file, "L2", "Frontmatter is empty"));
	}

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
 * Validate generated TOML content for agent config entries.
 *
 * Parses TOML with smol-toml to confirm syntactic validity, then checks
 * each [agents.<name>] section has required description and config_file fields
 * (two-tier architecture: slim main config + per-agent TOML files).
 */
export const validateCodexToml = (
	content: string,
	file: string,
): E.Either<CLIError, void> => {
	let parsed: Record<string, unknown>;
	try {
		parsed = parseToml(content) as Record<string, unknown>;
	} catch (e) {
		return E.left(validationError(file, "L1", `Invalid TOML syntax: ${e}`));
	}

	const agents = parsed.agents;
	if (agents === undefined || agents === null || typeof agents !== "object") {
		return E.left(
			validationError(file, "L2", "Missing [agents] table in TOML"),
		);
	}

	const agentsRecord = agents as Record<string, unknown>;
	const agentNames = Object.keys(agentsRecord);

	if (agentNames.length === 0) {
		return E.left(
			validationError(
				file,
				"L2",
				"No agent definitions found in [agents] table",
			),
		);
	}

	for (const agentName of agentNames) {
		const section = agentsRecord[agentName];
		if (section === null || typeof section !== "object") {
			return E.left(
				validationError(file, "L2", `[agents.${agentName}] must be a table`),
			);
		}

		const agentSection = section as Record<string, unknown>;

		if (
			!("description" in agentSection) ||
			typeof agentSection.description !== "string" ||
			agentSection.description.length === 0
		) {
			return E.left(
				validationError(
					file,
					"L2",
					`[agents.${agentName}] missing or empty required field: description`,
				),
			);
		}

		if (
			!("config_file" in agentSection) ||
			typeof agentSection.config_file !== "string" ||
			agentSection.config_file.length === 0
		) {
			return E.left(
				validationError(
					file,
					"L2",
					`[agents.${agentName}] missing or empty required field: config_file`,
				),
			);
		}
	}

	return E.right(undefined);
};
