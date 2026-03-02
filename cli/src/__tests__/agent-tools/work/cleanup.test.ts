/**
 * Integration tests for work cleanup command.
 * Tests deletion of expired runs, --dry-run reporting, and --older-than filtering.
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
import {
	closeDatabase,
	countExpiredRuns,
	deleteExpiredRuns,
	insertStatusUpdate,
	queryStatusUpdates,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import { executeCleanup } from "../../../agent-tools/work/index.js";
import type { StatusUpdateInput } from "../../../agent-tools/work/models.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("work cleanup", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `work-cleanup-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	beforeEach(() => {
		testDbPath = join(
			tempDir,
			`test-cleanup-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
		);
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	const insertRow = async (
		overrides: Partial<StatusUpdateInput> = {},
	): Promise<void> => {
		const input: StatusUpdateInput = {
			projectPath: "/test/project",
			feature: "test-feature",
			status: "in_progress",
			step: "build",
			...overrides,
		};
		await expectTaskRight(insertStatusUpdate(input, testDbPath));
	};

	const countAllRows = async (): Promise<number> => {
		const result = await expectTaskRight(
			queryStatusUpdates({ projectPath: "/test/project" }, testDbPath),
		);
		return result.length;
	};

	describe("cleanup deletes all rows of expired runs", () => {
		test("deletes rows for runs with expired expires_at", async () => {
			// Insert an expired run (expires_at in the past)
			await insertRow({
				runId: "expired-run-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "requirements",
			});
			await insertRow({
				runId: "expired-run-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "design",
			});

			// Insert a non-expired run
			await insertRow({
				runId: "active-run-1",
				expiresAt: "2099-12-31T23:59:59.999Z",
				step: "build",
			});

			const before = await countAllRows();
			expect(before).toBe(3);

			const result = await expectTaskRight(deleteExpiredRuns(0, testDbPath));

			expect(result.affectedRuns).toBe(1);
			expect(result.deletedRows).toBe(2);

			const after = await countAllRows();
			expect(after).toBe(1);
		});
	});

	describe("--dry-run reports without deleting", () => {
		test("countExpiredRuns reports but does not delete", async () => {
			await insertRow({
				runId: "dry-run-test-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "plan",
			});
			await insertRow({
				runId: "dry-run-test-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "build",
			});

			const before = await countAllRows();

			const result = await expectTaskRight(countExpiredRuns(0, testDbPath));

			expect(result.affectedRuns).toBe(1);
			expect(result.deletedRows).toBe(2);

			// Verify no rows were actually deleted
			const after = await countAllRows();
			expect(after).toBe(before);
		});

		test("executeCleanup with dryRun reports without deleting", async () => {
			await insertRow({
				runId: "dry-exec-test-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
			});

			const before = await countAllRows();

			const result = await expectTaskRight(
				executeCleanup({ dryRun: true, olderThan: 0 }, testDbPath),
			);

			expect(result.success).toBe(true);
			expect(result.data.affectedRuns).toBe(1);

			const after = await countAllRows();
			expect(after).toBe(before);
		});
	});

	describe("--older-than filters correctly", () => {
		test("only deletes runs expired longer than specified hours", async () => {
			// Insert a run that expired 1 minute ago (recent expiry)
			const recentExpiry = new Date(Date.now() - 60_000).toISOString();
			await insertRow({
				runId: "recent-expired-1",
				expiresAt: recentExpiry,
				step: "plan",
			});

			// Insert a run that expired 50 hours ago
			const oldExpiry = new Date(
				Date.now() - 50 * 60 * 60 * 1000,
			).toISOString();
			await insertRow({
				runId: "old-expired-1",
				expiresAt: oldExpiry,
				step: "build",
			});

			// With --older-than 24: only the 50h-old run should be deleted
			const result = await expectTaskRight(deleteExpiredRuns(24, testDbPath));

			expect(result.affectedRuns).toBe(1);
			expect(result.deletedRows).toBe(1);

			// The recently expired run should still exist
			const remaining = await countAllRows();
			expect(remaining).toBe(1);
		});
	});

	describe("non-expired runs untouched", () => {
		test("active runs with future expires_at are not deleted", async () => {
			await insertRow({
				runId: "active-future-1",
				expiresAt: "2099-12-31T23:59:59.999Z",
				step: "verify",
			});

			const result = await expectTaskRight(deleteExpiredRuns(0, testDbPath));

			expect(result.affectedRuns).toBe(0);
			expect(result.deletedRows).toBe(0);

			const remaining = await countAllRows();
			expect(remaining).toBe(1);
		});
	});

	describe("runs with NULL expires_at untouched", () => {
		test("rows without expires_at are never cleaned up", async () => {
			// Insert rows with NULL expires_at (pre-state-management rows)
			await insertRow({
				runId: "null-expiry-1",
				expiresAt: undefined,
				step: "plan",
			});
			await insertRow({
				expiresAt: undefined,
				step: "build",
			}); // Also NULL run_id

			const result = await expectTaskRight(deleteExpiredRuns(0, testDbPath));

			expect(result.affectedRuns).toBe(0);
			expect(result.deletedRows).toBe(0);

			const remaining = await countAllRows();
			expect(remaining).toBe(2);
		});

		test("rows with NULL run_id are never cleaned up", async () => {
			// Rows without run_id (legacy rows) are never touched
			await insertRow({
				runId: undefined,
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "archive",
			});

			const result = await expectTaskRight(deleteExpiredRuns(0, testDbPath));

			expect(result.affectedRuns).toBe(0);
			expect(result.deletedRows).toBe(0);

			const remaining = await countAllRows();
			expect(remaining).toBe(1);
		});
	});

	describe("executeCleanup integration", () => {
		test("executeCleanup without dry-run deletes expired runs", async () => {
			await insertRow({
				runId: "exec-delete-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "plan",
			});
			await insertRow({
				runId: "exec-delete-1",
				expiresAt: "2020-01-01T00:00:00.000Z",
				step: "build",
			});

			const result = await expectTaskRight(
				executeCleanup({ dryRun: false, olderThan: 0 }, testDbPath),
			);

			expect(result.success).toBe(true);
			expect(result.tool).toBe("work");
			expect(result.data.affectedRuns).toBe(1);
			expect(result.data.deletedRows).toBe(2);

			const remaining = await countAllRows();
			expect(remaining).toBe(0);
		});
	});
});
