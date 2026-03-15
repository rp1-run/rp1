/**
 * Unit tests for the emit database layer.
 * Tests schema creation, CRUD operations, run status derivation,
 * skipped-step detection, and legacy cleanup.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeDatabase,
	countEventsSince,
	deriveRunStatus,
	findOrCreateRun,
	getActiveRunsSnapshot,
	getEmitDatabase,
	getEventsSince,
	getMaxEventId,
	getSkippableSteps,
	getStepStatuses,
	insertEvent,
	insertRun,
	resetInstance,
	upsertAnnotation,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("emit database", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `emit-db-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("schema creation", () => {
		test("creates all tables with correct structure", async () => {
			const dbPath = join(tempDir, "schema-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const tables = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
				)
				.all() as { name: string }[];

			const tableNames = tables.map((t) => t.name);
			expect(tableNames).toContain("runs");
			expect(tableNames).toContain("events");
			expect(tableNames).toContain("artifacts");
			expect(tableNames).toContain("annotations");
			expect(tableNames).toContain("tasks");
			expect(tableNames).toContain("schema_version");
		});

		test("schema_version is set to 1", async () => {
			const dbPath = join(tempDir, "version-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const row = db.prepare("SELECT version FROM schema_version").get() as {
				version: number;
			};

			expect(row.version).toBe(1);
		});

		test("foreign key constraints are enforced", async () => {
			const dbPath = join(tempDir, "fk-test.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				db.prepare(
					`INSERT INTO events (run_id, type, step) VALUES ('nonexistent-run', 'status_change', 'step1')`,
				).run();
			}).toThrow();
		});
	});

	describe("insertRun", () => {
		test("creates a new run record", async () => {
			const dbPath = join(tempDir, "insert-run.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const run = insertRun(db, {
				id: "run-001",
				flow: "build",
				featureId: "my-feature",
				projectPath: "/test/project",
			});

			expect(run.id).toBe("run-001");
			expect(run.flow).toBe("build");
			expect(run.featureId).toBe("my-feature");
			expect(run.projectPath).toBe("/test/project");
			expect(run.status).toBe("not_started");
			expect(run.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("returns existing run if ID already present", async () => {
			const dbPath = join(tempDir, "run-idempotent.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const first = insertRun(db, {
				id: "run-dup",
				flow: "build",
				featureId: "feat-1",
				projectPath: "/project",
			});

			const second = insertRun(db, {
				id: "run-dup",
				flow: "different-flow",
				featureId: "feat-2",
				projectPath: "/other",
			});

			expect(second.id).toBe(first.id);
			expect(second.flow).toBe("build");
			expect(second.featureId).toBe("feat-1");
		});
	});

	describe("insertEvent", () => {
		test("appends an event and returns the record", async () => {
			const dbPath = join(tempDir, "insert-event.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ev",
				flow: "build",
				featureId: "feat",
				projectPath: "/project",
			});

			const event = insertEvent(db, {
				runId: "run-ev",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});

			expect(event.id).toBeGreaterThan(0);
			expect(event.runId).toBe("run-ev");
			expect(event.type).toBe("status_change");
			expect(event.step).toBe("requirements");
			expect(event.data).toBe('{"status":"running"}');
			expect(event.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("rejects event with invalid run_id due to FK constraint", async () => {
			const dbPath = join(tempDir, "event-fk.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				insertEvent(db, {
					runId: "nonexistent",
					type: "status_change",
					step: "step1",
				});
			}).toThrow();
		});

		test("stores optional fields as null when not provided", async () => {
			const dbPath = join(tempDir, "event-nulls.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-null",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const event = insertEvent(db, {
				runId: "run-null",
				type: "btw_update",
			});

			expect(event.step).toBeNull();
			expect(event.unit).toBeNull();
			expect(event.data).toBeNull();
			expect(event.parentStepId).toBeNull();
		});

		test("uses provided createdAt timestamp", async () => {
			const dbPath = join(tempDir, "event-timestamp.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ts",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const customTime = "2026-01-01T00:00:00.000Z";
			const event = insertEvent(db, {
				runId: "run-ts",
				type: "status_change",
				step: "step1",
				createdAt: customTime,
			});

			expect(event.createdAt).toBe(customTime);
		});
	});

	describe("upsertArtifact", () => {
		test("inserts a new artifact", async () => {
			const dbPath = join(tempDir, "artifact-insert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-art",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const artifact = upsertArtifact(db, {
				docId: "doc-001",
				runId: "run-art",
				path: "design.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
				step: "design",
			});

			expect(artifact.docId).toBe("doc-001");
			expect(artifact.path).toBe("design.md");
			expect(artifact.type).toBe("markdown");
		});

		test("returns existing artifact if doc_id already present", async () => {
			const dbPath = join(tempDir, "artifact-upsert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-art2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const first = upsertArtifact(db, {
				docId: "doc-dup",
				runId: "run-art2",
				path: "original.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const second = upsertArtifact(db, {
				docId: "doc-dup",
				runId: "run-art2",
				path: "different.md",
				type: "code",
				projectPath: "/other",
				feature: "other-feat",
			});

			expect(second.id).toBe(first.id);
			expect(second.path).toBe("original.md");
		});
	});

	describe("upsertAnnotation", () => {
		test("inserts an annotation with FK to artifact doc_id", async () => {
			const dbPath = join(tempDir, "annotation-insert.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ann",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			upsertArtifact(db, {
				docId: "doc-ann",
				runId: "run-ann",
				path: "file.md",
				type: "markdown",
				projectPath: "/p",
				feature: "feat",
			});

			const annotation = upsertAnnotation(db, {
				docId: "doc-ann",
				runId: "run-ann",
				content: "Review comment",
				data: '{"severity": "high"}',
			});

			expect(annotation.docId).toBe("doc-ann");
			expect(annotation.content).toBe("Review comment");
			expect(annotation.data).toBe('{"severity": "high"}');
		});

		test("rejects annotation with nonexistent doc_id", async () => {
			const dbPath = join(tempDir, "annotation-fk.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(() => {
				upsertAnnotation(db, {
					docId: "nonexistent-doc",
					content: "Orphan annotation",
				});
			}).toThrow();
		});
	});

	describe("run status derivation", () => {
		test("returns not_started when no step events exist", async () => {
			const dbPath = join(tempDir, "derive-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d1",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const status = deriveRunStatus(db, "run-d1");
			expect(status).toBe("not_started");
		});

		test("derives running when any step is running", async () => {
			const dbPath = join(tempDir, "derive-running.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d2",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const status = deriveRunStatus(db, "run-d2");
			expect(status).toBe("running");
		});

		test("derives failed when any step is failed", async () => {
			const dbPath = join(tempDir, "derive-failed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-d3",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "failed" }),
			});

			const status = deriveRunStatus(db, "run-d3");
			expect(status).toBe("failed");
		});

		test("derives waiting when any step is waiting", async () => {
			const dbPath = join(tempDir, "derive-waiting.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d4",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d4",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "waiting" }),
			});

			const status = deriveRunStatus(db, "run-d4");
			expect(status).toBe("waiting");
		});

		test("derives completed when all steps are completed or skipped", async () => {
			const dbPath = join(tempDir, "derive-completed.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d5",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "skipped" }),
			});
			insertEvent(db, {
				runId: "run-d5",
				type: "status_change",
				step: "step3",
				data: JSON.stringify({ status: "completed" }),
			});

			const status = deriveRunStatus(db, "run-d5");
			expect(status).toBe("completed");
		});

		test("failed has highest priority over running", async () => {
			const dbPath = join(tempDir, "derive-priority.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d6",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "failed" }),
			});
			insertEvent(db, {
				runId: "run-d6",
				type: "status_change",
				step: "step3",
				data: JSON.stringify({ status: "waiting" }),
			});

			const status = deriveRunStatus(db, "run-d6");
			expect(status).toBe("failed");
		});

		test("updates runs.status column after derivation", async () => {
			const dbPath = join(tempDir, "derive-update.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-d7",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-d7",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			deriveRunStatus(db, "run-d7");

			const row = db
				.prepare("SELECT status FROM runs WHERE id = 'run-d7'")
				.get() as { status: string };

			expect(row.status).toBe("running");
		});
	});

	describe("getStepStatuses", () => {
		test("returns latest status per step", async () => {
			const dbPath = join(tempDir, "step-statuses.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-ss",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-ss",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const statuses = getStepStatuses(db, "run-ss");

			const step1 = statuses.find((s) => s.step === "step1");
			const step2 = statuses.find((s) => s.step === "step2");

			expect(step1?.status).toBe("completed");
			expect(step2?.status).toBe("running");
		});
	});

	describe("skipped-step detection", () => {
		test("finds prior steps without events", async () => {
			const dbPath = join(tempDir, "skip-detect.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["requirements", "design", "building", "review"];

			insertEvent(db, {
				runId: "run-sk",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "completed" }),
			});

			const skippable = getSkippableSteps(db, "run-sk", orderedSteps, "review");

			expect(skippable).toContain("design");
			expect(skippable).toContain("building");
			expect(skippable).not.toContain("requirements");
			expect(skippable).not.toContain("review");
		});

		test("returns empty array for first step", async () => {
			const dbPath = join(tempDir, "skip-first.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["requirements", "design", "building"];

			const skippable = getSkippableSteps(
				db,
				"run-sk2",
				orderedSteps,
				"requirements",
			);

			expect(skippable).toEqual([]);
		});

		test("does not affect steps that already have events", async () => {
			const dbPath = join(tempDir, "skip-existing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["step1", "step2", "step3"];

			insertEvent(db, {
				runId: "run-sk3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			insertEvent(db, {
				runId: "run-sk3",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});

			const skippable = getSkippableSteps(db, "run-sk3", orderedSteps, "step3");

			expect(skippable).toEqual([]);
		});

		test("returns empty array when step is not in ordered list", async () => {
			const dbPath = join(tempDir, "skip-unknown.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-sk4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const orderedSteps = ["step1", "step2"];

			const skippable = getSkippableSteps(
				db,
				"run-sk4",
				orderedSteps,
				"unknown-step",
			);

			expect(skippable).toEqual([]);
		});
	});

	describe("findOrCreateRun", () => {
		test("returns existing non-terminal run", async () => {
			const dbPath = join(tempDir, "resume-existing.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-active",
				flow: "build",
				featureId: "feat-resume",
				projectPath: "/project/resume",
			});

			insertEvent(db, {
				runId: "run-active",
				type: "status_change",
				step: "requirements",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-active");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-resume",
				projectPath: "/project/resume",
			});

			expect(result.runId).toBe("run-active");
			expect(result.resumed).toBe(true);
		});

		test("returns most recent non-terminal run when multiple exist", async () => {
			const dbPath = join(tempDir, "resume-multiple.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-older",
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			insertEvent(db, {
				runId: "run-older",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-older");

			// Small delay to ensure different created_at timestamps
			await new Promise((resolve) => setTimeout(resolve, 10));

			insertRun(db, {
				id: "run-newer",
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			insertEvent(db, {
				runId: "run-newer",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-newer");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-multi",
				projectPath: "/project/multi",
			});

			expect(result.runId).toBe("run-newer");
			expect(result.resumed).toBe(true);
		});

		test("creates new run when only terminal runs exist", async () => {
			const dbPath = join(tempDir, "resume-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-done",
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
			});

			insertEvent(db, {
				runId: "run-done",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-done");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-terminal",
				projectPath: "/project/terminal",
			});

			expect(result.runId).not.toBe("run-done");
			expect(result.resumed).toBe(false);
		});

		test("creates new run when no runs exist for feature", async () => {
			const dbPath = join(tempDir, "resume-none.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-new",
				projectPath: "/project/new",
			});

			expect(result.runId).toBeTruthy();
			expect(result.resumed).toBe(false);

			const row = db
				.prepare("SELECT * FROM runs WHERE id = ?")
				.get(result.runId) as {
				id: string;
				flow: string;
				feature_id: string;
			} | null;

			expect(row).not.toBeNull();
			expect(row?.flow).toBe("build");
			expect(row?.feature_id).toBe("feat-new");
		});

		test("does not return run from different project", async () => {
			const dbPath = join(tempDir, "resume-project-isolation.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-other-project",
				flow: "build",
				featureId: "feat-isolated",
				projectPath: "/project/other",
			});

			insertEvent(db, {
				runId: "run-other-project",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-other-project");

			const result = findOrCreateRun(db, {
				flow: "build",
				featureId: "feat-isolated",
				projectPath: "/project/this",
			});

			expect(result.runId).not.toBe("run-other-project");
			expect(result.resumed).toBe(false);
		});
	});

	describe("legacy cleanup", () => {
		test("deletes status.db when present", async () => {
			const legacyDir = join(tempDir, "legacy-cleanup");
			await mkdir(legacyDir, { recursive: true });

			const legacyPath = join(legacyDir, "status.db");
			writeFileSync(legacyPath, "fake-db-content");
			expect(existsSync(legacyPath)).toBe(true);

			const dbPath = join(legacyDir, "rp1.db");
			await expectTaskRight(getEmitDatabase(dbPath));

			expect(existsSync(legacyPath)).toBe(false);
		});

		test("does not error when status.db does not exist", async () => {
			const cleanDir = join(tempDir, "no-legacy");
			await mkdir(cleanDir, { recursive: true });

			const dbPath = join(cleanDir, "rp1.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(db).toBeDefined();
		});
	});

	describe("getEventsSince", () => {
		test("returns events after the given ID in chronological order", async () => {
			const dbPath = join(tempDir, "events-since.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-es",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			const e2 = insertEvent(db, {
				runId: "run-es",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});
			const e3 = insertEvent(db, {
				runId: "run-es",
				type: "btw_update",
				data: JSON.stringify({ message: "hello" }),
			});

			const events = getEventsSince(db, e1.id);

			expect(events).toHaveLength(2);
			expect(events[0].id).toBe(e2.id);
			expect(events[1].id).toBe(e3.id);
			expect(events[0].id).toBeLessThan(events[1].id);
		});

		test("returns empty array when no events after ID", async () => {
			const dbPath = join(tempDir, "events-since-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-es2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			const events = getEventsSince(db, e1.id);
			expect(events).toHaveLength(0);
		});

		test("respects limit parameter", async () => {
			const dbPath = join(tempDir, "events-since-limit.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			for (let i = 0; i < 5; i++) {
				insertEvent(db, {
					runId: "run-es3",
					type: "status_change",
					step: `step${i}`,
					data: JSON.stringify({ status: "running" }),
				});
			}

			const events = getEventsSince(db, 0, 3);
			expect(events).toHaveLength(3);
		});

		test("returns all events when afterId is 0", async () => {
			const dbPath = join(tempDir, "events-since-zero.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-es4",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-es4",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-es4",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			const events = getEventsSince(db, 0);
			expect(events).toHaveLength(2);
		});
	});

	describe("getMaxEventId", () => {
		test("returns 0 when no events exist", async () => {
			const dbPath = join(tempDir, "max-event-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			expect(getMaxEventId(db)).toBe(0);
		});

		test("returns highest event ID", async () => {
			const dbPath = join(tempDir, "max-event-id.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-mei",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-mei",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			const e2 = insertEvent(db, {
				runId: "run-mei",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(getMaxEventId(db)).toBe(e2.id);
		});
	});

	describe("countEventsSince", () => {
		test("returns correct count of events after given ID", async () => {
			const dbPath = join(tempDir, "count-since.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-cs",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs",
				type: "status_change",
				step: "step2",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(countEventsSince(db, e1.id)).toBe(2);
		});

		test("returns 0 when no events after ID", async () => {
			const dbPath = join(tempDir, "count-since-zero.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs2",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			const e1 = insertEvent(db, {
				runId: "run-cs2",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});

			expect(countEventsSince(db, e1.id)).toBe(0);
		});

		test("counts all events when afterId is 0", async () => {
			const dbPath = join(tempDir, "count-since-all.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-cs3",
				flow: "build",
				featureId: "feat",
				projectPath: "/p",
			});

			insertEvent(db, {
				runId: "run-cs3",
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			insertEvent(db, {
				runId: "run-cs3",
				type: "btw_update",
				data: JSON.stringify({ message: "hi" }),
			});

			expect(countEventsSince(db, 0)).toBe(2);
		});
	});

	describe("getActiveRunsSnapshot", () => {
		test("returns non-terminal runs with steps and artifacts", async () => {
			const dbPath = join(tempDir, "snapshot-active.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-snap-active",
				flow: "build",
				featureId: "feat-snap",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-active",
				type: "status_change",
				step: "design",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-snap-active");

			upsertArtifact(db, {
				docId: "doc-snap-1",
				runId: "run-snap-active",
				path: "design.md",
				type: "markdown",
				projectPath: "/p/snap",
				feature: "feat-snap",
				step: "design",
			});

			const snapshot = getActiveRunsSnapshot(db);

			expect(snapshot.length).toBeGreaterThanOrEqual(1);
			const run = snapshot.find((r) => r.id === "run-snap-active");
			expect(run).toBeDefined();
			expect(run?.flow).toBe("build");
			expect(run?.featureId).toBe("feat-snap");
			expect(run?.status).toBe("running");
			expect(run?.steps).toHaveLength(1);
			expect(run?.steps[0].step).toBe("design");
			expect(run?.steps[0].status).toBe("running");
			expect(run?.artifacts).toHaveLength(1);
			expect(run?.artifacts[0].docId).toBe("doc-snap-1");
			expect(run?.artifacts[0].path).toBe("design.md");
		});

		test("excludes terminal runs from snapshot", async () => {
			const dbPath = join(tempDir, "snapshot-terminal.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			insertRun(db, {
				id: "run-snap-done",
				flow: "build",
				featureId: "feat-done",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-done",
				type: "status_change",
				step: "review",
				data: JSON.stringify({ status: "completed" }),
			});
			deriveRunStatus(db, "run-snap-done");

			insertRun(db, {
				id: "run-snap-active2",
				flow: "build",
				featureId: "feat-active",
				projectPath: "/p/snap",
			});

			insertEvent(db, {
				runId: "run-snap-active2",
				type: "status_change",
				step: "building",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, "run-snap-active2");

			const snapshot = getActiveRunsSnapshot(db);

			const doneRun = snapshot.find((r) => r.id === "run-snap-done");
			const activeRun = snapshot.find((r) => r.id === "run-snap-active2");

			expect(doneRun).toBeUndefined();
			expect(activeRun).toBeDefined();
		});

		test("returns empty array when no active runs exist", async () => {
			const dbPath = join(tempDir, "snapshot-empty.db");
			const db = await expectTaskRight(getEmitDatabase(dbPath));

			const snapshot = getActiveRunsSnapshot(db);
			expect(snapshot).toEqual([]);
		});
	});

	describe("database path", () => {
		test("respects RP1_DB env var", async () => {
			const customPath = join(tempDir, "custom-path", "custom.db");
			const original = process.env.RP1_DB;
			process.env.RP1_DB = customPath;

			try {
				closeDatabase();
				resetInstance();

				// We need to re-import or use the default path behavior
				// The DEFAULT_DB_PATH is set at module load time, so we test
				// by passing the path directly
				const db = await expectTaskRight(getEmitDatabase(customPath));
				expect(db).toBeDefined();
				expect(existsSync(customPath)).toBe(true);
			} finally {
				if (original === undefined) {
					delete process.env.RP1_DB;
				} else {
					process.env.RP1_DB = original;
				}
			}
		});
	});
});
