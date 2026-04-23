/**
 * Post-render transforms for compiled skill/agent output.
 */

import {
	emitCommandHasHarness,
	findEmitEventCommands,
	getEmitEventToken,
} from "./emit-command-utils.js";
import type { BuildPlatform } from "./template-context.js";

/**
 * Inject `--harness $CURRENT_HOST` into `rp1 agent-tools emit` event commands
 * in rendered output so the model-populated harness variable flows through to
 * real workflow runs.
 *
 * Only matches actual event invocations: `emit` followed by `--`, `\`, or EOL.
 * Excludes subcommands like `emit resume-run` and prose mentions.
 */
export function injectEmitHarness(
	content: string,
	_platform: BuildPlatform,
): string {
	const matches = findEmitEventCommands(content);
	const emitToken = getEmitEventToken();
	let result = content;

	for (let i = matches.length - 1; i >= 0; i--) {
		const match = matches[i];
		if (emitCommandHasHarness(match.command)) {
			continue;
		}

		result =
			result.slice(0, match.index) +
			`${emitToken} --harness $CURRENT_HOST` +
			result.slice(match.index + emitToken.length);
	}

	return result;
}
