/**
 * L003: Detect incomplete dispatch blocks in Codex output.
 *
 * Codex agent spawning requires explicit context mode on every spawn block
 * and corresponding wait instructions for foreground spawns. This rule detects
 * hand-written or incomplete dispatch blocks that miss part of that protocol.
 *
 * Background spawns ("Spawn agent (background):") are exempt because they
 * intentionally omit wait instructions.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const SPAWN_PATTERN = /^Spawn agent(?: \(background\))?:\s*$/gm;
const WAIT_PATTERN =
	/Wait for the spawned agent to complete|Do NOT proceed until the agent has finished/;
const FORK_CONTEXT_PATTERN = /^\s{2}fork_context:\s*(true|false)\s*$/m;

function findLineNumber(content: string, index: number): number {
	let line = 1;
	for (let i = 0; i < index && i < content.length; i++) {
		if (content[i] === "\n") line++;
	}
	return line;
}

export function incompleteDispatchRule(
	content: string,
	platform: BuildPlatform,
	file: string,
): LintDiagnostic[] {
	if (platform !== "codex") return [];

	const diagnostics: LintDiagnostic[] = [];

	const spawnMatches = Array.from(content.matchAll(SPAWN_PATTERN));
	for (const [index, match] of spawnMatches.entries()) {
		const spawnIndex = match.index ?? 0;
		const isBackground = match[0].includes("(background)");
		const nextSpawnIndex =
			index + 1 < spawnMatches.length
				? (spawnMatches[index + 1].index ?? content.length)
				: content.length;
		const block = content.slice(spawnIndex, nextSpawnIndex);

		if (!FORK_CONTEXT_PATTERN.test(block)) {
			diagnostics.push({
				rule: "L003",
				severity: "error",
				message: "Codex spawn block missing explicit fork_context setting",
				file,
				line: findLineNumber(content, spawnIndex),
				suggestion:
					"Use {% dispatch_agent %} tag to generate the complete spawn protocol, or add `fork_context: false` (default) or `fork_context: true` explicitly.",
			});
		}

		if (isBackground || WAIT_PATTERN.test(block)) {
			continue;
		}

		diagnostics.push({
			rule: "L003",
			severity: "error",
			message: "Codex foreground spawn block missing wait instructions",
			file,
			line: findLineNumber(content, spawnIndex),
			suggestion:
				"Use {% dispatch_agent %} tag to generate the complete spawn/wait protocol, or add wait instructions after the spawn block.",
		});
	}

	return diagnostics;
}
