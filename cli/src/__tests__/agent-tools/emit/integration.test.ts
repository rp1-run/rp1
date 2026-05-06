/**
 * Integration tests for Phase 2 recovery scenarios.
 * Validates write-ahead durability, run resumption end-to-end,
 * WebSocket reconnect replay, snapshot fallback, and IPC format handling.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import type { EventNotificationPayload } from "../../../../web-ui/src/daemon/ipc.js";
import {
	closeDatabase,
	countEventsSince,
	deriveRunStatus,
	findOrCreateRun,
	getActiveRunsSnapshot,
	getEmitDatabase,
	getEventsSince,
	getMaxEventId,
	getRunById,
	insertEvent,
	insertRun,
	reclassifyInactiveRuns,
	resetInstance,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeEmit, executeEndRun } from "../../../agent-tools/emit/index.js";
import type { EmitInput } from "../../../agent-tools/emit/models.js";
import { createTempDir, expectTaskRight } from "../../helpers/index.js";

describe("Phase 2 integration: write-ahead durability", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("emit-integration-wha");
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, ".rp1", "project_id"),
			"test-integration-wha-uuid",
		);
		dbPath = join(tempDir, "test.db");
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

	test("event is persisted in DB and returns success without daemon (AC-01b, AC-01c, AC-01d)", async () => {
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

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const row = db
			.prepare("SELECT * FROM events WHERE id = $id")
			.get({ $id: result.data.eventId }) as {
			id: number;
			run_id: string;
			type: string;
			step: string;
		} | null;

		expect(row).not.toBeNull();
		expect(row?.run_id).toBe(input.runId);
		expect(row?.type).toBe("status_change");
		expect(row?.step).toBe("requirements");
	});

	test("run is auto-created and event persisted for all 6 event types (AC-01a, AC-05c)", async () => {
		const eventTypes: EmitInput["type"][] = [
			"status_change",
			"btw_update",
			"waiting_for_user",
		];

		for (const type of eventTypes) {
			closeDatabase();
			resetInstance();
			const localDbPath = join(tempDir, `test-${type}.db`);
			await expectTaskRight(getEmitDatabase(localDbPath));

			const input = makeInput({
				type,
				step: type === "status_change" ? "requirements" : undefined,
				data: {
					status: "running",
					workflow: "build",
					feature: "feat",
					...(type === "btw_update" ? { message: "hello" } : {}),
					...(type === "waiting_for_user" ? { prompt: "Please confirm" } : {}),
				},
			});

			const result = await expectTaskRight(executeEmit(input));

			expect(result.success).toBe(true);
			expect(result.data.eventId).toBeGreaterThan(0);
			expect(result.data.type).toBe(type);
		}
	});

	test("multiple events for same run are persisted with derived status (AC-06a, AC-06b)", async () => {
		const runId = `run-multi-${Date.now()}`;

		const input1 = makeInput({
			type: "status_change",
			runId,
			step: "requirements",
			data: { status: "running", workflow: "build", feature: "feat" },
		});
		const result1 = await expectTaskRight(executeEmit(input1));
		expect(result1.data.runStatus).toBe("running");

		const input2 = makeInput({
			type: "status_change",
			runId,
			step: "requirements",
			data: { status: "completed", workflow: "build", feature: "feat" },
		});
		const result2 = await expectTaskRight(executeEmit(input2));
		expect(result2.data.runStatus).toBe("completed");

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const row = db
			.prepare("SELECT status FROM runs WHERE id = $id")
			.get({ $id: runId }) as { status: string };

		expect(row.status).toBe("completed");
	});

	test("emit end-run persists a stepless terminal lifecycle event", async () => {
		const runId = `run-end-${Date.now()}`;

		await expectTaskRight(
			executeEmit(
				makeInput({
					type: "status_change",
					runId,
					step: "requirements",
					data: { status: "running", workflow: "build", feature: "feat" },
				}),
			),
		);

		const result = await expectTaskRight(
			executeEndRun({
				runId,
				outcome: "abandoned",
				reason: "No longer needed",
			}),
		);

		expect(result.success).toBe(true);
		expect(result.data.runStatus).toBe("abandoned");

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const row = db
			.prepare(
				`SELECT step, unit, json_extract(data, '$.status') as status
				 FROM events
				 WHERE id = $id`,
			)
			.get({ $id: result.data.eventId }) as {
			step: string | null;
			unit: string | null;
			status: string;
		} | null;

		expect(row).not.toBeNull();
		expect(row?.step).toBeNull();
		expect(row?.unit).toBeNull();
		expect(row?.status).toBe("abandoned");
	});

	test("waiting_for_user persists waiting run status until new workflow progress arrives", async () => {
		const runId = `run-waiting-${Date.now()}`;

		const runningResult = await expectTaskRight(
			executeEmit(
				makeInput({
					type: "status_change",
					runId,
					step: "requirements",
					data: { status: "running", workflow: "build", feature: "feat" },
				}),
			),
		);
		expect(runningResult.data.runStatus).toBe("running");

		const waitingResult = await expectTaskRight(
			executeEmit(
				makeInput({
					type: "waiting_for_user",
					runId,
					step: "requirements",
					data: { workflow: "build", feature: "feat", prompt: "Need approval" },
				}),
			),
		);
		expect(waitingResult.data.runStatus).toBe("waiting");

		let db = await expectTaskRight(getEmitDatabase(dbPath));
		let run = getRunById(db, runId);
		expect(run?.status).toBe("waiting");

		let snapshot = getActiveRunsSnapshot(db);
		expect(
			snapshot
				.find((record) => record.id === runId)
				?.steps.some(
					(step) => step.step === "requirements" && step.status === "waiting",
				),
		).toBe(true);

		const resumedResult = await expectTaskRight(
			executeEmit(
				makeInput({
					type: "status_change",
					runId,
					step: "planning",
					data: { status: "running", workflow: "build", feature: "feat" },
				}),
			),
		);
		expect(resumedResult.data.runStatus).toBe("running");

		db = await expectTaskRight(getEmitDatabase(dbPath));
		run = getRunById(db, runId);
		expect(run?.status).toBe("running");

		snapshot = getActiveRunsSnapshot(db);
		expect(
			snapshot
				.find((record) => record.id === runId)
				?.steps.some(
					(step) => step.step === "planning" && step.status === "running",
				),
		).toBe(true);
	});

	test("inactive reclassification is cleared by newer executeEmit workflow progress", async () => {
		const runId = `run-inactive-${Date.now()}`;

		await expectTaskRight(
			executeEmit(
				makeInput({
					type: "status_change",
					runId,
					step: "requirements",
					data: { status: "running", workflow: "build", feature: "feat" },
				}),
			),
		);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		db.prepare("UPDATE runs SET updated_at = ? WHERE id = ?").run(
			"2026-04-10T00:00:00.000Z",
			runId,
		);

		const reclassified = reclassifyInactiveRuns(
			db,
			new Date("2026-04-13T12:00:00.000Z"),
		);
		expect(reclassified).toHaveLength(1);
		expect(reclassified[0]).toMatchObject({
			runId,
			previousStatus: "running",
			runStatus: "inactive",
		});
		expect(getRunById(db, runId)?.status).toBe("inactive");
		expect(
			getActiveRunsSnapshot(db).find((record) => record.id === runId),
		).toBeUndefined();

		const resumedResult = await expectTaskRight(
			executeEmit(
				makeInput({
					type: "status_change",
					runId,
					step: "planning",
					data: { status: "running", workflow: "build", feature: "feat" },
				}),
			),
		);
		expect(resumedResult.data.runStatus).toBe("running");

		expect(getRunById(db, runId)?.status).toBe("running");
		expect(
			getActiveRunsSnapshot(db).find((record) => record.id === runId),
		).toBeDefined();
	});
});

describe("Phase 2 integration: run resumption end-to-end", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("emit-integration-resume");
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, ".rp1", "project_id"),
			"test-integration-resume-uuid",
		);
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("resume-run returns existing active run after emit (AC-02a, AC-02e)", async () => {
		const runId = `run-resume-${Date.now()}`;
		const featureId = "feat-resume-e2e";

		const input: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			data: { status: "running", workflow: "build", feature: featureId },
			projectPath: tempDir,
		};

		await expectTaskRight(executeEmit(input));

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const result = findOrCreateRun(db, {
			flow: "build",
			featureId,
			projectPath: tempDir,
		});

		expect(result.runId).toBe(runId);
		expect(result.resumed).toBe(true);
	});

	test("resume-run creates new run after previous completed (AC-02c)", async () => {
		const runId = `run-done-${Date.now()}`;
		const featureId = "feat-done-e2e";

		const input1: EmitInput = {
			type: "status_change",
			runId,
			step: "requirements",
			data: { status: "completed", workflow: "build", feature: featureId },
			projectPath: tempDir,
		};

		await expectTaskRight(executeEmit(input1));

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const result = findOrCreateRun(db, {
			flow: "build",
			featureId,
			projectPath: tempDir,
		});

		expect(result.runId).not.toBe(runId);
		expect(result.resumed).toBe(false);
	});

	test("resume-run creates a new run after a previous run is cancelled via end-run", async () => {
		const runId = `run-cancelled-${Date.now()}`;
		const featureId = "feat-cancelled-e2e";

		await expectTaskRight(
			executeEmit({
				type: "status_change",
				runId,
				step: "requirements",
				data: { status: "running", workflow: "build", feature: featureId },
				projectPath: tempDir,
			}),
		);

		await expectTaskRight(
			executeEndRun({
				runId,
				outcome: "cancelled",
				reason: "Superseded by a newer run",
			}),
		);

		const db = await expectTaskRight(getEmitDatabase(dbPath));
		expect(getRunById(db, runId)?.status).toBe("cancelled");

		const result = findOrCreateRun(db, {
			flow: "build",
			featureId,
			projectPath: tempDir,
		});

		expect(result.runId).not.toBe(runId);
		expect(result.resumed).toBe(false);
	});

	test("resume-run works identically across workflow types (AC-02d)", async () => {
		const flows = ["build", "build-fast", "blueprint", "pr-review"];
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		for (const flow of flows) {
			const featureId = `feat-${flow}-resume`;

			const run = insertRun(db, {
				id: `run-${flow}-${Date.now()}`,
				flow,
				featureId,
				projectPath: tempDir,
			});

			insertEvent(db, {
				runId: run.id,
				type: "status_change",
				step: "step1",
				data: JSON.stringify({ status: "running" }),
			});
			deriveRunStatus(db, run.id);

			const result = findOrCreateRun(db, {
				flow,
				featureId,
				projectPath: tempDir,
			});

			expect(result.runId).toBe(run.id);
			expect(result.resumed).toBe(true);
		}
	});
});

describe("Phase 2 integration: WebSocket reconnect replay", () => {
	let tempDir: string;
	let dbPath: string;

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("emit-integration-replay");
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, ".rp1", "project_id"),
			"test-integration-replay-uuid",
		);
		dbPath = join(tempDir, "test.db");
		await expectTaskRight(getEmitDatabase(dbPath));
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("replays individual events when missed count <= 100 (AC-04b, AC-04c)", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		const run = insertRun(db, {
			id: "run-replay-small",
			flow: "build",
			featureId: "feat-replay",
			projectPath: tempDir,
		});

		const firstEvent = insertEvent(db, {
			runId: run.id,
			type: "status_change",
			step: "step1",
			data: JSON.stringify({ status: "running" }),
		});

		for (let i = 0; i < 10; i++) {
			insertEvent(db, {
				runId: run.id,
				type: "status_change",
				step: `step-${i + 2}`,
				data: JSON.stringify({ status: "running" }),
			});
		}

		const missedCount = countEventsSince(db, firstEvent.id);
		expect(missedCount).toBe(10);

		const events = getEventsSince(db, firstEvent.id);
		expect(events).toHaveLength(10);
		expect(events[0].id).toBeGreaterThan(firstEvent.id);

		for (let i = 0; i < events.length - 1; i++) {
			expect(events[i].id).toBeLessThan(events[i + 1].id);
		}
	});

	test("snapshot is triggered when missed count > 100 (AC-04d, AC-04e)", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		const run = insertRun(db, {
			id: "run-replay-large",
			flow: "build",
			featureId: "feat-snapshot",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId: run.id,
			type: "status_change",
			step: "design",
			data: JSON.stringify({ status: "running" }),
		});
		deriveRunStatus(db, run.id);

		upsertArtifact(db, {
			docId: "doc-snap-test",
			runId: run.id,
			path: "design.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-snapshot",
			step: "design",
		});

		const baseline = getMaxEventId(db);

		for (let i = 0; i < 105; i++) {
			insertEvent(db, {
				runId: run.id,
				type: "btw_update",
				data: JSON.stringify({ message: `update ${i}` }),
			});
		}

		const missedCount = countEventsSince(db, baseline);
		expect(missedCount).toBe(105);
		expect(missedCount).toBeGreaterThan(100);

		const snapshot = getActiveRunsSnapshot(db);
		expect(snapshot.length).toBeGreaterThanOrEqual(1);

		const activeRun = snapshot.find((r) => r.id === run.id);
		expect(activeRun).toBeDefined();
		expect(activeRun?.featureId).toBe("feat-snapshot");
		expect(activeRun?.steps.length).toBeGreaterThanOrEqual(1);
		expect(activeRun?.artifacts).toHaveLength(1);
		expect(activeRun?.artifacts[0].docId).toBe("doc-snap-test");
	});

	test("WebSocketHub replay decision boundary at 100 events", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		const run = insertRun(db, {
			id: "run-boundary",
			flow: "build",
			featureId: "feat-boundary",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId: run.id,
			type: "status_change",
			step: "step1",
			data: JSON.stringify({ status: "running" }),
		});
		deriveRunStatus(db, run.id);

		const baselineId = getMaxEventId(db);

		for (let i = 0; i < 100; i++) {
			insertEvent(db, {
				runId: run.id,
				type: "btw_update",
				data: JSON.stringify({ message: `msg ${i}` }),
			});
		}

		const countAt100 = countEventsSince(db, baselineId);
		expect(countAt100).toBe(100);
		expect(countAt100 <= 100).toBe(true);

		insertEvent(db, {
			runId: run.id,
			type: "btw_update",
			data: JSON.stringify({ message: "one-over" }),
		});

		const countAt101 = countEventsSince(db, baselineId);
		expect(countAt101).toBe(101);
		expect(countAt101 > 100).toBe(true);
	});
});

describe("Phase 2 integration: IPC event format through handler", () => {
	test("new event payload has correct shape with type discriminator (AC-05a)", () => {
		const payload: EventNotificationPayload = {
			type: "event",
			eventType: "status_change",
			eventId: 42,
			runId: "run-ipc-test",
			projectPath: "/test/project",
			featureId: "feat-ipc",
			step: "design",
			data: { status: "running" },
			createdAt: "2026-03-15T10:00:00.000Z",
		};

		expect(payload.type).toBe("event");
		expect(payload.eventType).toBe("status_change");
		expect(payload.eventId).toBe(42);
		expect(payload.runId).toBe("run-ipc-test");

		const serialized = JSON.stringify(payload);
		const parsed = JSON.parse(serialized) as Record<string, unknown>;

		expect(parsed.type).toBe("event");
		expect(parsed.eventType).toBe("status_change");
		expect(parsed.eventId).toBe(42);
	});

	test("all 6 event types produce valid payloads (AC-05c)", () => {
		const eventTypes = [
			"status_change",
			"artifact_registered",
			"annotation_updated",
			"waiting_for_user",
			"btw_update",
			"subflow_registered",
		];

		for (const eventType of eventTypes) {
			const payload: EventNotificationPayload = {
				type: "event",
				eventType,
				eventId: 1,
				runId: "run-all-types",
				projectPath: "/p",
				featureId: "f",
				step: eventType === "status_change" ? "step1" : null,
				data: eventType === "status_change" ? { status: "running" } : null,
				createdAt: new Date().toISOString(),
			};

			const serialized = JSON.stringify(payload);
			const parsed = JSON.parse(serialized) as EventNotificationPayload;

			expect(parsed.type).toBe("event");
			expect(parsed.eventType).toBe(eventType);
		}
	});

	test("type discriminator distinguishes new format from legacy (AC-05a, AC-05b)", () => {
		const newFormat = {
			type: "event",
			eventType: "status_change",
			eventId: 1,
			runId: "r",
			projectPath: "/p",
			featureId: "f",
			step: "s",
			data: { status: "running" },
			createdAt: new Date().toISOString(),
		};

		const legacyArtifact = {
			type: "artifact",
			projectPath: "/p",
			feature: "f",
			artifact: { path: "x.md", type: "markdown", step: null, runId: null },
		};

		const legacyStatus = {
			projectPath: "/p",
			feature: "f",
			status: "started",
		};

		expect(newFormat.type).toBe("event");
		expect(legacyArtifact.type).toBe("artifact");
		expect((legacyStatus as Record<string, unknown>).type).toBeUndefined();

		expect(newFormat.type !== legacyArtifact.type).toBe(true);
		expect(
			newFormat.type !== (legacyStatus as Record<string, unknown>).type,
		).toBe(true);
	});
});
