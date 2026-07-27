/**
 * L016: Enforce the non-inferable `rp1 agent-tools emit` contracts.
 *
 * Three rules in AGENTS.md are invisible to the model and break machinery
 * rather than output quality when violated, so nothing in a prompt's own text
 * reveals the mistake:
 *
 * 1. `--run-id` is mandatory. Without it the event is not attached to a run,
 *    so the workflow never appears in Arcade.
 * 2. `artifact_registered` must declare `storageRoot`. Path resolution keys
 *    off it, so a missing value silently produces an unreachable artifact.
 * 3. Sub-agents must namespace `--step` as `{agent-name}:{state}`. The emit
 *    step validator treats the colon as the signal to bypass the parent state
 *    machine; a bare step collides with parent states and is rejected at
 *    runtime.
 *
 * Rule 3 applies only to `status_change`. For `artifact_registered` the step
 * is a phase label that intentionally matches the parent's state, and
 * step-validation.ts only checks transitions for `status_change` events.
 *
 * Scope: only fully-formed block commands (carrying both `--workflow` and
 * `--type`) are checked. Prose mentions such as "register via `rp1
 * agent-tools emit --type artifact_registered`" are references, not commands.
 */

import { findEmitEventCommands } from "../../emit-command-utils.js";
import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

/** Unresolved template placeholders such as `{CURRENT_STATE}`. */
const isPlaceholder = (value: string): boolean => value.startsWith("{");

const findLineNumber = (content: string, index: number): number => {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
};

/**
 * A prose reference names the command without invoking it. Real emits always
 * carry a workflow and an event type.
 */
const isBlockCommand = (command: string): boolean =>
	command.includes("--workflow") && command.includes("--type");

export function emitContractInvariantsRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	// Skills own their state machine and emit bare steps; only sub-agents must
	// namespace. Skills are linted as `<dir>/SKILL.md`, agents as a filename.
	const isSubAgent = !file.endsWith("SKILL.md");

	for (const match of findEmitEventCommands(content)) {
		const { command, index } = match;
		if (!isBlockCommand(command)) {
			continue;
		}

		const line = findLineNumber(content, index);

		if (!command.includes("--run-id")) {
			diagnostics.push({
				rule: "L016",
				severity: "error",
				message:
					"emit command missing --run-id; the event has no run to attach to",
				file,
				line,
				suggestion:
					"Add --run-id {RUN_ID} using the value from the workflow bootstrap section",
			});
		}

		if (
			command.includes("artifact_registered") &&
			!command.includes("storageRoot")
		) {
			diagnostics.push({
				rule: "L016",
				severity: "error",
				message:
					"artifact_registered missing storageRoot; the artifact path cannot be resolved",
				file,
				line,
				suggestion:
					'Add an explicit "storageRoot" to --data: "work_dir" for work artifacts, "project" for KB artifacts',
			});
		}

		if (isSubAgent && command.includes("status_change")) {
			const step = /--step\s+([^\s\\]+)/.exec(command)?.[1];
			if (step && !isPlaceholder(step) && !step.includes(":")) {
				diagnostics.push({
					rule: "L016",
					severity: "error",
					message: `sub-agent status_change step "${step}" is not namespaced; it will collide with parent workflow states`,
					file,
					line,
					suggestion: `Prefix the step with the agent name, e.g. --step {agent-name}:${step}`,
				});
			}
		}
	}

	return diagnostics;
}
