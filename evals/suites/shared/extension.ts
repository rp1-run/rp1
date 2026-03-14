/**
 * Shared promptfoo extension hooks
 * Provides workspace isolation for parallel test execution with local git remote support
 *
 * Creates per-test isolated directories:
 * - /tmp/rp1-evals/{uuid}/workspace: Working directory with bun project
 * - /tmp/rp1-evals/{uuid}/remote.git: Bare git repo acting as local "remote"
 *
 * This allows:
 * - Parallel test execution (6+ concurrent tests)
 * - Agents to safely push/commit without affecting real repos
 * - Automatic cleanup after each test
 *
 * Vars injected: WORKSPACE_DIR, REMOTE_DIR, EVAL_BASE_DIR, GIT_HEAD_BEFORE, GIT_COUNT_BEFORE, GIT_REMOTE_HEAD_BEFORE
 */

import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
	copyFileSync,
	mkdirSync,
	readdirSync,
	rmSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Base directory for all eval workspaces
const EVAL_BASE_DIR = "/tmp/rp1-evals";

// Path to fixture project template
const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = join(__dirname, "fixtures", "bun-project");

/**
 * Generate unique workspace paths for parallel test execution
 */
function createUniquePaths(): {
	workspaceDir: string;
	remoteDir: string;
	baseDir: string;
} {
	const id = randomUUID().slice(0, 8);
	const baseDir = join(EVAL_BASE_DIR, id);
	return {
		baseDir,
		workspaceDir: join(baseDir, "workspace"),
		remoteDir: join(baseDir, "remote.git"),
	};
}

/**
 * Recursively copy directory contents
 */
function copyDirSync(src: string, dest: string): void {
	mkdirSync(dest, { recursive: true });
	const entries = readdirSync(src);
	for (const entry of entries) {
		const srcPath = join(src, entry);
		const destPath = join(dest, entry);
		const stat = statSync(srcPath);
		if (stat.isDirectory()) {
			copyDirSync(srcPath, destPath);
		} else {
			copyFileSync(srcPath, destPath);
		}
	}
}

/**
 * Create a bare git repo to act as a local remote.
 * This allows agents to push without network access.
 */
function createBareRemote(remoteDir: string): void {
	mkdirSync(remoteDir, { recursive: true });
	execSync("git init --bare", { cwd: remoteDir, stdio: "pipe" });
}

/**
 * Reset the workspace: clean everything and reinitialize git with local remote
 */
function resetWorkspace(workspaceDir: string, remoteDir: string): void {
	// Create bare remote first
	createBareRemote(remoteDir);

	// Recreate directory structure
	mkdirSync(workspaceDir, { recursive: true });

	// Copy fixture project if it exists, otherwise create minimal structure
	try {
		copyDirSync(FIXTURE_DIR, workspaceDir);

		// Ensure .rp1 work directories exist (may be gitignored in fixture)
		mkdirSync(`${workspaceDir}/.rp1/work/quick-builds`, { recursive: true });
		mkdirSync(`${workspaceDir}/.rp1/work/features`, { recursive: true });
	} catch {
		// Fallback: create minimal bun project structure
		mkdirSync(`${workspaceDir}/src`, { recursive: true });
		writeFileSync(`${workspaceDir}/README.md`, "# Test Project\n");
		writeFileSync(
			`${workspaceDir}/package.json`,
			JSON.stringify(
				{
					name: "rp1-eval-project",
					version: "1.0.0",
					type: "module",
					scripts: {
						dev: "bun run src/index.ts",
						test: "bun test",
						lint: "echo 'No linter configured'",
						format: "echo 'No formatter configured'",
					},
					devDependencies: {
						"@types/bun": "latest",
					},
				},
				null,
				2,
			),
		);
		writeFileSync(
			`${workspaceDir}/src/index.ts`,
			'// Entry point\nconsole.log("Hello from rp1-eval-project");\n',
		);
		writeFileSync(
			`${workspaceDir}/tsconfig.json`,
			JSON.stringify(
				{
					compilerOptions: {
						target: "ES2022",
						module: "ESNext",
						moduleResolution: "bundler",
						strict: true,
						skipLibCheck: true,
						types: ["bun-types"],
					},
					include: ["src/**/*"],
				},
				null,
				2,
			),
		);
	}

	// Initialize git repo with main as default branch
	execSync("git init -b main", { cwd: workspaceDir, stdio: "pipe" });
	execSync('git config user.email "test@rp1-eval.local"', {
		cwd: workspaceDir,
		stdio: "pipe",
	});
	execSync('git config user.name "rp1-eval"', {
		cwd: workspaceDir,
		stdio: "pipe",
	});
	execSync("git config commit.gpgsign false", {
		cwd: workspaceDir,
		stdio: "pipe",
	});

	// Set up local remote - this allows agents to push safely
	execSync(`git remote add origin ${remoteDir}`, {
		cwd: workspaceDir,
		stdio: "pipe",
	});

	// Initial commit
	execSync("git add .", { cwd: workspaceDir, stdio: "pipe" });
	execSync('git commit -m "Initial commit"', {
		cwd: workspaceDir,
		stdio: "pipe",
	});

	// Push to local remote to establish tracking
	execSync("git push -u origin main", {
		cwd: workspaceDir,
		stdio: "pipe",
	});
}

/**
 * Get commit count in workspace
 */
function getCommitCount(workspaceDir: string): number {
	try {
		const result = execSync("git rev-list --count HEAD", {
			cwd: workspaceDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		});
		return parseInt(result.trim(), 10);
	} catch {
		return 0;
	}
}

/**
 * Get HEAD in workspace
 */
function getHead(workspaceDir: string): string {
	try {
		return execSync("git rev-parse HEAD", {
			cwd: workspaceDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

/**
 * Get remote HEAD for comparison
 */
function getRemoteHead(remoteDir: string): string {
	try {
		return execSync("git rev-parse refs/heads/main", {
			cwd: remoteDir,
			encoding: "utf-8",
			stdio: ["pipe", "pipe", "pipe"],
		}).trim();
	} catch {
		return "";
	}
}

/**
 * Cleanup a test's workspace directory
 */
function cleanupWorkspace(baseDir: string): void {
	try {
		rmSync(baseDir, { recursive: true, force: true });
	} catch {
		// Ignore cleanup errors
	}
}

interface TestContext {
	test: {
		vars: Record<string, string>;
		description?: string;
	};
	result?: {
		success: boolean;
	};
}

export async function extensionHook(
	hookName: string,
	context: TestContext,
): Promise<TestContext | undefined> {
	if (hookName === "beforeEach") {
		// Create unique paths for this test (enables parallel execution)
		const { baseDir, workspaceDir, remoteDir } = createUniquePaths();

		console.log(
			`[rp1-eval] Creating workspace for "${context.test.description}" at ${workspaceDir}`,
		);
		resetWorkspace(workspaceDir, remoteDir);

		// Record initial git state (should be 1 commit after reset)
		const head = getHead(workspaceDir);
		const count = getCommitCount(workspaceDir);
		const remoteHead = getRemoteHead(remoteDir);

		// Isolate eval DB writes from production ~/.rp1/status.db
		// Single shared DB for all eval runs (no per-test DB needed)
		process.env.RP1_STATUS_DB = join(EVAL_BASE_DIR, "status.db");

		// Signal eval mode to prevent project registry pollution
		process.env.RP1_EVAL_MODE = "true";

		// Inject paths into vars - provider will use WORKSPACE_DIR
		context.test.vars.EVAL_BASE_DIR = baseDir;
		context.test.vars.WORKSPACE_DIR = workspaceDir;
		context.test.vars.REMOTE_DIR = remoteDir;
		context.test.vars.GIT_HEAD_BEFORE = head;
		context.test.vars.GIT_COUNT_BEFORE = String(count);
		context.test.vars.GIT_REMOTE_HEAD_BEFORE = remoteHead;

		console.log(
			`[rp1-eval] Workspace ready: HEAD=${head.slice(0, 7)}, commits=${count}, remote=${remoteHead.slice(0, 7)}`,
		);
		return context;
	}

	if (hookName === "afterEach") {
		const workspaceDir = context.test.vars.WORKSPACE_DIR;
		const remoteDir = context.test.vars.REMOTE_DIR;
		const baseDir = context.test.vars.EVAL_BASE_DIR;

		// Log final state for debugging
		const headAfter = getHead(workspaceDir);
		const countAfter = getCommitCount(workspaceDir);
		const countBefore = parseInt(context.test.vars.GIT_COUNT_BEFORE || "0", 10);
		const remoteHeadAfter = getRemoteHead(remoteDir);
		const remoteHeadBefore = context.test.vars.GIT_REMOTE_HEAD_BEFORE || "";

		const remotePushed = remoteHeadAfter !== remoteHeadBefore;

		console.log(
			`[rp1-eval] After "${context.test.description}": HEAD=${headAfter.slice(0, 7)}, commits=${countAfter}, new=${countAfter - countBefore}, pushed=${remotePushed}`,
		);

		// Preserve workspace on failure for debugging (opt-in via env var)
		const preserveOnFail = process.env.PRESERVE_EVAL_WORKSPACES === "true";
		if (preserveOnFail && context.result && !context.result.success) {
			console.log(
				`[rp1-eval] PRESERVING failed workspace for debugging: ${baseDir}`,
			);
			return;
		}

		// Cleanup the workspace
		if (baseDir) {
			console.log(`[rp1-eval] Cleaning up ${baseDir}`);
			cleanupWorkspace(baseDir);
		}
	}
}
