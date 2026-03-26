/**
 * Argument hint derivation and implies chain validation.
 *
 * Pure functions that operate on parsed ArgumentDefinition arrays
 * from skill/agent frontmatter.
 */

import type { ArgumentDefinition } from "./models.js";

/**
 * Transform an UPPER_SNAKE_CASE name to lower-kebab-case.
 */
const toKebabCase = (name: string): string =>
	name.toLowerCase().replace(/_/g, "-");

/**
 * Render a single argument definition as a hint token.
 *
 * Rules (from FR-04):
 *   required string  -> <lower-kebab-case>
 *   optional string  -> [lower-kebab-case]
 *   optional boolean -> [--lower-kebab-case]
 *   variadic         -> [lower-kebab-case...]
 *   enum             -> same brackets as string (required/optional)
 */
const renderHintToken = (arg: ArgumentDefinition): string => {
	const kebab = toKebabCase(arg.name);

	if (arg.variadic) {
		return `[${kebab}...]`;
	}

	if (arg.type === "boolean") {
		return `[--${kebab}]`;
	}

	if (arg.required) {
		return `<${kebab}>`;
	}

	return `[${kebab}]`;
};

/**
 * Derive the argument-hint string from structured argument definitions.
 *
 * Produces a space-separated token list suitable for host platform display
 * (e.g., `<feature-id> [--afk] [--git-commit]`).
 *
 * Returns an empty string when the input array is empty.
 */
export const deriveArgumentHint = (
	args: readonly ArgumentDefinition[],
): string => args.map(renderHintToken).join(" ");

/**
 * Result of implies chain validation.
 */
export interface ImpliesValidationError {
	readonly type: "circular" | "dangling";
	readonly argument: string;
	readonly target: string;
	readonly chain?: readonly string[];
}

/**
 * Validate implies chains across all argument definitions.
 *
 * Detects two error classes:
 *   1. Dangling references: an `implies` target that does not exist in the
 *      argument array.
 *   2. Circular chains: a cycle in the implies graph detected via DFS with
 *      a recursion stack.
 *
 * Returns an empty array when all chains are valid.
 */
export const validateImpliesChains = (
	args: readonly ArgumentDefinition[],
): readonly ImpliesValidationError[] => {
	const errors: ImpliesValidationError[] = [];
	const nameSet = new Set(args.map((a) => a.name));

	// Build adjacency list and check dangling references in one pass.
	const adjacency = new Map<string, readonly string[]>();
	for (const arg of args) {
		if (!arg.implies || arg.implies.length === 0) continue;
		adjacency.set(arg.name, arg.implies);
		for (const target of arg.implies) {
			if (!nameSet.has(target)) {
				errors.push({ type: "dangling", argument: arg.name, target });
			}
		}
	}

	// DFS cycle detection with recursion stack tracking.
	const visited = new Set<string>();
	const inStack = new Set<string>();

	const dfs = (node: string, path: string[]): void => {
		if (inStack.has(node)) {
			const cycleStart = path.indexOf(node);
			const cycle = path.slice(cycleStart);
			errors.push({
				type: "circular",
				argument: cycle[0],
				target: node,
				chain: [...cycle, node],
			});
			return;
		}
		if (visited.has(node)) return;

		visited.add(node);
		inStack.add(node);

		const targets = adjacency.get(node);
		if (targets) {
			for (const t of targets) {
				if (nameSet.has(t)) {
					dfs(t, [...path, node]);
				}
			}
		}

		inStack.delete(node);
	};

	for (const name of adjacency.keys()) {
		if (!visited.has(name)) {
			dfs(name, []);
		}
	}

	return errors;
};
