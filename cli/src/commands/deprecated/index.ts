import { Command } from "commander";

/**
 * Create a deprecated command wrapper.
 * Prints warning to stderr, then delegates to the target action.
 *
 * @param oldName - The deprecated command name (e.g., "install:claude-code")
 * @param newName - The new command name to suggest (e.g., "install claude-code")
 * @param targetAction - The action function to delegate to
 * @returns A hidden Commander.js Command with deprecation warning
 */
export const createDeprecatedCommand = (
	oldName: string,
	newName: string,
	targetAction: (...args: unknown[]) => Promise<void>,
): Command => {
	return new Command(oldName)
		.description(`[DEPRECATED] Use 'rp1 ${newName}' instead`)
		.allowUnknownOption()
		.action(async (...args) => {
			console.error(
				`Warning: 'rp1 ${oldName}' is deprecated. Use 'rp1 ${newName}' instead.`,
			);
			await targetAction(...args);
		});
};
