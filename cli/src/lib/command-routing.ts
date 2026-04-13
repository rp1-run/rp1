const ROOT_BOOLEAN_OPTIONS = new Set(["-v", "--verbose", "--trace"]);
const ROOT_TERMINATING_OPTIONS = new Set(["-V", "--version", "-h", "--help"]);

/**
 * Return the first top-level command token after known root boolean flags.
 * This keeps lazy command routing working when users place global flags before
 * the command, such as `rp1 --trace agent-tools ...`.
 */
export const getTopLevelCommandToken = (
	args: readonly string[],
): string | undefined => {
	for (const arg of args) {
		if (ROOT_BOOLEAN_OPTIONS.has(arg)) {
			continue;
		}

		if (ROOT_TERMINATING_OPTIONS.has(arg) || arg === "--") {
			return undefined;
		}

		if (arg.startsWith("-")) {
			return undefined;
		}

		return arg;
	}

	return undefined;
};

export const isTopLevelCommandInvocation = (
	args: readonly string[],
	commandName: string,
): boolean => getTopLevelCommandToken(args) === commandName;
