/**
 * L007: Enforce generated bootstrap usage for tracked workflow artifacts.
 *
 * Tracked workflows must rely on the template-injected workflow-bootstrap
 * stanza instead of hand-written RUN_ID generation or direct resume-run calls.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const TRACKED_WORKFLOW_PATTERN = /^\s*is_workflow:\s*true\s*$/m;
const BOOTSTRAP_COMMAND_PATTERN = /rp1 agent-tools workflow-bootstrap\b/g;
const MANUAL_RUN_ID_PATTERN =
	/Generate\s+`RUN_ID`\s+as\s+(?:a\s+)?UUID\b[^\n]*/gi;
const RESUME_RUN_PATTERN = /rp1 agent-tools emit resume-run\b/g;

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") {
			line++;
		}
	}
	return line;
}

function getBootstrapBlock(content: string, index: number): string {
	const nextFence = content.indexOf("```", index + 1);
	const end =
		nextFence === -1 ? Math.min(content.length, index + 400) : nextFence;
	return content.slice(index, end);
}

export function trackedWorkflowBootstrapRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	if (!TRACKED_WORKFLOW_PATTERN.test(content)) {
		return [];
	}

	const diagnostics: LintDiagnostic[] = [];
	const bootstrapMatches = Array.from(
		content.matchAll(BOOTSTRAP_COMMAND_PATTERN),
	);

	if (bootstrapMatches.length === 0) {
		diagnostics.push({
			rule: "L007",
			severity: "error",
			message:
				"Tracked workflow is missing the generated workflow-bootstrap command",
			file,
			suggestion:
				"Use the tracked-workflow template bootstrap section instead of hand-written RUN_ID setup.",
		});
	} else {
		if (bootstrapMatches.length > 1) {
			diagnostics.push({
				rule: "L007",
				severity: "error",
				message:
					"Tracked workflow has multiple workflow-bootstrap commands; only the template-generated bootstrap is allowed",
				file,
				line: findLineNumber(content, bootstrapMatches[1]?.index ?? 0),
				suggestion:
					"Remove manual bootstrap stanzas from the workflow body and rely on template injection.",
			});
		}

		for (const match of bootstrapMatches) {
			const index = match.index ?? 0;
			const block = getBootstrapBlock(content, index);

			if (!/--name\b/.test(block) || !/--schema-path\b/.test(block)) {
				diagnostics.push({
					rule: "L007",
					severity: "error",
					message:
						"Tracked workflow bootstrap must include template-generated --name and --schema-path inputs",
					file,
					line: findLineNumber(content, index),
					suggestion:
						"Do not hand-author workflow-bootstrap commands; use the generated tracked-workflow bootstrap section.",
				});
			}
		}
	}

	MANUAL_RUN_ID_PATTERN.lastIndex = 0;
	let manualRunIdMatch: RegExpExecArray | null;
	while ((manualRunIdMatch = MANUAL_RUN_ID_PATTERN.exec(content)) !== null) {
		diagnostics.push({
			rule: "L007",
			severity: "error",
			message: "Tracked workflow must not instruct manual RUN_ID generation",
			file,
			line: findLineNumber(content, manualRunIdMatch.index),
			suggestion:
				"Use RUN_ID from the generated workflow-bootstrap output instead of generating a UUID in the prompt body.",
		});
	}

	RESUME_RUN_PATTERN.lastIndex = 0;
	let resumeRunMatch: RegExpExecArray | null;
	while ((resumeRunMatch = RESUME_RUN_PATTERN.exec(content)) !== null) {
		diagnostics.push({
			rule: "L007",
			severity: "error",
			message:
				"Tracked workflow must not call `rp1 agent-tools emit resume-run` directly",
			file,
			line: findLineNumber(content, resumeRunMatch.index),
			suggestion:
				"Use the generated workflow-bootstrap output and pass that context to downstream helpers.",
		});
	}

	return diagnostics;
}
