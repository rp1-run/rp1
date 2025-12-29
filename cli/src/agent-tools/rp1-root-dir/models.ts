/**
 * Type-safe data models for rp1-root-dir agent tool.
 * Defines interfaces for RP1_ROOT path resolution with worktree awareness.
 */

/**
 * How the RP1_ROOT path was resolved.
 * - 'env': From RP1_ROOT environment variable override
 * - 'git-common-dir': Derived from git's common-dir when in a linked worktree
 * - 'cwd': Standard resolution from current working directory
 */
export type Rp1RootSource = "env" | "git-common-dir" | "cwd";

/**
 * Result of RP1_ROOT path resolution.
 * Contains the resolved path and metadata about the resolution context.
 */
export interface Rp1RootResult {
	/** Absolute path to the RP1_ROOT directory (e.g., /path/to/project/.rp1) */
	readonly root: string;
	/** True if currently running in a linked git worktree */
	readonly isWorktree: boolean;
	/** Branch name of the worktree (only present when isWorktree is true) */
	readonly worktreeName?: string;
	/** How the root path was resolved */
	readonly source: Rp1RootSource;
}
