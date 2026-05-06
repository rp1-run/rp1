import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
	closeDatabase,
	getEmitDatabase,
	getRunById,
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import { execute } from "../../../agent-tools/workflow-bootstrap/index.js";
import {
	createInitialCommit,
	createTestWorktree,
	initTestRepo,
} from "../../helpers/git-helpers.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

const repoRoot = join(
	dirname(fileURLToPath(import.meta.url)),
	"..",
	"..",
	"..",
	"..",
	"..",
);
const hasDevDist = existsSync(
	join(repoRoot, "dist", "claude-code", "bundle-manifest.json"),
);
const testIfDist = hasDevDist ? test : test.skip;
const localBinaryPath = join(repoRoot, "bin", "rp1");
const hasRunnableLocalBinary = (() => {
	if (!existsSync(localBinaryPath)) {
		return false;
	}

	const probe = spawnSync(localBinaryPath, ["--version"], {
		encoding: "utf-8",
	});
	return probe.error === undefined && typeof probe.status === "number";
})();
const testIfBinary = hasRunnableLocalBinary ? test : test.skip;

describe("workflow-bootstrap", () => {
	let tempDir: string;
	let dbPath: string;
	let originalDbEnv: string | undefined;

	const writeProjectId = async (
		projectRoot = tempDir,
		projectId = "test-project-id",
	): Promise<void> => {
		await mkdir(join(projectRoot, ".rp1"), { recursive: true });
		await writeFile(join(projectRoot, ".rp1", "project_id"), projectId);
	};

	const writeWorkflowSkill = async (options?: {
		readonly rootDir?: string;
		readonly name?: string;
		readonly tracked?: boolean;
		readonly runPolicy?: "fresh" | "resumable";
	}): Promise<string> => {
		const rootDir = options?.rootDir ?? tempDir;
		const name = options?.name ?? "build";
		const skillPath = join(
			rootDir,
			"plugins",
			"dev",
			"skills",
			"build",
			"SKILL.md",
		);
		await mkdir(join(skillPath, ".."), { recursive: true });
		const tracked = options?.tracked ?? true;
		const runPolicy = options?.runPolicy ?? "resumable";
		const identityArgs =
			tracked && runPolicy === "resumable"
				? `
    identity_args:
      - FEATURE_ID`
				: "";

		await writeFile(
			skillPath,
			tracked
				? `---
name: ${name}
description: "Bootstrap test workflow for deterministic tracked runs"
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: ${runPolicy}${identityArgs}
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
    - name: AFK
      type: boolean
      required: false
      default: false
      description: "Non-interactive mode"
---
# Build
`
				: `---
name: ${name}
description: "Bootstrap test workflow for deterministic tracked runs"
metadata:
  category: development
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Build
`,
		);

		return skillPath;
	};

	beforeEach(async () => {
		tempDir = await createTempDir("workflow-bootstrap");
		dbPath = join(tempDir, "rp1-test.db");
		originalDbEnv = process.env.RP1_DB;
		process.env.RP1_DB = dbPath;
		closeDatabase();
		resetInstance();
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		if (originalDbEnv === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDbEnv;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns canonical workflow bootstrap context and resumes matching resumable runs", async () => {
		await writeProjectId(tempDir, "project-bootstrap-id");
		await writeWorkflowSkill();

		const first = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-bootstrap --afk",
					project_root: tempDir,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(first.data.arguments).toEqual({
			FEATURE_ID: "feat-bootstrap",
			AFK: true,
		});
		expect(first.data.directories.projectRoot).toBe(tempDir);
		expect(first.data.workflow.runPolicy).toBe("resumable");
		expect(first.data.workflow.identityArgs).toEqual(["FEATURE_ID"]);
		expect(first.data.run.resumed).toBe(false);
		expect(first.data.run.decision).toBe("created_new_run");
		expect(first.data.trace.projectIdentity).toBe("project-bootstrap-id");
		expect(first.data.trace.workIdentity).toBe("FEATURE_ID=feat-bootstrap");
		expect(first.data.trace.harness).toBe("codex");

		const second = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-bootstrap --afk",
					project_root: tempDir,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(second.data.run.runId).toBe(first.data.run.runId);
		expect(second.data.run.resumed).toBe(true);
		expect(second.data.run.decision).toBe("matched_non_terminal_run");

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const run = getRunById(db, first.data.run.runId);
		expect(run?.runPolicy).toBe("resumable");
		expect(run?.workIdentity).toBe("FEATURE_ID=feat-bootstrap");
		expect(run?.bootstrapContext).toContain("matched_non_terminal_run");

		const bootstrapContext = JSON.parse(run?.bootstrapContext ?? "{}") as {
			directories?: {
				projectRoot?: string;
				kbRoot?: string;
				workRoot?: string;
				codeRoot?: string;
			};
		};

		expect(bootstrapContext.directories).toEqual({
			projectRoot: tempDir,
			kbRoot: join(tempDir, ".rp1", "context"),
			workRoot: join(tempDir, ".rp1", "work"),
			codeRoot: tempDir,
		});
	});

	test("resolves workflow metadata from the invoking linked worktree schema", async () => {
		const mainRepoRoot = join(tempDir, "worktree-main");
		const linkedWorktreePath = join(tempDir, "linked-worktree");
		const nestedWorktreePath = join(linkedWorktreePath, "nested", "dir");

		await writeProjectId(mainRepoRoot, "project-worktree-id");
		await initTestRepo(mainRepoRoot);
		await writeWorkflowSkill({
			rootDir: mainRepoRoot,
			name: "build-main",
			runPolicy: "fresh",
		});
		await createInitialCommit(mainRepoRoot);
		await createTestWorktree(mainRepoRoot, linkedWorktreePath, "test-branch");
		await writeWorkflowSkill({
			rootDir: linkedWorktreePath,
			name: "build",
			runPolicy: "resumable",
		});
		await mkdir(nestedWorktreePath, { recursive: true });
		const canonicalMainRepoRoot = await realpath(mainRepoRoot).catch(
			() => mainRepoRoot,
		);
		const canonicalLinkedWorktreePath = await realpath(
			linkedWorktreePath,
		).catch(() => linkedWorktreePath);

		const result = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-worktree-bootstrap",
					project_root: nestedWorktreePath,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(result.data.workflow.runPolicy).toBe("resumable");
		expect(result.data.workflow.identityArgs).toEqual(["FEATURE_ID"]);
		expect(result.data.directories.projectRoot).toBe(canonicalMainRepoRoot);
		expect(result.data.directories.kbRoot).toBe(
			join(canonicalMainRepoRoot, ".rp1", "context"),
		);
		expect(result.data.directories.workRoot).toBe(
			join(canonicalMainRepoRoot, ".rp1", "work"),
		);
		expect(result.data.trace.requestedProjectRoot).toBe(nestedWorktreePath);
		expect(result.data.trace.canonicalProjectRoot).toBe(canonicalMainRepoRoot);
		expect(result.data.trace.isWorktree).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const run = getRunById(db, result.data.run.runId);
		const bootstrapContext = JSON.parse(run?.bootstrapContext ?? "{}") as {
			directories?: {
				projectRoot?: string;
				kbRoot?: string;
				workRoot?: string;
				codeRoot?: string;
			};
		};

		expect(bootstrapContext.directories).toEqual({
			projectRoot: canonicalMainRepoRoot,
			kbRoot: join(canonicalMainRepoRoot, ".rp1", "context"),
			workRoot: join(canonicalMainRepoRoot, ".rp1", "work"),
			codeRoot: canonicalLinkedWorktreePath,
		});
	});

	test("reuses the same resumable build run from the main repo and a linked worktree", async () => {
		const mainRepoRoot = join(tempDir, "shared-worktree-main");
		const linkedWorktreePath = join(tempDir, "shared-linked-worktree");
		const nestedWorktreePath = join(linkedWorktreePath, "nested", "dir");

		await writeProjectId(mainRepoRoot, "project-shared-worktree-id");
		await initTestRepo(mainRepoRoot);
		await writeWorkflowSkill({ rootDir: mainRepoRoot, name: "build" });
		await createInitialCommit(mainRepoRoot);
		await createTestWorktree(
			mainRepoRoot,
			linkedWorktreePath,
			"feature/shared-worktree",
		);
		await mkdir(nestedWorktreePath, { recursive: true });
		const canonicalMainRepoRoot = await realpath(mainRepoRoot).catch(
			() => mainRepoRoot,
		);

		const mainRepoRun = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-shared-worktree",
					project_root: mainRepoRoot,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		const linkedWorktreeRun = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-shared-worktree",
					project_root: nestedWorktreePath,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		const normalizedMainRunProjectRoot = await realpath(
			mainRepoRun.data.directories.projectRoot,
		).catch(() => mainRepoRun.data.directories.projectRoot);
		const normalizedLinkedRunProjectRoot = await realpath(
			linkedWorktreeRun.data.directories.projectRoot,
		).catch(() => linkedWorktreeRun.data.directories.projectRoot);

		expect(mainRepoRun.data.run.resumed).toBe(false);
		expect(mainRepoRun.data.run.decision).toBe("created_new_run");
		expect(normalizedMainRunProjectRoot).toBe(canonicalMainRepoRoot);
		expect(mainRepoRun.data.trace.requestedProjectRoot).toBe(mainRepoRoot);

		expect(linkedWorktreeRun.data.run.runId).toBe(mainRepoRun.data.run.runId);
		expect(linkedWorktreeRun.data.run.resumed).toBe(true);
		expect(linkedWorktreeRun.data.run.decision).toBe(
			"matched_non_terminal_run",
		);
		expect(normalizedLinkedRunProjectRoot).toBe(canonicalMainRepoRoot);
		expect(linkedWorktreeRun.data.trace.requestedProjectRoot).toBe(
			nestedWorktreePath,
		);
		expect(linkedWorktreeRun.data.trace.canonicalProjectRoot).toBe(
			canonicalMainRepoRoot,
		);
		expect(linkedWorktreeRun.data.trace.isWorktree).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const run = getRunById(db, mainRepoRun.data.run.runId);
		expect(run?.projectId).toBe("project-shared-worktree-id");
		expect(run?.workIdentity).toBe("FEATURE_ID=feat-shared-worktree");
	});

	test("fails fast when required arguments remain unresolved", async () => {
		await writeProjectId();
		await writeWorkflowSkill();

		const error = await expectTaskLeft(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "",
					project_root: tempDir,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(getErrorMessage(error)).toContain("Unresolved required arguments");
	});

	test("fails fast for uninitialized project roots", async () => {
		await writeWorkflowSkill();

		const error = await expectTaskLeft(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-uninitialized",
					project_root: tempDir,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(getErrorMessage(error)).toContain(
			"Cannot bootstrap from uninitialized rp1 project",
		);
	});

	test("fails fast when the schema is not a tracked workflow", async () => {
		await writeProjectId();
		await writeWorkflowSkill({ tracked: false });

		const error = await expectTaskLeft(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-missing-metadata",
					project_root: tempDir,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(getErrorMessage(error)).toContain("is not a tracked workflow");
	});

	test("fails fast when generated workflow target inputs do not match", async () => {
		await writeProjectId();
		await writeWorkflowSkill({ name: "build" });

		const error = await expectTaskLeft(
			execute(
				JSON.stringify({
					name: "build-fast",
					schema_path: "plugins/dev/skills/build/SKILL.md",
					raw_args: "feat-mismatch",
					project_root: tempDir,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(getErrorMessage(error)).toContain("Workflow target mismatch");
	});

	test("normalizes installed skill names to the canonical workflow id", async () => {
		await writeProjectId();
		const installedSkillPath = join(
			tempDir,
			"installed",
			"rp1-build",
			"SKILL.md",
		);
		await mkdir(dirname(installedSkillPath), { recursive: true });
		await writeFile(
			installedSkillPath,
			`---
name: rp1-build
description: "Bootstrap test workflow for deterministic tracked runs"
metadata:
  category: development
  is_workflow: true
  workflow:
    run_policy: resumable
    identity_args:
      - FEATURE_ID
  arguments:
    - name: FEATURE_ID
      type: string
      required: true
      description: "Feature identifier"
---
# Build
`,
		);

		const canonicalResult = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "build",
					schema_path: installedSkillPath,
					raw_args: "feat-installed-schema",
					project_root: tempDir,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		const stalePromptResult = await expectTaskRight(
			execute(
				JSON.stringify({
					name: "rp1-build",
					schema_path: installedSkillPath,
					raw_args: "feat-installed-schema",
					project_root: tempDir,
					harness: "codex",
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(canonicalResult.data.workflow.name).toBe("build");
		expect(stalePromptResult.data.workflow.name).toBe("build");
		expect(stalePromptResult.data.run.runId).toBe(
			canonicalResult.data.run.runId,
		);
		expect(stalePromptResult.data.run.resumed).toBe(true);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const run = getRunById(db, canonicalResult.data.run.runId);
		expect(run?.flow).toBe("build");
		expect(run?.workIdentity).toBe("FEATURE_ID=feat-installed-schema");
	});

	testIfDist(
		"resolves installed workflow schemas when the project checkout lacks the source prompt tree",
		async () => {
			await writeProjectId(tempDir, "project-installed-bootstrap-id");

			const result = await expectTaskRight(
				execute(
					JSON.stringify({
						name: "speedrun",
						schema_path: "plugins/dev/skills/speedrun/SKILL.md",
						raw_args: "add a simple hello world script at src/hello.ts",
						project_root: tempDir,
						harness: "claude-code",
					}),
					{ inputSource: "stdin" },
				),
			);

			expect(result.data.workflow.name).toBe("speedrun");
			expect(result.data.workflow.runPolicy).toBe("fresh");
			expect(result.data.arguments.REQUEST).toBe(
				"add a simple hello world script at src/hello.ts",
			);
			expect(result.data.directories.projectRoot).toBe(tempDir);
			expect(result.data.trace.harness).toBe("claude-code");
		},
	);

	testIfBinary(
		"bootstraps installed workflow schemas through the built binary",
		async () => {
			await writeProjectId(tempDir, "project-binary-bootstrap-id");

			const input = JSON.stringify({
				name: "speedrun",
				schema_path: "plugins/dev/skills/speedrun/SKILL.md",
				raw_args: "add a simple hello world script at src/hello.ts",
				project_root: tempDir,
				harness: "claude-code",
			});

			const proc = spawnSync(
				localBinaryPath,
				["agent-tools", "workflow-bootstrap"],
				{
					cwd: repoRoot,
					input,
					encoding: "utf-8",
					env: {
						...process.env,
						RP1_DB: dbPath,
					},
				},
			);

			const stdout = proc.stdout;
			const stderr = proc.stderr;

			expect(proc.status).toBe(0);
			expect(stderr).toBe("");

			const parsed = JSON.parse(stdout) as {
				success: boolean;
				data: {
					workflow: { name: string; runPolicy: string };
					arguments: { REQUEST: string };
					directories: { projectRoot: string };
				};
			};

			expect(parsed.success).toBe(true);
			expect(parsed.data.workflow.name).toBe("speedrun");
			expect(parsed.data.workflow.runPolicy).toBe("fresh");
			expect(parsed.data.arguments.REQUEST).toBe(
				"add a simple hello world script at src/hello.ts",
			);
			expect(parsed.data.directories.projectRoot).toBe(tempDir);
		},
	);
});
