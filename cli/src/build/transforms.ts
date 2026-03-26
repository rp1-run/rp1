/**
 * Post-render transforms for compiled skill/agent output.
 */

import type { BuildPlatform } from "./template-context.js";

/**
 * Inject `--harness <platform>` into `rp1 agent-tools emit` event commands
 * in rendered output so the harness column is populated in real workflow runs.
 *
 * Only matches actual event invocations: `emit` followed by `--`, `\`, or EOL.
 * Excludes subcommands like `emit resume-run` and prose mentions.
 */
export function injectEmitHarness(
	content: string,
	platform: BuildPlatform,
): string {
	return content.replace(
		/rp1 agent-tools emit(?= (?:--|\\)| *$)(?! .*--harness)/gm,
		`rp1 agent-tools emit --harness ${platform}`,
	);
}
