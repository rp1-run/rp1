import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Maps each harness ID to a function that resolves its user-global instruction
 * file path from a given home directory.
 */
export const GLOBAL_INSTRUCTION_PATH_MAP: Record<
	string,
	(homeDir: string) => string
> = {
	"claude-code": (home) => join(home, ".claude", "CLAUDE.md"),
	codex: (home) => join(home, ".codex", "AGENTS.md"),
	opencode: (home) => join(home, ".config", "opencode", "AGENTS.md"),
	copilot: (home) => join(home, ".copilot", "copilot-instructions.md"),
	antigravity: (home) => join(home, ".gemini", "AGENTS.md"),
};

/**
 * Resolve the absolute path to a harness's global instruction file.
 * Returns null for unknown harness IDs so callers can skip with a warning
 * (forward-compatible with future platforms).
 */
export function resolveGlobalInstructionPath(
	harnessId: string,
	homeDir: string = homedir(),
): string | null {
	const resolver = GLOBAL_INSTRUCTION_PATH_MAP[harnessId];
	return resolver ? resolver(homeDir) : null;
}
