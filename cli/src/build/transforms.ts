/**
 * Post-render transforms for compiled skill/agent output.
 */

import type { BuildPlatform } from "./template-context.js";

/**
 * Inject `--harness <platform>` into all `rp1 agent-tools emit` commands
 * in rendered output so the harness column is populated in real workflow runs.
 * Skips commands that already include `--harness`.
 */
export function injectEmitHarness(
	content: string,
	platform: BuildPlatform,
): string {
	return content.replace(
		/rp1 agent-tools emit(?! .*--harness)\b/g,
		`rp1 agent-tools emit --harness ${platform}`,
	);
}
