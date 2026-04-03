/**
 * L007-L013: Source-level validation rules for argument schema integrity.
 *
 * These rules operate on parsed source data (SkillMetadata, ClaudeCodeAgent)
 * before template rendering, unlike the rendered-output lint rules (L001-L006).
 *
 * L007: Both argument-hint and arguments present (skill only)
 * L008: Hand-written Parameters heading alongside arguments
 * L009: Legacy argument-hint without arguments (skill only)
 * L010: Enum argument missing enum_values
 * L011: Implies references non-existent argument
 * L012: Circular implies chain
 * L013: Hand-written Resolve Arguments section alongside arguments (skill only)
 */

import { validateImpliesChains } from "../../arguments.js";
import type { ArgumentDefinition, SkillMetadata } from "../../models.js";
import type { LintDiagnostic } from "../index.js";

const PARAMETERS_HEADING_RE = /^#{1,3}\s+(?:0\.\s+)?Parameters\s*$/m;
const RESOLVE_ARGS_HEADING_RE = /^#{1,3}\s+(?:0\.\s+)?Resolve\s+Arguments\s*$/m;

/**
 * Validate argument definitions for enum/implies issues (L010-L012).
 * Shared between skill and agent linting.
 */
function lintArgumentDefinitions(
	args: readonly ArgumentDefinition[],
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	for (const arg of args) {
		if (
			arg.type === "enum" &&
			(!arg.enum_values || arg.enum_values.length === 0)
		) {
			diagnostics.push({
				rule: "L010",
				severity: "error",
				message: `enum argument '${arg.name}' missing 'enum_values'.`,
				file,
				suggestion: `Add 'enum_values' array to argument '${arg.name}' with at least one valid value.`,
			});
		}
	}

	const impliesErrors = validateImpliesChains(args);
	for (const err of impliesErrors) {
		if (err.type === "dangling") {
			diagnostics.push({
				rule: "L011",
				severity: "error",
				message: `argument '${err.argument}' implies non-existent argument '${err.target}'.`,
				file,
				suggestion: `Add '${err.target}' to the arguments array or remove it from the implies list of '${err.argument}'.`,
			});
		} else if (err.type === "circular") {
			const chain = err.chain
				? err.chain.join(" -> ")
				: `${err.argument} -> ${err.target}`;
			diagnostics.push({
				rule: "L012",
				severity: "error",
				message: `circular implies chain: ${chain}.`,
				file,
				suggestion:
					"Remove one link in the cycle to break the circular dependency.",
			});
		}
	}

	return diagnostics;
}

/**
 * Check body content for hand-written Parameters headings (L008).
 */
function lintParametersHeading(
	body: string,
	hasArguments: boolean,
	file: string,
): LintDiagnostic[] {
	if (!hasArguments) return [];
	if (!PARAMETERS_HEADING_RE.test(body)) return [];

	return [
		{
			rule: "L008",
			severity: "error",
			message:
				"hand-written Parameters table found alongside structured 'arguments'. Remove the table.",
			file,
			suggestion:
				"Remove the '## Parameters' or '## 0. Parameters' section from the body. The structured 'arguments' schema replaces it.",
		},
	];
}

/**
 * Check body content for hand-written Resolve Arguments section (L013).
 * The build template auto-injects this section; hand-written copies cause duplication.
 */
function lintResolveArgsHeading(
	body: string,
	hasArguments: boolean,
	file: string,
): LintDiagnostic[] {
	if (!hasArguments) return [];
	if (!RESOLVE_ARGS_HEADING_RE.test(body)) return [];

	return [
		{
			rule: "L013",
			severity: "error",
			message:
				"hand-written 'Resolve Arguments' section found alongside structured 'arguments'. The build template auto-injects this section.",
			file,
			suggestion:
				"Remove the '## 0. Resolve Arguments' section from the body. The build pipeline generates it automatically from the 'arguments' schema in frontmatter.",
		},
	];
}

/**
 * Run source-level argument validation rules (L007-L013) on a parsed skill.
 *
 * @param metadata - Parsed SkillMetadata (may be undefined for skills without metadata)
 * @param body - Skill body content (post-frontmatter markdown)
 * @param file - Source file path for diagnostic reporting
 */
export function lintSkillArguments(
	metadata: SkillMetadata | undefined,
	body: string,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	const hasArgumentHint = metadata?.argumentHint != null;
	const hasArguments =
		metadata?.arguments != null && metadata.arguments.length > 0;

	if (hasArgumentHint && hasArguments) {
		diagnostics.push({
			rule: "L007",
			severity: "error",
			message:
				"both 'argument-hint' and 'arguments' defined. Remove 'argument-hint'; it will be auto-derived.",
			file,
			suggestion:
				"Remove the 'argument-hint' field from metadata. The hint is now auto-derived from the structured 'arguments' schema.",
		});
	}

	if (hasArgumentHint && !hasArguments) {
		diagnostics.push({
			rule: "L009",
			severity: "error",
			message:
				"legacy 'argument-hint' without structured 'arguments'. Migrate to 'arguments' schema.",
			file,
			suggestion:
				"Replace 'argument-hint' with a structured 'arguments' array in metadata. See docs/concepts/skill-format.md.",
		});
	}

	diagnostics.push(...lintParametersHeading(body, hasArguments, file));
	diagnostics.push(...lintResolveArgsHeading(body, hasArguments, file));

	if (hasArguments && metadata?.arguments) {
		diagnostics.push(...lintArgumentDefinitions(metadata.arguments, file));
	}

	return diagnostics;
}

/**
 * Run source-level argument validation rules (L008, L010-L012) on a parsed agent.
 *
 * Agents do not have `argument-hint` in their schema, so L007 and L009
 * do not apply.
 *
 * @param args - Parsed argument definitions (may be undefined)
 * @param body - Agent body content (post-frontmatter markdown)
 * @param file - Source file path for diagnostic reporting
 */
export function lintAgentArguments(
	args: readonly ArgumentDefinition[] | undefined,
	body: string,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];
	const hasArguments = args != null && args.length > 0;

	diagnostics.push(...lintParametersHeading(body, hasArguments, file));

	if (hasArguments && args) {
		diagnostics.push(...lintArgumentDefinitions(args, file));
	}

	return diagnostics;
}
