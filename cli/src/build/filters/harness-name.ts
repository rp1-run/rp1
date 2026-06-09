/**
 * Liquid filter: harness_name
 *
 * Maps a build platform to its canonical harness enum value used in
 * Host Context self-identification and --harness flags.
 *
 * | Platform    | Harness       |
 * |-------------|---------------|
 * | claude-code | claude-code   |
 * | codex       | codex         |
 * | copilot     | gh-copilot    |
 * | antigravity | antigravity   |
 * | opencode    | opencode      |
 *
 * Values not in this table return "unknown".
 */

import type { BuildPlatform } from "../template-context.js";

export const harnessName = (platform: BuildPlatform): string => {
	switch (platform) {
		case "claude-code":
			return "claude-code";
		case "codex":
			return "codex";
		case "copilot":
			return "gh-copilot";
		case "antigravity":
			return "antigravity";
		case "goose":
			return "goose";
		case "opencode":
			return "opencode";
	}
};
