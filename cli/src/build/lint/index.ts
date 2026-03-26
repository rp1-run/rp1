/**
 * Build-time lint system for rendered platform artifacts.
 *
 * Validates rendered output per platform for correctness, checking for
 * common errors such as missing tool references, orphaned platform-specific
 * constructs, null tool mappings used in instructions, and malformed
 * dispatch blocks.
 *
 * Each lint rule is a pure function:
 *   (content: string, platform: BuildPlatform, file: string) => LintDiagnostic[]
 *
 * The {@link lintArtifact} entry point runs all registered rules and
 * aggregates results into a {@link LintResult}.
 */

import type { BuildPlatform } from "../template-context.js";
import { incompleteDispatchRule } from "./rules/incomplete-dispatch.js";
import { missingEmitHarnessRule } from "./rules/missing-emit-harness.js";
import { nullToolInProseRule } from "./rules/null-tool-in-prose.js";
import { nullToolRefsRule } from "./rules/null-tool-refs.js";
import { orphanedPlatformRule } from "./rules/orphaned-platform.js";
import { unresolvedTagsRule } from "./rules/unresolved-tags.js";

// ---------------------------------------------------------------------------
// Diagnostic and result types
// ---------------------------------------------------------------------------

/** A single lint finding from a rule. */
export interface LintDiagnostic {
	readonly rule: string;
	readonly severity: "error" | "warning";
	readonly message: string;
	readonly file: string;
	readonly line?: number;
	readonly suggestion?: string;
}

/** Aggregated result of running all lint rules on an artifact. */
export interface LintResult {
	readonly diagnostics: readonly LintDiagnostic[];
	readonly hasErrors: boolean;
}

// ---------------------------------------------------------------------------
// Lint rule type
// ---------------------------------------------------------------------------

/**
 * A lint rule is a pure function that inspects rendered artifact content
 * and returns zero or more diagnostics.
 */
export type LintRule = (
	content: string,
	platform: BuildPlatform,
	file: string,
) => LintDiagnostic[];

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

const rules: LintRule[] = [];

/**
 * Register a lint rule. Rules are evaluated in registration order.
 *
 * @param rule - Pure function implementing the lint check
 */
export function registerLintRule(rule: LintRule): void {
	rules.push(rule);
}

/**
 * Clear all registered lint rules. Useful for testing.
 */
export function clearLintRules(): void {
	rules.length = 0;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Run all registered lint rules against a rendered artifact.
 *
 * @param content - Rendered artifact content (post-template-render)
 * @param platform - Target platform the artifact was rendered for
 * @param artifactName - Source file or artifact identifier for diagnostics
 * @returns Aggregated {@link LintResult} with all diagnostics
 */
export function lintArtifact(
	content: string,
	platform: BuildPlatform,
	artifactName: string,
): LintResult {
	const diagnostics: LintDiagnostic[] = [];

	for (const rule of rules) {
		diagnostics.push(...rule(content, platform, artifactName));
	}

	return {
		diagnostics,
		hasErrors: diagnostics.some((d) => d.severity === "error"),
	};
}

// ---------------------------------------------------------------------------
// Default rule registration
// ---------------------------------------------------------------------------

registerLintRule(nullToolRefsRule);
registerLintRule(orphanedPlatformRule);
registerLintRule(incompleteDispatchRule);
registerLintRule(unresolvedTagsRule);
registerLintRule(nullToolInProseRule);
registerLintRule(missingEmitHarnessRule);
