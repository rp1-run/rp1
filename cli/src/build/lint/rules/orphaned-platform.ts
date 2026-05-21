/**
 * L002: Detect raw platform conditionals that survived preprocessing.
 *
 * If `{% if platform %}`, `{% case platform %}`, or similar raw Liquid
 * platform blocks appear in the rendered output, they were not evaluated
 * during preprocessing. This indicates a source file issue (e.g., the
 * preprocessor was bypassed or the block syntax is malformed).
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const PLATFORM_BLOCK_PATTERNS = [
	/\{%[-\s]*if\s+platform\b/g,
	/\{%[-\s]*elsif\s+platform\b/g,
	/\{%[-\s]*case\s+platform\b/g,
	/\{%[-\s]*when\s+['"](?:claude-code|opencode|codex|copilot|antigravity|gemini)['"]/g,
];

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function orphanedPlatformRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	for (const pattern of PLATFORM_BLOCK_PATTERNS) {
		pattern.lastIndex = 0;
		let match: RegExpExecArray | null;
		while ((match = pattern.exec(content)) !== null) {
			diagnostics.push({
				rule: "L002",
				severity: "error",
				message: `Raw platform conditional "${match[0]}" survived preprocessing`,
				file,
				line: findLineNumber(content, match.index),
				suggestion:
					"Ensure the file is processed through the preprocessor. If this is intentional, use semantic tags instead of raw platform conditionals.",
			});
		}
	}

	return diagnostics;
}
