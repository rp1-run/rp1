/**
 * L006: Detect `rp1 agent-tools emit` event invocations missing `--harness`.
 *
 * The build pipeline's post-render transform injects `--harness <platform>`
 * into all emit event commands. If an emit call in compiled output lacks
 * `--harness`, it means the transform missed it or a new emit pattern was
 * introduced without coverage. This would leave the runs.harness column
 * NULL for real workflow runs.
 *
 * Excludes subcommands like `emit resume-run` which are not event emits.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

/** Matches emit event invocations: `emit` followed by `--`, `\`, or EOL. */
const EMIT_EVENT_PATTERN = /rp1 agent-tools emit(?= (?:--|\\)| *$)/gm;

export function missingEmitHarnessRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	EMIT_EVENT_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = EMIT_EVENT_PATTERN.exec(content)) !== null) {
		const lineEnd = content.indexOf("\n", match.index);
		const restOfLine = content.slice(
			match.index,
			lineEnd === -1 ? undefined : lineEnd,
		);

		if (!restOfLine.includes("--harness")) {
			diagnostics.push({
				rule: "L006",
				severity: "warning",
				message:
					"emit event invocation missing --harness; runs.harness will be NULL",
				file,
				line: findLineNumber(content, match.index),
				suggestion:
					"Ensure injectEmitHarness transform in build/transforms.ts covers this pattern",
			});
		}
	}

	return diagnostics;
}
