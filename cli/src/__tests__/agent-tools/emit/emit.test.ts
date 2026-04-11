/**
 * End-to-end tests for the emit tool execution pipeline.
 * Tests the full flow from executeEmit through DB writes and response shaping.
 *
 * These tests initialize the database singleton with a known test path,
 * then exercise executeEmit which reuses the cached singleton.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getArtifactByDocId,
	getEmitDatabase,
	getRunById,
	insertRun,
	resetInstance,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeEmit } from "../../../agent-tools/emit/index.js";
import type { EmitInput } from "../../../agent-tools/emit/models.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	writeFixture,
} from "../../helpers/index.js";

describe("emit end-to-end", () => {
	let tempDir: string;
	let dbPath: string;
	let testCounter = 0;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("emit-e2e");
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(join(tempDir, ".rp1", "project_id"), "test-emit-e2e-uuid");
		testCounter++;
		dbPath = join(tempDir, `test-${testCounter}.db`);
		// Initialize the singleton with our test DB path.
		// All subsequent getEmitDatabase() calls (without args) in executeEmit
		// will reuse this cached instance.
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	const makeInput = (
		overrides: Partial<EmitInput> & { type: EmitInput["type"] },
	): EmitInput => ({
		runId: `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
		projectPath: tempDir,
		data: {},
		...overrides,
	});

	describe("status_change events", () => {
		test("writes event to DB and returns event ID", async () => {
			const input = makeInput({
				type: "status_change",
				step: "requirements",
				data: { status: "running", workflow: "build", feature: "test-feat" },
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.eventId).toBeGreaterThan(0);
			expect(result.data.runId).toBe(input.runId);
			expect(result.data.type).toBe("status_change");
			expect(result.data.runStatus).toBeDefined();
		});

		test("auto-creates run when run_id does not exist", async () => {
			const input = makeInput({
				type: "status_change",
				step: "design",
				data: { status: "running", workflow: "build", feature: "new-feat" },
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.runId).toBe(input.runId);

			// Verify run was created in DB (singleton still active)
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const row = db
				.prepare("SELECT * FROM runs WHERE id = $id")
				.get({ $id: input.runId }) as { id: string; flow: string } | null;

			expect(row).not.toBeNull();
			expect(row?.id).toBe(input.runId);
			expect(row?.flow).toBe("build");
		});

		test("response includes derived run status", async () => {
			const runId = `run-status-${Date.now()}`;

			const input = makeInput({
				type: "status_change",
				runId,
				step: "build",
				data: { status: "running", workflow: "build", feature: "feat" },
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.data.runStatus).toBe("running");
		});

		test("persists resolved directory metadata on the run", async () => {
			const projectRoot = join(tempDir, "project-root");
			await writeFixture(
				projectRoot,
				".rp1/project_id",
				"test-persist-dirs-uuid",
			);

			const runId = `run-dirs-${Date.now()}`;
			const input = makeInput({
				type: "status_change",
				runId,
				step: "build",
				projectPath: projectRoot,
				data: { status: "running", workflow: "build", feature: "feat" },
			});

			await expectTaskRight(executeEmit(input));

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const run = getRunById(db, runId);
			expect(run?.rp1ProjectRoot).toBe(projectRoot);
			expect(run?.rp1KbRoot).toBe(join(projectRoot, ".rp1", "context"));
			expect(run?.rp1WorkRoot).toBe(join(projectRoot, ".rp1", "work"));
		});

		test("prefers input.workflow over payload workflow when creating a run", async () => {
			const runId = `run-workflow-precedence-${Date.now()}`;
			const input = makeInput({
				type: "btw_update",
				runId,
				workflow: "build-fast",
				data: {
					message: "workflow precedence",
					workflow: "build",
					feature: "feat",
				},
			});

			await expectTaskRight(executeEmit(input));

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const run = getRunById(db, runId);

			expect(run?.flow).toBe("build-fast");
		});
	});

	describe("artifact_registered events", () => {
		test("generates doc_id for markdown and returns it", async () => {
			const mdPath = await writeFixture(
				tempDir,
				"artifact-test.md",
				"# Test Artifact\n\nContent here.",
			);

			const input = makeInput({
				type: "artifact_registered",
				step: "design",
				data: {
					path: mdPath,
					feature: "test-feat",
					storageRoot: "absolute",
					type: "markdown",
					workflow: "build",
				},
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.type).toBe("artifact_registered");
			expect(result.data.docId).toBeDefined();
			expect(result.data.docId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
			);
		});

		test("stores work-dir-relative artifact paths when the file is under rp1_work_root", async () => {
			const projectRoot = join(tempDir, "project-artifacts");
			await writeFixture(
				projectRoot,
				".rp1/project_id",
				"test-work-dir-artifacts-uuid",
			);

			const workDir = join(projectRoot, ".rp1", "work");
			await writeFixture(
				workDir,
				"features/test-feat/design.md",
				"---\nrp1_doc_id: doc-storage\n---\n# Test Artifact\n",
			);

			const input = makeInput({
				type: "artifact_registered",
				step: "design",
				projectPath: projectRoot,
				data: {
					path: "features/test-feat/design.md",
					feature: "test-feat",
					storageRoot: "work_dir",
					type: "markdown",
					workflow: "build",
				},
			});

			const result = await expectTaskRight(executeEmit(input));
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const artifact = getArtifactByDocId(db, result.data.docId ?? "");

			expect(artifact?.storageRoot).toBe("work_dir");
			expect(artifact?.path).toBe("features/test-feat/design.md");
		});

		test("uses frontmatter doc_id for relative work-dir artifacts when storageRoot is explicit", async () => {
			const projectRoot = join(tempDir, "project-relative-doc-id");
			await writeFixture(
				projectRoot,
				".rp1/project_id",
				"test-frontmatter-docid-uuid",
			);

			const workDir = join(projectRoot, ".rp1", "work");
			await writeFixture(
				workDir,
				"features/test-feat/design.md",
				"---\nrp1_doc_id: doc-relative-frontmatter\n---\n# Test Artifact\n",
			);

			const result = await expectTaskRight(
				executeEmit(
					makeInput({
						type: "artifact_registered",
						step: "design",
						projectPath: projectRoot,
						data: {
							path: "features/test-feat/design.md",
							feature: "test-feat",
							storageRoot: "work_dir",
							type: "markdown",
							workflow: "build",
						},
					}),
				),
			);

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const artifact = getArtifactByDocId(db, "doc-relative-frontmatter");

			expect(result.data.docId).toBe("doc-relative-frontmatter");
			expect(artifact?.storageRoot).toBe("work_dir");
			expect(artifact?.path).toBe("features/test-feat/design.md");
		});

		test("rejects project-root artifacts that escape the canonical project root", async () => {
			const projectRoot = join(tempDir, "project-escape-project");
			await writeFixture(projectRoot, ".rp1/project_id", "test-project-escape");

			const error = await expectTaskLeft(
				executeEmit(
					makeInput({
						type: "artifact_registered",
						step: "design",
						projectPath: projectRoot,
						data: {
							path: "../outside.md",
							feature: "test-feat",
							storageRoot: "project",
							type: "markdown",
							workflow: "build",
						},
					}),
				),
			);

			expect(getErrorMessage(error)).toContain(
				"escapes the canonical project root",
			);
		});

		test("rejects work-dir artifacts that escape the canonical work root", async () => {
			const projectRoot = join(tempDir, "project-escape-work");
			await writeFixture(projectRoot, ".rp1/project_id", "test-work-escape");

			const error = await expectTaskLeft(
				executeEmit(
					makeInput({
						type: "artifact_registered",
						step: "design",
						projectPath: projectRoot,
						data: {
							path: "../outside.md",
							feature: "test-feat",
							storageRoot: "work_dir",
							type: "markdown",
							workflow: "build",
						},
					}),
				),
			);

			expect(getErrorMessage(error)).toContain(
				"escapes the canonical work_dir root",
			);
		});
	});

	describe("subflow_registered events", () => {
		test("records parent_step_id in event", async () => {
			const input = makeInput({
				type: "subflow_registered",
				step: "build",
				data: {
					parentStepId: "build",
					subflowName: "task-builder",
					steps: ["T1", "T2"],
					workflow: "build",
					feature: "feat",
				},
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.type).toBe("subflow_registered");

			// Verify parent_step_id was stored (singleton still active)
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const event = db
				.prepare("SELECT parent_step_id FROM events WHERE id = $id")
				.get({ $id: result.data.eventId }) as {
				parent_step_id: string | null;
			};

			expect(event).not.toBeNull();
			expect(event.parent_step_id).toBe("build");
		});
	});

	describe("harness column", () => {
		test("stores harness value from emit data payload", async () => {
			const runId = `run-harness-${Date.now()}`;
			const input = makeInput({
				type: "status_change",
				runId,
				step: "design",
				data: {
					status: "running",
					workflow: "build",
					feature: "feat",
					harness: "codex",
				},
			});

			await expectTaskRight(executeEmit(input));

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const row = db
				.prepare("SELECT harness FROM runs WHERE id = $id")
				.get({ $id: runId }) as { harness: string | null } | null;

			expect(row).not.toBeNull();
			expect(row?.harness).toBe("codex");
		});

		test("existing runs without harness remain valid", async () => {
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const runId = `run-no-harness-${Date.now()}`;
			insertRun(db, {
				id: runId,
				flow: "build",
				featureId: "feat",
				projectPath: tempDir,
			});

			const row = db
				.prepare("SELECT harness FROM runs WHERE id = $id")
				.get({ $id: runId }) as { harness: string | null } | null;

			expect(row).not.toBeNull();
			expect(row?.harness).toBeNull();
		});

		test("stores harness from explicit input.harness field over data payload", async () => {
			const runId = `run-harness-flag-${Date.now()}`;
			const input = makeInput({
				type: "status_change",
				runId,
				step: "design",
				harness: "opencode",
				data: {
					status: "running",
					workflow: "build",
					feature: "feat",
					harness: "codex",
				},
			});

			await expectTaskRight(executeEmit(input));

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const row = db
				.prepare("SELECT harness FROM runs WHERE id = $id")
				.get({ $id: runId }) as { harness: string | null } | null;

			expect(row).not.toBeNull();
			expect(row?.harness).toBe("opencode");
		});

		test("falls back to RP1_HARNESS env var when no explicit harness", async () => {
			const runId = `run-harness-env-${Date.now()}`;
			const originalEnv = process.env.RP1_HARNESS;
			process.env.RP1_HARNESS = "claude-code";
			try {
				const input = makeInput({
					type: "status_change",
					runId,
					step: "design",
					data: {
						status: "running",
						workflow: "build",
						feature: "feat",
					},
				});

				await expectTaskRight(executeEmit(input));

				const db = await expectTaskRight(getEmitDatabase(dbPath));
				const row = db
					.prepare("SELECT harness FROM runs WHERE id = $id")
					.get({ $id: runId }) as { harness: string | null } | null;

				expect(row).not.toBeNull();
				expect(row?.harness).toBe("claude-code");
			} finally {
				if (originalEnv === undefined) {
					delete process.env.RP1_HARNESS;
				} else {
					process.env.RP1_HARNESS = originalEnv;
				}
			}
		});

		test("backfills harness on subsequent emit for existing run with NULL harness", async () => {
			const runId = `run-backfill-${Date.now()}`;

			const firstInput = makeInput({
				type: "status_change",
				runId,
				step: "design",
				data: {
					status: "running",
					workflow: "build",
					feature: "feat",
				},
			});
			await expectTaskRight(executeEmit(firstInput));

			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const beforeRow = db
				.prepare("SELECT harness FROM runs WHERE id = $id")
				.get({ $id: runId }) as { harness: string | null } | null;
			expect(beforeRow?.harness).toBeNull();

			const secondInput = makeInput({
				type: "status_change",
				runId,
				step: "build",
				data: {
					status: "running",
					workflow: "build",
					feature: "feat",
					harness: "claude-code",
				},
			});
			await expectTaskRight(executeEmit(secondInput));

			const afterRow = db
				.prepare("SELECT harness FROM runs WHERE id = $id")
				.get({ $id: runId }) as { harness: string | null } | null;
			expect(afterRow?.harness).toBe("claude-code");
		});
	});

	describe("annotation_updated events", () => {
		test("upserts annotation linked to artifact doc_id", async () => {
			// Pre-create a run and artifact so the annotation FK is valid.
			// The singleton DB is already initialized in beforeEach.
			const db = await expectTaskRight(getEmitDatabase(dbPath));
			const runId = `run-ann-${Date.now()}`;
			insertRun(db, {
				id: runId,
				flow: "build",
				featureId: "feat",
				projectPath: tempDir,
			});
			upsertArtifact(db, {
				docId: "doc-for-annotation",
				runId,
				path: "file.md",
				type: "markdown",
				storageRoot: "work_dir",
				projectPath: tempDir,
				feature: "feat",
			});

			const input: EmitInput = {
				type: "annotation_updated",
				runId,
				step: "verify",
				data: {
					docId: "doc-for-annotation",
					content: "Looks good",
					workflow: "build",
					feature: "feat",
				},
				projectPath: tempDir,
			};

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.type).toBe("annotation_updated");

			// Verify annotation was created (same singleton)
			const annotation = db
				.prepare(
					"SELECT * FROM annotations WHERE doc_id = 'doc-for-annotation'",
				)
				.get() as { content: string; doc_id: string } | null;

			expect(annotation).not.toBeNull();
			expect(annotation?.content).toBe("Looks good");
		});
	});
});
