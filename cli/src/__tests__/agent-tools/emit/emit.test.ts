/**
 * End-to-end tests for the emit tool execution pipeline.
 * Tests the full flow from executeEmit through DB writes and response shaping.
 *
 * These tests initialize the database singleton with a known test path,
 * then exercise executeEmit which reuses the cached singleton.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	insertRun,
	resetInstance,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeEmit } from "../../../agent-tools/emit/index.js";
import type { EmitInput } from "../../../agent-tools/emit/models.js";
import {
	createTempDir,
	expectTaskRight,
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
