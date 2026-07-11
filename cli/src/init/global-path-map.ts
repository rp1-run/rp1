import { homedir } from "node:os";
import { join } from "node:path";

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

export function resolveGlobalInstructionPath(
	harnessId: string,
	homeDir: string = homedir(),
): string | null {
	const resolver = GLOBAL_INSTRUCTION_PATH_MAP[harnessId];
	return resolver ? resolver(homeDir) : null;
}
