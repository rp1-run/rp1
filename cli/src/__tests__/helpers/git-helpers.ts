/**
 * Git test helpers for safe, isolated git operations.
 *
 * These helpers ensure that git operations in tests:
 * 1. Use --local flag for config to prevent global/parent repo contamination
 * 2. Clear GIT_DIR and GIT_WORK_TREE env vars to prevent inheritance issues
 * 3. Provide verification that the main repo wasn't contaminated
 */

import path from "node:path";

/**
 * Environment variables to clear when running git commands in tests.
 * This prevents git from inheriting context from the parent process,
 * which can cause issues when tests run from inside a worktree.
 */
const GIT_ENV_ISOLATION: Record<string, string | undefined> = {
	GIT_DIR: undefined,
	GIT_WORK_TREE: undefined,
	GIT_INDEX_FILE: undefined,
	GIT_OBJECT_DIRECTORY: undefined,
	GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
	GIT_COMMON_DIR: undefined,
};

/**
 * Create isolated environment for git commands.
 * Clears git-related env vars that could cause cross-repo contamination.
 */
export function getIsolatedGitEnv(): NodeJS.ProcessEnv {
	const env = { ...process.env };
	for (const key of Object.keys(GIT_ENV_ISOLATION)) {
		delete env[key];
	}
	return env;
}

/**
 * Options for git spawn operations.
 */
export interface GitSpawnOptions {
	cwd: string;
	stdout?: "pipe" | "inherit" | "ignore";
	stderr?: "pipe" | "inherit" | "ignore";
}

/**
 * Spawn a git command with isolated environment.
 * Use this instead of raw Bun.spawn for git commands in tests.
 */
export function spawnGit(
	args: string[],
	options: GitSpawnOptions,
): ReturnType<typeof Bun.spawn> {
	return Bun.spawn(["git", ...args], {
		cwd: options.cwd,
		stdout: options.stdout ?? "pipe",
		stderr: options.stderr ?? "pipe",
		env: getIsolatedGitEnv(),
	});
}

/**
 * Initialize a git repo for testing with proper isolation.
 * Creates the repo and configures test user credentials.
 *
 * @param repoPath - Path where the repo should be created
 * @returns Promise that resolves when setup is complete
 */
export async function initTestRepo(repoPath: string): Promise<void> {
	// Initialize repo with isolated environment
	const initProc = spawnGit(["init"], { cwd: repoPath });
	await initProc.exited;

	// Configure user with --local to ensure it only affects this repo
	const emailProc = spawnGit(
		["config", "--local", "user.email", "test@test.com"],
		{ cwd: repoPath },
	);
	await emailProc.exited;

	const nameProc = spawnGit(["config", "--local", "user.name", "Test User"], {
		cwd: repoPath,
	});
	await nameProc.exited;

	// Create .gitignore with .rp1/ to satisfy worktree safety checks
	await Bun.write(path.join(repoPath, ".gitignore"), ".rp1/\n");
}

/**
 * Create an initial commit in a test repo.
 *
 * @param repoPath - Path to the repo
 * @param message - Commit message (default: "Initial commit")
 */
export async function createInitialCommit(
	repoPath: string,
	message = "Initial commit",
): Promise<void> {
	await Bun.write(path.join(repoPath, "README.md"), "# Test Repo");

	const addProc = spawnGit(["add", "."], { cwd: repoPath });
	await addProc.exited;

	const commitProc = spawnGit(["commit", "-m", message], { cwd: repoPath });
	await commitProc.exited;
}

/**
 * Create a worktree in a test repo with isolated environment.
 *
 * @param repoPath - Path to the main repo
 * @param worktreePath - Path where the worktree should be created
 * @param branchName - Name of the branch to create
 */
export async function createTestWorktree(
	repoPath: string,
	worktreePath: string,
	branchName: string,
): Promise<void> {
	const proc = spawnGit(["worktree", "add", "-b", branchName, worktreePath], {
		cwd: repoPath,
	});
	await proc.exited;
}

/**
 * Remove a worktree from a test repo with isolated environment.
 *
 * @param repoPath - Path to the main repo (not the worktree)
 * @param worktreePath - Path to the worktree to remove
 * @param force - Whether to force removal
 */
export async function removeTestWorktree(
	repoPath: string,
	worktreePath: string,
	force = false,
): Promise<void> {
	const args = force
		? ["worktree", "remove", "--force", worktreePath]
		: ["worktree", "remove", worktreePath];
	const proc = spawnGit(args, { cwd: repoPath });
	await proc.exited;
}

/**
 * Get the main rp1 development repository root.
 * Used for contamination verification.
 */
function getMainRepoRoot(): string {
	// Navigate from cli/src/__tests__/helpers/ up to repo root
	const currentDir = import.meta.dir;
	return path.resolve(currentDir, "..", "..", "..", "..");
}

/**
 * Snapshot of main repo state for contamination detection.
 */
interface RepoStateSnapshot {
	configContent: string;
	branchList: string[];
	bareValue: string | null;
	userEmail: string | null;
	userName: string | null;
}

/**
 * Capture the current state of the main repo for later comparison.
 * Handles both regular repos and worktrees by using git rev-parse.
 */
export async function captureMainRepoState(): Promise<RepoStateSnapshot> {
	const mainRepoRoot = getMainRepoRoot();

	// Use git rev-parse to find the actual git directory
	// This handles worktrees where .git is a file pointing to the real git dir
	const gitDirProc = spawnGit(["rev-parse", "--git-common-dir"], {
		cwd: mainRepoRoot,
	});
	await gitDirProc.exited;
	const gitCommonDir = (
		await new Response(gitDirProc.stdout as ReadableStream).text()
	).trim();

	// Resolve to absolute path
	const absoluteGitDir = path.isAbsolute(gitCommonDir)
		? gitCommonDir
		: path.resolve(mainRepoRoot, gitCommonDir);

	const configPath = path.join(absoluteGitDir, "config");

	// Read config file
	const configFile = Bun.file(configPath);
	const configContent = await configFile.text();

	// Get branch list
	const branchProc = spawnGit(["branch", "--list"], { cwd: mainRepoRoot });
	await branchProc.exited;
	const branchOutput = await new Response(
		branchProc.stdout as ReadableStream,
	).text();
	const branchList = branchOutput
		.split("\n")
		.map((b) => b.replace(/^\*?\s*/, "").trim())
		.filter(Boolean);

	// Get specific config values
	const bareProc = spawnGit(["config", "--local", "--get", "core.bare"], {
		cwd: mainRepoRoot,
	});
	const bareExitCode = await bareProc.exited;
	const bareValue =
		bareExitCode === 0
			? (await new Response(bareProc.stdout as ReadableStream).text()).trim()
			: null;

	const emailProc = spawnGit(["config", "--local", "--get", "user.email"], {
		cwd: mainRepoRoot,
	});
	const emailExitCode = await emailProc.exited;
	const userEmail =
		emailExitCode === 0
			? (await new Response(emailProc.stdout as ReadableStream).text()).trim()
			: null;

	const nameProc = spawnGit(["config", "--local", "--get", "user.name"], {
		cwd: mainRepoRoot,
	});
	const nameExitCode = await nameProc.exited;
	const userName =
		nameExitCode === 0
			? (await new Response(nameProc.stdout as ReadableStream).text()).trim()
			: null;

	return {
		configContent,
		branchList,
		bareValue,
		userEmail,
		userName,
	};
}

/**
 * Known test branch names that should never appear in the main repo.
 */
const TEST_BRANCH_PATTERNS = [
	"test-branch",
	"feature-branch",
	"existing-branch",
	"custom-feature",
	"test-feature",
	"new-feature",
	"sha-test",
	"dir-test",
	"collision",
	"multi-collision",
	"unique-paths",
	"nested",
];

/**
 * Verify that the main repo wasn't contaminated by tests.
 * Call this in afterAll() to catch contamination.
 *
 * @param beforeSnapshot - Snapshot captured before tests ran
 * @throws Error if contamination is detected
 */
export async function verifyNoMainRepoContamination(
	beforeSnapshot: RepoStateSnapshot,
): Promise<void> {
	const afterSnapshot = await captureMainRepoState();
	const errors: string[] = [];

	// Check if bare was set to true
	if (
		afterSnapshot.bareValue === "true" &&
		beforeSnapshot.bareValue !== "true"
	) {
		errors.push("CONTAMINATION: core.bare was set to true");
	}

	// Check if user.email was changed to test value
	if (
		afterSnapshot.userEmail === "test@test.com" &&
		beforeSnapshot.userEmail !== "test@test.com"
	) {
		errors.push("CONTAMINATION: user.email was set to test@test.com");
	}

	// Check if user.name was changed to test value
	if (
		afterSnapshot.userName === "Test User" &&
		beforeSnapshot.userName !== "Test User"
	) {
		errors.push("CONTAMINATION: user.name was set to Test User");
	}

	// Check for new test branches
	const newBranches = afterSnapshot.branchList.filter(
		(b) => !beforeSnapshot.branchList.includes(b),
	);
	const testBranches = newBranches.filter((branch) =>
		TEST_BRANCH_PATTERNS.some((pattern) => branch.includes(pattern)),
	);
	if (testBranches.length > 0) {
		errors.push(
			`CONTAMINATION: Test branches appeared in main repo: ${testBranches.join(", ")}`,
		);
	}

	if (errors.length > 0) {
		throw new Error(
			`Main repository was contaminated by tests!\n${errors.join("\n")}\n\n` +
				"This indicates test isolation failure. Check:\n" +
				"1. All git config commands use --local flag\n" +
				"2. All git spawns use getIsolatedGitEnv()\n" +
				"3. Test temp directories are properly isolated",
		);
	}
}
