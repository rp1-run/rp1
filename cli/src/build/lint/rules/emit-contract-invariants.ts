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
 *
 * Checks read parsed option values, not substrings of the command text: a
 * `--run-id` mentioned inside a `--data` payload does not satisfy the run-id
 * contract, and `--step=building` must be held to the same namespacing rule
 * as `--step building`.
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
 * Split a command into option names and values, tolerating both `--flag value`
 * and `--flag=value`, shell line continuations, and quoted values (a `--data`
 * payload is a single-quoted JSON blob that contains spaces).
 *
 * A flag with no value maps to the empty string, which keeps "present but
 * empty" distinguishable from absent.
 */
const parseEmitOptions = (command: string): Map<string, string> => {
	const options = new Map<string, string>();
	const tokens = command
		.replace(/\\\r?\n/g, " ")
		.matchAll(/--[\w-]+=(?:'[^']*'|"[^"]*"|\S*)|'[^']*'|"[^"]*"|\S+/g);
	let pending: string | null = null;

	const unquote = (value: string): string =>
		(value.startsWith("'") && value.endsWith("'")) ||
		(value.startsWith('"') && value.endsWith('"'))
			? value.slice(1, -1)
			: value;

	for (const [token] of tokens) {
		if (token.startsWith("--")) {
			if (pending !== null) options.set(pending, "");
			const equals = token.indexOf("=");
			if (equals === -1) {
				pending = token.slice(2);
			} else {
				options.set(token.slice(2, equals), unquote(token.slice(equals + 1)));
				pending = null;
			}
			continue;
		}
		if (pending !== null) {
			options.set(pending, unquote(token));
			pending = null;
		}
	}
	if (pending !== null) options.set(pending, "");

	return options;
};

/**
 * Does the `--data` payload declare a `storageRoot` key? Payloads carry
 * unresolved placeholders, so they are rarely valid JSON — match the key
 * position instead of parsing.
 */
const declaresStorageRoot = (data: string): boolean =>
	/["']?storageRoot["']?\s*:/.test(data);

export function emitContractInvariantsRule(
	content: string,
	_platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	const diagnostics: LintDiagnostic[] = [];

	// Skills own their state machine and emit bare steps; only sub-agents must
	// namespace. Skills are linted as `<dir>/SKILL.md` and their companions as
	// `<dir>/references/<name>.md`, so anything carrying a path separator
	// belongs to a skill. Agents are linted under a bare filename.
	const isSubAgent = !file.includes("/");

	for (const match of findEmitEventCommands(content)) {
		const { command, index } = match;
		const options = parseEmitOptions(command);

		// A prose reference names the command without invoking it. Real emits
		// always carry a workflow and an event type.
		if (!options.has("workflow") || !options.has("type")) {
			continue;
		}

		const line = findLineNumber(content, index);
		const eventType = options.get("type") ?? "";

		if (!options.get("run-id")) {
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
			eventType === "artifact_registered" &&
			!declaresStorageRoot(options.get("data") ?? "")
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

		if (isSubAgent && eventType === "status_change") {
			const step = options.get("step");
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
