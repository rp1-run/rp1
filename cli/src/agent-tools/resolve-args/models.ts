/**
 * Type-safe data models for the resolve-args agent tool.
 * Defines input, output, and intermediate types for argument resolution.
 */

/** Input payload for the resolve-args tool. */
export interface ResolveArgsInput {
	readonly schema_path?: string;
	readonly name?: string;
	readonly raw_args: string;
	readonly project_root: string;
}

/** Resolved argument values keyed by UPPER_SNAKE_CASE argument name. */
export type ResolvedArgumentValues = Readonly<Record<string, string | boolean>>;

/** Reserved environment values keyed by parameter name. Currently emitted as {}. */
export type ResolvedEnvironmentValues = Readonly<Record<string, string>>;

/** Directory resolution status for the requested project root. */
export type ResolvedDirectoryStatus =
	| "initialized"
	| "legacy"
	| "uninitialized";

/** Canonical project directories derived from project_root. */
export interface ResolvedDirectories {
	readonly projectRoot: string;
	readonly projectId: string | undefined;
	readonly kbRoot: string;
	readonly workRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly status: ResolvedDirectoryStatus;
	readonly nextStepCommand?: "rp1 init" | "rp1 migrate";
}

/** Output payload for the resolve-args tool. */
export interface ResolvedArgs {
	readonly arguments: ResolvedArgumentValues;
	readonly directories: ResolvedDirectories;
	readonly environment: ResolvedEnvironmentValues;
	readonly unresolved: readonly string[];
}
