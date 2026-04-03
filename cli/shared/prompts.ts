export interface PromptOptions {
	isTTY: boolean;
	defaultOnNonTTY?: boolean;
}

/**
 * Raise the max-listener ceiling on process.stdin for the duration of an
 * @inquirer/prompts call, then restore the previous value.
 *
 * Each inquirer prompt attaches multiple keypress listeners to stdin.
 * When many prompts run sequentially (e.g. per-file overwrite confirmations
 * during `rp1 install`), the accumulated listeners exceed the default limit
 * and Node emits a MaxListenersExceededWarning.  Temporarily bumping the
 * limit avoids the warning while keeping the safeguard in place otherwise.
 */
async function withStdinListenerLimit<T>(fn: () => Promise<T>): Promise<T> {
	const stdin = process.stdin;
	const prev = stdin.getMaxListeners();
	stdin.setMaxListeners(Math.max(prev, 50));
	try {
		return await fn();
	} finally {
		stdin.setMaxListeners(prev);
	}
}

/**
 * Confirm a destructive action.
 * In non-TTY environments, returns defaultOnNonTTY (default: false = abort).
 */
export async function confirmAction(
	message: string,
	options: PromptOptions,
): Promise<boolean> {
	if (!options.isTTY) {
		return options.defaultOnNonTTY ?? false;
	}

	const { confirm } = await import("@inquirer/prompts");
	return withStdinListenerLimit(() =>
		confirm({
			message,
			default: false,
		}),
	);
}

/**
 * Select from a list of options.
 * In non-TTY environments, returns null.
 */
export async function selectOption<T extends string>(
	message: string,
	choices: Array<{ value: T; name: string; description?: string }>,
	options: PromptOptions,
): Promise<T | null> {
	if (!options.isTTY) {
		return null;
	}

	const { select } = await import("@inquirer/prompts");
	return withStdinListenerLimit(() =>
		select({
			message,
			choices,
		}),
	);
}

/**
 * Multi-select from a list of options.
 * In non-TTY environments, returns empty array.
 */
export async function selectMultiple<T extends string>(
	message: string,
	choices: Array<{ value: T; name: string; checked?: boolean }>,
	options: PromptOptions,
): Promise<T[]> {
	if (!options.isTTY) {
		return [];
	}

	const { checkbox } = await import("@inquirer/prompts");
	return withStdinListenerLimit(() =>
		checkbox({
			message,
			choices,
		}),
	);
}
