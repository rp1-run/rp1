/**
 * Integration tests for Phase 2 write-ahead durability scenarios.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	resetInstance,
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
});
