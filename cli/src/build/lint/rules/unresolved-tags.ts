/**
 * L004: Detect unprocessed semantic tags in rendered output.
 *
 * If `{% dispatch_agent %}`, `{% ask_user %}`, or other semantic tags
 * appear in the rendered output, they were not evaluated during the
 * preprocessing phase. This indicates the preprocessor did not have
 * the tags registered or the content bypassed preprocessing.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const SEMANTIC_TAG_NAMES = [
	"dispatch_agent",
	"ask_user",
	"plan_tool",
	"web_access",
	"edit_model",
	"permissions",
];

const TAG_PATTERN = new RegExp(
	`\\{%[-\\s]*(?:${SEMANTIC_TAG_NAMES.join("|")})\\b[^%]*%\\}`,
	"g",
);

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function unresolvedTagsRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	TAG_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = TAG_PATTERN.exec(content)) !== null) {
		diagnostics.push({
			rule: "L004",
			severity: "error",
			message: `Unresolved semantic tag "${match[0]}" in rendered output`,
			file,
			line: findLineNumber(content, match.index),
			suggestion:
				"Ensure the file is processed through the preprocessor with custom tags registered. Check that registerTags() is called on the Liquid instance.",
		});
	}

	return diagnostics;
}
