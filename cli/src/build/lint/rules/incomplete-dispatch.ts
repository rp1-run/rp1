/**
 * L003: Detect incomplete dispatch blocks in Codex output.
 *
 * Codex agent spawning requires a spawn block followed by corresponding
 * wait instructions (for foreground spawns). This rule detects "Spawn agent:"
 * blocks that lack the expected wait instructions, indicating an incomplete
 * or hand-written dispatch block that missed the wait protocol.
 *
 * Background spawns ("Spawn agent (background):") are exempt because they
 * intentionally omit wait instructions.
 */

import type { BuildPlatform } from "../../template-context.js";
import type { LintDiagnostic } from "../index.js";

const SPAWN_PATTERN = /^Spawn agent:\s*$/gm;
const WAIT_PATTERN =
	/Wait for the spawned agent to complete|Do NOT proceed until the agent has finished/;

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

	SPAWN_PATTERN.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = SPAWN_PATTERN.exec(content)) !== null) {
		const spawnIndex = match.index;
		const nextSpawnMatch = content.indexOf(
			"Spawn agent:",
			spawnIndex + match[0].length,
		);
		const nextBackgroundMatch = content.indexOf(
			"Spawn agent (background):",
			spawnIndex + match[0].length,
		);

		const blockEnd =
			Math.min(
				nextSpawnMatch === -1 ? Number.POSITIVE_INFINITY : nextSpawnMatch,
				nextBackgroundMatch === -1
					? Number.POSITIVE_INFINITY
					: nextBackgroundMatch,
			) === Number.POSITIVE_INFINITY
				? content.length
				: Math.min(
						nextSpawnMatch === -1 ? Number.POSITIVE_INFINITY : nextSpawnMatch,
						nextBackgroundMatch === -1
							? Number.POSITIVE_INFINITY
							: nextBackgroundMatch,
					);

		const block = content.slice(spawnIndex, blockEnd);
		if (!WAIT_PATTERN.test(block)) {
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
	}

	return diagnostics;
}
