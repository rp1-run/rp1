/**
 * Type definitions for the eval test harness.
 * Used by createTestEnvironment and cleanupTestEnvironment functions.
 */

/**
 * Represents an isolated test environment with a temp directory.
 */
export interface TestEnvironment {
	/** Absolute path to the isolated temp directory */
	readonly tempDir: string;
	/** Cleanup function to remove the temp directory */
	readonly cleanup: () => Promise<void>;
	/** Mark the test as failed to preserve temp directory (if preserveOnFail is true) */
	readonly markFailed: () => void;
}

/**
 * Options for creating a test environment.
 */
export interface HarnessOptions {
	/** Initialize a git repo in the temp directory */
	readonly withGit: boolean;
	/** Files to create in the temp directory */
	readonly withFiles: readonly FileSpec[];
	/** Preserve temp directory on test failure for debugging */
	readonly preserveOnFail: boolean;
}

/**
 * Specification for a file to create in the test environment.
 */
export interface FileSpec {
	/** Relative path from temp directory root */
	readonly path: string;
	/** File content */
	readonly content: string;
}
