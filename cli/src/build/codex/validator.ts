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
 * Extract YAML frontmatter from SKILL.md content using line-by-line parsing
 * that matches the Codex CLI's Rust `extract_frontmatter` implementation.
 *
 * Codex requires:
 * 1. First line (trimmed) must be exactly "---"
 * 2. A closing "---" line must exist
 * 3. At least one line of content between opening and closing delimiters
 */
const extractFrontmatter = (
	content: string,
	file: string,
): E.Either<CLIError, Record<string, unknown>> => {
	const lines = content.split("\n");

	// First line must be "---" (trimmed)
	if (lines.length === 0 || lines[0].trim() !== "---") {
		return E.left(
			validationError(
				file,
				"L1",
				"Content must start with YAML frontmatter (first line must be ---)",
			),
		);
	}

	// Collect frontmatter lines until closing "---"
	const frontmatterLines: string[] = [];
	let foundClosing = false;
	for (let i = 1; i < lines.length; i++) {
		if (lines[i].trim() === "---") {
			foundClosing = true;
			break;
		}
		frontmatterLines.push(lines[i]);
	}

	if (!foundClosing) {
		return E.left(
			validationError(
				file,
				"L1",
				"Missing closing --- delimiter for YAML frontmatter",
			),
		);
	}

	if (frontmatterLines.length === 0) {
		return E.left(
			validationError(
				file,
				"L1",
				"YAML frontmatter is empty (no content between --- delimiters)",
			),
		);
	}

	const frontmatterText = frontmatterLines.join("\n");

	try {
		const metadata = parseYaml(frontmatterText) as Record<string, unknown>;
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
