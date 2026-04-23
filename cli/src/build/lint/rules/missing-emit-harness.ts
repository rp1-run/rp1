/**
 * L006: Detect `rp1 agent-tools emit` event invocations missing `--harness`.
 *
 * The build pipeline's post-render transform injects `--harness $CURRENT_HOST`
 * into all emit event commands so the model-populated harness variable flows
 * through to real workflow runs. If an emit call in compiled output lacks
 * `--harness`, it means the transform missed it or a new emit pattern was
 * introduced without coverage. This would leave the runs.harness column
 * NULL for real workflow runs.
 *
 * Excludes subcommands like `emit resume-run` which are not event emits.
 */

import {
	emitCommandHasHarness,
	findEmitEventCommands,
} from "../../emit-command-utils.js";
import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function missingEmitHarnessRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];
	for (const match of findEmitEventCommands(content)) {
		if (emitCommandHasHarness(match.command)) {
			continue;
		}

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

	return diagnostics;
}
