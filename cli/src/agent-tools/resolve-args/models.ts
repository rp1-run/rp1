/**
 * Type-safe data models for the resolve-args agent tool.
 * Defines input, output, and intermediate types for argument resolution.
 */

import type {
	ArgumentDefinition,
	EnvironmentDefinition,
} from "../../build/models.js";

/** Pre-parsed schema definitions from a caller that already parsed the skill file. */
export interface ParsedSchema {
	readonly arguments: readonly ArgumentDefinition[];
	readonly environment: readonly EnvironmentDefinition[];
}

/** Input payload for the resolve-args tool. */
export interface ResolveArgsInput {
	readonly schema_path?: string;
	readonly name?: string;
	readonly raw_args: string;
	readonly project_root: string;
	readonly parsedSchema?: ParsedSchema;
}

/** Resolved argument values keyed by UPPER_SNAKE_CASE argument name. */
export type ResolvedArgumentValues = Readonly<Record<string, string | boolean>>;

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
	readonly codeRoot: string;
	readonly isWorktree: boolean;
	readonly worktreeName?: string;
	readonly status: ResolvedDirectoryStatus;
	readonly nextStepCommand?: "rp1 init" | "rp1 migrate";
	readonly kbInitialized: boolean;
	readonly kbNextStepHint?: string;
}

/** Output payload for the resolve-args tool. */
export interface ResolvedArgs {
	readonly arguments: ResolvedArgumentValues;
	readonly directories: ResolvedDirectories;
	readonly unresolved: readonly string[];
}
