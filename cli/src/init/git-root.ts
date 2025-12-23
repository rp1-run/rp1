/**
 * Git root detection utilities for the rp1 init command.
 * Detects whether the current directory is at the git repository root
 * or in a subdirectory, to help users initialize in the correct location.
 */

import * as TE from "fp-ts/lib/TaskEither.js";

/**
 * Result of git root detection.
 */
export interface GitRootResult {
	/** Whether the current directory is inside a git repository */
	readonly isGitRepo: boolean;
	/** The absolute path to the git repository root, or null if not in a repo */
	readonly gitRoot: string | null;
	/** The current working directory that was checked */
	readonly currentDir: string;
	/** Whether currentDir equals gitRoot (user is at the repo root) */
	readonly isAtRoot: boolean;
}

/**
 * Detects the git repository root for the given directory.
 *
 * Uses `git rev-parse --show-toplevel` to find the root.
 * Never throws - all errors are wrapped in the result type.
 *
 * @param cwd - The directory to check (defaults to process.cwd())
 * @returns TaskEither that always succeeds with a GitRootResult
 */
export const detectGitRoot = (
	cwd: string,
): TE.TaskEither<never, GitRootResult> =>
	TE.tryCatch(
		async () => {
			try {
				const proc = Bun.spawn(["git", "rev-parse", "--show-toplevel"], {
					cwd,
					stdout: "pipe",
					stderr: "pipe",
				});
				const exitCode = await proc.exited;

				if (exitCode !== 0) {
					// Not a git repository or git not installed
					return {
						isGitRepo: false,
						gitRoot: null,
						currentDir: cwd,
						isAtRoot: false,
					};
				}

				const gitRoot = (await new Response(proc.stdout).text()).trim();

				// Normalize paths for comparison (handle trailing slashes, etc.)
				const normalizedGitRoot = gitRoot.replace(/\/+$/, "");
				const normalizedCwd = cwd.replace(/\/+$/, "");

				return {
					isGitRepo: true,
					gitRoot,
					currentDir: cwd,
					isAtRoot: normalizedGitRoot === normalizedCwd,
				};
			} catch {
				// Git command failed (e.g., git not installed)
				return {
					isGitRepo: false,
					gitRoot: null,
					currentDir: cwd,
					isAtRoot: false,
				};
			}
		},
		// This function never fails - we catch all errors and return a result
		() =>
			({
				isGitRepo: false,
				gitRoot: null,
				currentDir: cwd,
				isAtRoot: false,
			}) as never,
	);
