/**
 * Unit tests for work status database layer.
 * Tests schema creation, CRUD operations, and query functionality.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeDatabase,
	DEFAULT_DB_PATH,
	getLatestStatusByFeature,
	getRecentlyCompletedTasks,
	insertStatusUpdate,
	isValidStatus,
	queryStatusUpdates,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import type { StatusUpdateInput } from "../../../agent-tools/work/models.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("work database", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `work-db-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-status.db");
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("isValidStatus", () => {
		test("returns true for valid status values", () => {
			expect(isValidStatus("started")).toBe(true);
			expect(isValidStatus("in_progress")).toBe(true);
			expect(isValidStatus("completed")).toBe(true);
			expect(isValidStatus("failed")).toBe(true);
		});

		test("returns false for invalid status values", () => {
			expect(isValidStatus("unknown")).toBe(false);
			expect(isValidStatus("pending")).toBe(false);
			expect(isValidStatus("")).toBe(false);
		});
	});

	describe("insertStatusUpdate", () => {
		test("creates database file on first write", async () => {
			const dbPath = join(tempDir, "auto-create.db");
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "test-feature",
				status: "started",
			};

			await expectTaskRight(insertStatusUpdate(input, dbPath));

			const file = Bun.file(dbPath);
			expect(await file.exists()).toBe(true);
		});

		test("returns auto-generated id and timestamp", async () => {
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "test-feature",
				status: "started",
			};

			const result = await expectTaskRight(
				insertStatusUpdate(input, testDbPath),
			);

			expect(result.id).toBeGreaterThan(0);
			// Strict ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
			expect(result.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("stores all provided fields", async () => {
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "feature-a",
				task: "task-1",
				status: "in_progress",
				message: "Working on requirements",
				metadata: '{"step": 1}',
			};

			const insertResult = await expectTaskRight(
				insertStatusUpdate(input, testDbPath),
			);

			const records = await expectTaskRight(
				queryStatusUpdates({ projectPath: "/test/project" }, testDbPath),
			);

			const record = records.find((r) => r.id === insertResult.id);
			expect(record).toBeDefined();
			expect(record?.projectPath).toBe("/test/project");
			expect(record?.feature).toBe("feature-a");
			expect(record?.task).toBe("task-1");
			expect(record?.status).toBe("in_progress");
			expect(record?.message).toBe("Working on requirements");
			expect(record?.metadata).toBe('{"step": 1}');
		});

		test("stores null for optional fields when not provided", async () => {
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "minimal-feature",
				status: "started",
			};

			const insertResult = await expectTaskRight(
				insertStatusUpdate(input, testDbPath),
			);

			const records = await expectTaskRight(
				queryStatusUpdates({ projectPath: "/test/project" }, testDbPath),
			);

			const record = records.find((r) => r.id === insertResult.id);
			expect(record?.task).toBeNull();
			expect(record?.message).toBeNull();
			expect(record?.metadata).toBeNull();
		});

		test("enforces status enum constraint", async () => {
			const input = {
				projectPath: "/test/project",
				feature: "test-feature",
				status: "invalid_status" as "started",
			};

			const error = await expectTaskLeft(insertStatusUpdate(input, testDbPath));
			expect(error._tag).toBe("RuntimeError");
		});

		test("records timestamp in ISO 8601 format", async () => {
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "timestamp-test",
				status: "started",
			};

			const result = await expectTaskRight(
				insertStatusUpdate(input, testDbPath),
			);

			// ISO 8601 format: YYYY-MM-DDTHH:MM:SS.sssZ
			expect(result.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("completes within 100ms under normal conditions", async () => {
			const input: StatusUpdateInput = {
				projectPath: "/test/project",
				feature: "latency-test",
				status: "started",
			};

			const start = performance.now();
			await expectTaskRight(insertStatusUpdate(input, testDbPath));
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("queryStatusUpdates", () => {
		test("returns only records matching project path", async () => {
			// Insert records for different projects
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/project-a",
						feature: "feature-1",
						status: "started",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/project-b",
						feature: "feature-2",
						status: "started",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryStatusUpdates({ projectPath: "/project-a" }, testDbPath),
			);

			expect(results.every((r) => r.projectPath === "/project-a")).toBe(true);
		});

		test("filters by feature when specified", async () => {
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/filter-test",
						feature: "feature-x",
						status: "started",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/filter-test",
						feature: "feature-y",
						status: "started",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryStatusUpdates(
					{ projectPath: "/filter-test", feature: "feature-x" },
					testDbPath,
				),
			);

			expect(results.every((r) => r.feature === "feature-x")).toBe(true);
		});

		test("limits results when specified", async () => {
			// Insert multiple records
			for (let i = 0; i < 5; i++) {
				await expectTaskRight(
					insertStatusUpdate(
						{
							projectPath: "/limit-test",
							feature: "feature",
							status: "in_progress",
							message: `Update ${i}`,
						},
						testDbPath,
					),
				);
			}

			const results = await expectTaskRight(
				queryStatusUpdates(
					{ projectPath: "/limit-test", limit: 3 },
					testDbPath,
				),
			);

			expect(results.length).toBe(3);
		});

		test("returns records ordered by created_at descending", async () => {
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/order-test",
						feature: "feature",
						status: "started",
					},
					testDbPath,
				),
			);
			// Small delay to ensure different timestamps
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/order-test",
						feature: "feature",
						status: "in_progress",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryStatusUpdates({ projectPath: "/order-test" }, testDbPath),
			);

			// Most recent first
			expect(results[0].status).toBe("in_progress");
			expect(results[1].status).toBe("started");
		});

		test("returns empty array for non-existent project", async () => {
			const results = await expectTaskRight(
				queryStatusUpdates(
					{ projectPath: "/non-existent-project" },
					testDbPath,
				),
			);

			expect(results).toEqual([]);
		});
	});

	describe("getLatestStatusByFeature", () => {
		test("returns only the latest status for each feature", async () => {
			const projectPath = "/latest-test";

			// Insert multiple updates for same feature
			await expectTaskRight(
				insertStatusUpdate(
					{ projectPath, feature: "feature-a", status: "started" },
					testDbPath,
				),
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertStatusUpdate(
					{ projectPath, feature: "feature-a", status: "in_progress" },
					testDbPath,
				),
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertStatusUpdate(
					{ projectPath, feature: "feature-a", status: "completed" },
					testDbPath,
				),
			);

			// Insert for different feature
			await expectTaskRight(
				insertStatusUpdate(
					{ projectPath, feature: "feature-b", status: "started" },
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				getLatestStatusByFeature(projectPath, testDbPath),
			);

			expect(results.length).toBe(2);
			const featureA = results.find((r) => r.feature === "feature-a");
			const featureB = results.find((r) => r.feature === "feature-b");
			expect(featureA?.status).toBe("completed");
			expect(featureB?.status).toBe("started");
		});

		test("returns empty array for project with no status updates", async () => {
			const results = await expectTaskRight(
				getLatestStatusByFeature("/no-updates-project", testDbPath),
			);

			expect(results).toEqual([]);
		});
	});

	describe("getRecentlyCompletedTasks", () => {
		test("returns completed tasks with task field", async () => {
			const projectPath = "/completed-tasks-test";

			// Insert completed tasks for the same feature
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath,
						feature: "my-feature",
						task: "T1",
						status: "completed",
						message: "Task 1 done",
					},
					testDbPath,
				),
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath,
						feature: "my-feature",
						task: "T2",
						status: "completed",
						message: "Task 2 done",
					},
					testDbPath,
				),
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath,
						feature: "my-feature",
						task: "T3",
						status: "completed",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				getRecentlyCompletedTasks(projectPath, 24, testDbPath),
			);

			expect(results.length).toBe(3);
			expect(results[0].task).toBe("T3");
			expect(results[1].task).toBe("T2");
			expect(results[2].task).toBe("T1");
		});

		test("excludes tasks without task field", async () => {
			const projectPath = "/completed-no-task";

			// Insert completed status without task field
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath,
						feature: "feature-only",
						status: "completed",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				getRecentlyCompletedTasks(projectPath, 24, testDbPath),
			);

			expect(results.length).toBe(0);
		});

		test("excludes non-completed tasks", async () => {
			const projectPath = "/incomplete-tasks";

			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath,
						feature: "in-progress",
						task: "T1",
						status: "in_progress",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				getRecentlyCompletedTasks(projectPath, 24, testDbPath),
			);

			expect(results.length).toBe(0);
		});

		test("returns empty array for project with no completed tasks", async () => {
			const results = await expectTaskRight(
				getRecentlyCompletedTasks("/no-completed-tasks", 24, testDbPath),
			);

			expect(results).toEqual([]);
		});
	});

	describe("DEFAULT_DB_PATH", () => {
		test("points to ~/.rp1/status.db", () => {
			expect(DEFAULT_DB_PATH).toMatch(/\.rp1[/\\]status\.db$/);
		});
	});
});
