export interface PromptOptions {
  isTTY: boolean;
  defaultOnNonTTY?: boolean;
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
  return confirm({
    message,
    default: false,
  });
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
  return select({
    message,
    choices,
  });
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
  return checkbox({
    message,
    choices,
  });
}
