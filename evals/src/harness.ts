/**
 * Test harness for eval environment setup and teardown.
 *
 * Provides isolated temp directories with optional git repos for
 * running prompt evaluations safely without affecting the working directory.
 *
 * Supports creating a local "remote" git repo so agents can safely push
 * without network access or affecting real repositories.
 */

import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { FileSpec, HarnessOptions, TestEnvironment } from "./types.js";

/**
 * Environment variables to clear when running git commands.
 * Prevents git from inheriting context from the parent process.
 */
const GIT_ENV_VARS_TO_CLEAR = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
] as const;

/**
 * Create isolated environment for git commands.
 * Clears git-related env vars that could cause cross-repo contamination.
 */
function getIsolatedGitEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of GIT_ENV_VARS_TO_CLEAR) {
		delete env[key];
	}
	return env;
}

/**
 * Spawn a git command with isolated environment.
 */
async function runGit(args: string[], cwd: string): Promise<void> {
	const proc = Bun.spawn(["git", ...args], {
		cwd,
		stdout: "pipe",
		stderr: "pipe",
		env: getIsolatedGitEnv(),
	});
	const exitCode = await proc.exited;
	if (exitCode !== 0) {
		const stderr = await new Response(proc.stderr).text();
		throw new Error(`git ${args[0]} failed: ${stderr}`);
	}
}

/**
 * Initialize a bare git repo to act as a local remote.
 * This allows agents to push without network access.
 */
async function initBareRemote(remotePath: string): Promise<void> {
	await mkdir(remotePath, { recursive: true });
	await runGit(["init", "--bare"], remotePath);
}

/**
 * Initialize a git repo for testing with proper isolation.
 * Creates the repo, configures test user credentials, and makes an initial commit.
 * Optionally sets up a local remote for push testing.
 */
async function initGitRepo(
	repoPath: string,
	remotePath?: string,
): Promise<void> {
	await runGit(["init"], repoPath);
	await runGit(["config", "--local", "user.email", "eval@rp1.run"], repoPath);
	await runGit(["config", "--local", "user.name", "rp1 Eval"], repoPath);

	// Create initial commit for a valid git state
	await writeFile(join(repoPath, ".gitignore"), ".rp1/\n");
	await runGit(["add", "."], repoPath);
	await runGit(["commit", "-m", "Initial commit"], repoPath);

	// Set up local remote if provided
	if (remotePath) {
		await runGit(["remote", "add", "origin", remotePath], repoPath);
		await runGit(["push", "-u", "origin", "main"], repoPath);
	}
}

/**
 * Create files in the temp directory based on FileSpec array.
 */
async function createFiles(
	tempDir: string,
	files: readonly FileSpec[],
): Promise<void> {
	for (const file of files) {
		const fullPath = join(tempDir, file.path);
		const parentDir = dirname(fullPath);
		await mkdir(parentDir, { recursive: true });
		await writeFile(fullPath, file.content, "utf-8");
	}
}

/**
 * Create an isolated test environment.
 *
 * @param opts - Configuration options for the environment
 * @returns TestEnvironment with tempDir path and cleanup function
 *
 * @example
 * ```typescript
 * // Basic usage with git
 * const env = await createTestEnvironment({
 *   withGit: true,
 *   withFiles: [{ path: "src/index.ts", content: "// placeholder" }],
 *   preserveOnFail: false
 * });
 *
 * // With local remote for push testing
 * const env = await createTestEnvironment({
 *   withGit: true,
 *   withLocalRemote: true,
 *   withFiles: [],
 *   preserveOnFail: false
 * });
 * // env.remoteDir contains path to bare repo
 * // ... run tests ...
 * await env.cleanup();
 * ```
 */
export async function createTestEnvironment(
	opts: HarnessOptions,
): Promise<TestEnvironment> {
	const tempDir = await mkdtemp(join(tmpdir(), "rp1-eval-"));
	let remoteDir: string | undefined;

	// Create local bare remote if requested
	if (opts.withLocalRemote) {
		remoteDir = await mkdtemp(join(tmpdir(), "rp1-eval-remote-"));
		await initBareRemote(remoteDir);
	}

	// Create specified files
	if (opts.withFiles.length > 0) {
		await createFiles(tempDir, opts.withFiles);
	}

	// Initialize git if requested
	if (opts.withGit) {
		await initGitRepo(tempDir, remoteDir);
	}

	// Track whether cleanup should be skipped (for preserveOnFail)
	let shouldPreserve = false;

	const markFailed = (): void => {
		shouldPreserve = true;
	};

	const cleanup = async (): Promise<void> => {
		if (shouldPreserve && opts.preserveOnFail) {
			console.log(`Preserving temp directory for debugging: ${tempDir}`);
			if (remoteDir) {
				console.log(`Preserving remote directory: ${remoteDir}`);
			}
			return;
		}
		await rm(tempDir, { recursive: true, force: true });
		if (remoteDir) {
			await rm(remoteDir, { recursive: true, force: true });
		}
	};

	return {
		tempDir,
		remoteDir,
		cleanup,
		markFailed,
	};
}

/**
 * Clean up a test environment.
 *
 * @param env - The test environment to clean up
 *
 * @example
 * ```typescript
 * await cleanupTestEnvironment(env);
 * ```
 */
export async function cleanupTestEnvironment(
	env: TestEnvironment,
): Promise<void> {
	await env.cleanup();
}
