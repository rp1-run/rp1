/**
 * Unit tests for insert-time event reconciliation.
 * Tests forward-only lifecycle enforcement and backward transition rejection.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCache } from "../../../agent-tools/state-machine/index.js";
import {
	closeDatabase,
	getStepStatusValue,
	insertStatusUpdate,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import { executeUpdate } from "../../../agent-tools/work/index.js";
import type { StatusUpdateInput } from "../../../agent-tools/work/models.js";
import { isForwardTransition } from "../../../agent-tools/work/update.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("isForwardTransition", () => {
	test("null (pending) -> any status is accepted", () => {
		expect(isForwardTransition(null, "started")).toBe(true);
		expect(isForwardTransition(null, "completed")).toBe(true);
		expect(isForwardTransition(null, "failed")).toBe(true);
		expect(isForwardTransition(null, "waiting-input")).toBe(true);
	});

	test("started -> completed is forward (accepted)", () => {
		expect(isForwardTransition("started", "completed")).toBe(true);
	});

	test("started -> failed is forward (accepted)", () => {
		expect(isForwardTransition("started", "failed")).toBe(true);
	});

	test("in_progress -> completed is forward (accepted)", () => {
		expect(isForwardTransition("in_progress", "completed")).toBe(true);
	});

	test("completed -> started is backward (rejected)", () => {
		expect(isForwardTransition("completed", "started")).toBe(false);
	});

	test("completed -> in_progress is backward (rejected)", () => {
		expect(isForwardTransition("completed", "in_progress")).toBe(false);
	});

	test("failed -> started is backward (rejected)", () => {
		expect(isForwardTransition("failed", "started")).toBe(false);
	});

	test("failed -> in_progress is backward (rejected)", () => {
		expect(isForwardTransition("failed", "in_progress")).toBe(false);
	});

	test("waiting-input -> started is lateral (accepted)", () => {
		expect(isForwardTransition("waiting-input", "started")).toBe(true);
	});

	test("waiting-input -> completed is forward (accepted)", () => {
		expect(isForwardTransition("waiting-input", "completed")).toBe(true);
	});

	test("needs-review -> started is lateral (accepted, resume)", () => {
		expect(isForwardTransition("needs-review", "started")).toBe(true);
	});

	test("needs-review -> in_progress is lateral (accepted, resume)", () => {
		expect(isForwardTransition("needs-review", "in_progress")).toBe(true);
	});

	test("same status is accepted (idempotent)", () => {
		expect(isForwardTransition("started", "started")).toBe(true);
		expect(isForwardTransition("completed", "completed")).toBe(true);
		expect(isForwardTransition("failed", "failed")).toBe(true);
	});

	test("waiting-input -> needs-review is lateral (accepted)", () => {
		expect(isForwardTransition("waiting-input", "needs-review")).toBe(true);
	});

	test("completed -> failed is lateral at same precedence (accepted)", () => {
		expect(isForwardTransition("completed", "failed")).toBe(true);
	});
});

describe("getStepStatusValue", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `reconcile-db-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-reconcile.db");
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns null for step with no records", async () => {
		const result = await expectTaskRight(
			getStepStatusValue(
				"/test/project",
				"test-feature",
				"build",
				undefined,
				testDbPath,
			),
		);
		expect(result).toBeNull();
	});

	test("returns latest status for step with records", async () => {
		const seed: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "step-status-test",
			step: "build",
			status: "started",
			runId: "run-001",
			expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
		};
		await expectTaskRight(insertStatusUpdate(seed, testDbPath));

		const result = await expectTaskRight(
			getStepStatusValue(
				"/test/project",
				"step-status-test",
				"build",
				"run-001",
				testDbPath,
			),
		);
		expect(result).toBe("started");
	});

	test("returns latest status when multiple records exist", async () => {
		const seed1: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "multi-status-test",
			step: "build",
			status: "started",
			runId: "run-002",
			expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
		};
		await expectTaskRight(insertStatusUpdate(seed1, testDbPath));

		const seed2: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "multi-status-test",
			step: "build",
			status: "completed",
			runId: "run-002",
			expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(),
		};
		await expectTaskRight(insertStatusUpdate(seed2, testDbPath));

		const result = await expectTaskRight(
			getStepStatusValue(
				"/test/project",
				"multi-status-test",
				"build",
				"run-002",
				testDbPath,
			),
		);
		expect(result).toBe("completed");
	});
});

describe("executeUpdate reconciliation", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `reconcile-exec-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-exec-reconcile.db");
	});

	beforeEach(() => {
		clearCache();
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("skips insert when reconciliation.rejected is true", async () => {
		const input: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "rejected-test",
			step: "build",
			status: "started",
			reconciliation: {
				rejected: true,
				reason: "backward_transition",
			},
		};

		const result = await expectTaskRight(executeUpdate(input, testDbPath));
		expect(result.data.id).toBe(0);
		expect(result.data.message).toBe("backward_transition");
	});

	test("proceeds with insert when no reconciliation field", async () => {
		const input: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "normal-test",
			step: "build",
			status: "started",
		};

		const result = await expectTaskRight(executeUpdate(input, testDbPath));
		expect(result.data.id).toBeGreaterThan(0);
		expect(result.data.status).toBe("started");
	});
});
