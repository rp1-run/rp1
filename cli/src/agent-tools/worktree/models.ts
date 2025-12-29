/**
 * Type-safe data models for worktree agent tool.
 * Defines interfaces for worktree creation, cleanup, and status operations.
 */

/**
 * Result of worktree creation.
 * Contains the path, branch name, and base commit SHA.
 */
export interface WorktreeCreateResult {
	/** Absolute path to the created worktree directory */
	readonly path: string;
	/** Branch name (e.g., quick-build-<slug>) */
	readonly branch: string;
	/** Commit SHA the worktree is based on */
	readonly basedOn: string;
}

/**
 * Result of worktree cleanup operation.
 * Indicates whether the worktree and branch were removed.
 */
export interface WorktreeCleanupResult {
	/** Whether the worktree directory was successfully removed */
	readonly removed: boolean;
	/** Whether the associated branch was deleted */
	readonly branchDeleted: boolean;
	/** Path to the worktree that was cleaned up */
	readonly path: string;
}

/**
 * Result of worktree status check.
 * Indicates whether currently running in a worktree and provides context.
 */
export interface WorktreeStatusResult {
	/** True if currently running in a linked git worktree */
	readonly isWorktree: boolean;
	/** Worktree path (only present when isWorktree is true) */
	readonly path?: string;
	/** Branch name (only present when isWorktree is true) */
	readonly branch?: string;
	/** Path to the main repository (only present when isWorktree is true) */
	readonly mainRepoPath?: string;
}
