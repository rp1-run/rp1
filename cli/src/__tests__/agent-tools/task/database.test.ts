/**
 * Unit tests for task queue database layer.
 * Tests CRUD operations, FIFO ordering, atomic pickup, and state transitions.
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
	resetInstance,
} from "../../../agent-tools/emit/database.js";
import {
	cancelTask,
	completeTask,
	createTask,
	failTask,
	getTask,
	listTasks,
	pickupTask,
} from "../../../agent-tools/task/database.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("task database", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `task-db-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-status.db");
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("createTask", () => {
		test("creates a task and returns a valid TaskRecord", async () => {
			const result = await expectTaskRight(
				createTask(
					{
						type: "check-annotations",
						description: "Review open annotations",
					},
					testDbPath,
				),
			);

			expect(result.id).toBeGreaterThan(0);
			expect(result.type).toBe("check-annotations");
			expect(result.description).toBe("Review open annotations");
			expect(result.status).toBe("pending");
			expect(result.payload).toBeNull();
			expect(result.projectPath).toBeNull();
			expect(result.result).toBeNull();
			expect(result.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
			expect(result.updatedAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("stores optional payload and project path", async () => {
			const result = await expectTaskRight(
				createTask(
					{
						type: "archive-feature",
						description: "Archive completed feature",
						payload: '{"featureId": "feat-123"}',
						projectPath: "/test/project",
					},
					testDbPath,
				),
			);

			expect(result.payload).toBe('{"featureId": "feat-123"}');
			expect(result.projectPath).toBe("/test/project");
		});

		test("creates tasks with unique auto-increment IDs", async () => {
			const task1 = await expectTaskRight(
				createTask({ type: "type-a", description: "First task" }, testDbPath),
			);
			const task2 = await expectTaskRight(
				createTask({ type: "type-b", description: "Second task" }, testDbPath),
			);

			expect(task2.id).toBeGreaterThan(task1.id);
		});
	});

	describe("listTasks", () => {
		test("returns tasks filtered by status", async () => {
			const dbPath = join(tempDir, "list-status.db");

			await expectTaskRight(
				createTask({ type: "type-a", description: "Pending task" }, dbPath),
			);
			await expectTaskRight(
				createTask(
					{ type: "type-b", description: "Will be picked up" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const pendingTasks = await expectTaskRight(
				listTasks({ status: "pending" }, dbPath),
			);
			const inProgressTasks = await expectTaskRight(
				listTasks({ status: "in_progress" }, dbPath),
			);

			expect(pendingTasks.length).toBeGreaterThanOrEqual(1);
			expect(pendingTasks.every((t) => t.status === "pending")).toBe(true);
			expect(inProgressTasks.length).toBeGreaterThanOrEqual(1);
			expect(inProgressTasks.every((t) => t.status === "in_progress")).toBe(
				true,
			);
		});

		test("returns tasks filtered by project path", async () => {
			const dbPath = join(tempDir, "list-project.db");

			await expectTaskRight(
				createTask(
					{
						type: "type-a",
						description: "Project A task",
						projectPath: "/project-a",
					},
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			await expectTaskRight(
				createTask(
					{
						type: "type-b",
						description: "Project B task",
						projectPath: "/project-b",
					},
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const results = await expectTaskRight(
				listTasks({ projectPath: "/project-a" }, dbPath),
			);

			expect(results.length).toBe(1);
			expect(results[0].projectPath).toBe("/project-a");
		});

		test("returns tasks in FIFO order (oldest first)", async () => {
			const dbPath = join(tempDir, "list-fifo.db");

			await expectTaskRight(
				createTask({ type: "first", description: "First created" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			await new Promise((resolve) => setTimeout(resolve, 10));

			await expectTaskRight(
				createTask({ type: "second", description: "Second created" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const results = await expectTaskRight(listTasks({}, dbPath));

			expect(results.length).toBeGreaterThanOrEqual(2);
			const firstIdx = results.findIndex((t) => t.type === "first");
			const secondIdx = results.findIndex((t) => t.type === "second");
			expect(firstIdx).toBeLessThan(secondIdx);
		});

		test("respects limit parameter", async () => {
			const dbPath = join(tempDir, "list-limit.db");

			for (let i = 0; i < 5; i++) {
				await expectTaskRight(
					createTask({ type: "bulk", description: `Task ${i}` }, dbPath),
				);
				closeDatabase();
				resetInstance();
			}

			const results = await expectTaskRight(listTasks({ limit: 2 }, dbPath));

			expect(results.length).toBe(2);
		});

		test("returns empty array when no tasks match", async () => {
			const dbPath = join(tempDir, "list-empty.db");

			await expectTaskRight(
				createTask({ type: "type-a", description: "A task" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const results = await expectTaskRight(
				listTasks({ status: "completed" }, dbPath),
			);

			expect(results).toEqual([]);
		});
	});

	describe("pickupTask", () => {
		test("returns oldest pending task", async () => {
			const dbPath = join(tempDir, "pickup-fifo.db");

			await expectTaskRight(
				createTask(
					{ type: "oldest", description: "Should be picked first" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			await new Promise((resolve) => setTimeout(resolve, 10));

			await expectTaskRight(
				createTask(
					{ type: "newer", description: "Should be picked second" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			expect(pickedUp).not.toBeNull();
			expect(pickedUp?.type).toBe("oldest");
		});

		test("atomically transitions task to in_progress", async () => {
			const dbPath = join(tempDir, "pickup-transition.db");

			const created = await expectTaskRight(
				createTask(
					{ type: "transition-test", description: "Test transition" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			expect(pickedUp).not.toBeNull();
			expect(pickedUp?.id).toBe(created.id);
			expect(pickedUp?.status).toBe("in_progress");
		});

		test("returns null when no pending tasks exist", async () => {
			const dbPath = join(tempDir, "pickup-empty.db");

			await expectTaskRight(
				createTask({ type: "only-task", description: "Only task" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const result = await expectTaskRight(pickupTask(undefined, dbPath));

			expect(result).toBeNull();
		});

		test("successive pickups return different tasks in FIFO order", async () => {
			const dbPath = join(tempDir, "pickup-successive.db");

			await expectTaskRight(
				createTask({ type: "first", description: "First" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			await new Promise((resolve) => setTimeout(resolve, 10));

			await expectTaskRight(
				createTask({ type: "second", description: "Second" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const first = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const second = await expectTaskRight(pickupTask(undefined, dbPath));

			expect(first?.type).toBe("first");
			expect(second?.type).toBe("second");
		});

		test("filters by project path when provided", async () => {
			const dbPath = join(tempDir, "pickup-project.db");

			await expectTaskRight(
				createTask(
					{
						type: "proj-a",
						description: "Project A",
						projectPath: "/project-a",
					},
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			await expectTaskRight(
				createTask(
					{
						type: "proj-b",
						description: "Project B",
						projectPath: "/project-b",
					},
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask("/project-b", dbPath));

			expect(pickedUp).not.toBeNull();
			expect(pickedUp?.type).toBe("proj-b");
			expect(pickedUp?.projectPath).toBe("/project-b");
		});
	});

	describe("completeTask", () => {
		test("marks in_progress task as completed with result", async () => {
			const dbPath = join(tempDir, "complete-result.db");

			await expectTaskRight(
				createTask(
					{ type: "completable", description: "Will complete" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const completed = await expectTaskRight(
				completeTask(
					{ id: pickedUp!.id, result: "Task finished successfully" },
					dbPath,
				),
			);

			expect(completed.status).toBe("completed");
			expect(completed.result).toBe("Task finished successfully");
		});

		test("rejects completion of non-in_progress tasks", async () => {
			const dbPath = join(tempDir, "complete-reject.db");

			const created = await expectTaskRight(
				createTask(
					{ type: "pending-task", description: "Still pending" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const error = await expectTaskLeft(
				completeTask({ id: created.id }, dbPath),
			);

			expect(error._tag).toBe("RuntimeError");
		});
	});

	describe("failTask", () => {
		test("marks in_progress task as failed with error description", async () => {
			const dbPath = join(tempDir, "fail-result.db");

			await expectTaskRight(
				createTask({ type: "failable", description: "Will fail" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const failed = await expectTaskRight(
				failTask({ id: pickedUp!.id, result: "Network timeout" }, dbPath),
			);

			expect(failed.status).toBe("failed");
			expect(failed.result).toBe("Network timeout");
		});

		test("rejects failure of non-in_progress tasks", async () => {
			const dbPath = join(tempDir, "fail-reject.db");

			const created = await expectTaskRight(
				createTask(
					{ type: "pending-task", description: "Still pending" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const error = await expectTaskLeft(failTask({ id: created.id }, dbPath));

			expect(error._tag).toBe("RuntimeError");
		});
	});

	describe("cancelTask", () => {
		test("cancels a pending task", async () => {
			const dbPath = join(tempDir, "cancel-pending.db");

			const created = await expectTaskRight(
				createTask({ type: "cancellable", description: "Will cancel" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const cancelled = await expectTaskRight(cancelTask(created.id, dbPath));

			expect(cancelled.status).toBe("cancelled");
		});

		test("cancels an in_progress task", async () => {
			const dbPath = join(tempDir, "cancel-inprog.db");

			await expectTaskRight(
				createTask(
					{ type: "cancel-ip", description: "Cancel in progress" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			const cancelled = await expectTaskRight(cancelTask(pickedUp!.id, dbPath));

			expect(cancelled.status).toBe("cancelled");
		});

		test("rejects cancellation of completed tasks", async () => {
			const dbPath = join(tempDir, "cancel-completed.db");

			await expectTaskRight(
				createTask({ type: "done-task", description: "Already done" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			await expectTaskRight(completeTask({ id: pickedUp!.id }, dbPath));

			closeDatabase();
			resetInstance();

			const error = await expectTaskLeft(cancelTask(pickedUp!.id, dbPath));

			expect(error._tag).toBe("RuntimeError");
		});

		test("rejects cancellation of failed tasks", async () => {
			const dbPath = join(tempDir, "cancel-failed.db");

			await expectTaskRight(
				createTask(
					{ type: "failed-task", description: "Already failed" },
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const pickedUp = await expectTaskRight(pickupTask(undefined, dbPath));

			closeDatabase();
			resetInstance();

			await expectTaskRight(
				failTask({ id: pickedUp!.id, result: "Error" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const error = await expectTaskLeft(cancelTask(pickedUp!.id, dbPath));

			expect(error._tag).toBe("RuntimeError");
		});
	});

	describe("getTask", () => {
		test("returns a task by ID", async () => {
			const dbPath = join(tempDir, "get-task.db");

			const created = await expectTaskRight(
				createTask(
					{
						type: "get-test",
						description: "Get by ID",
						payload: '{"key": "value"}',
					},
					dbPath,
				),
			);

			closeDatabase();
			resetInstance();

			const fetched = await expectTaskRight(getTask(created.id, dbPath));

			expect(fetched.id).toBe(created.id);
			expect(fetched.type).toBe("get-test");
			expect(fetched.description).toBe("Get by ID");
			expect(fetched.payload).toBe('{"key": "value"}');
		});

		test("returns error for non-existent task ID", async () => {
			const dbPath = join(tempDir, "get-missing.db");

			await expectTaskRight(
				createTask({ type: "init", description: "Init db" }, dbPath),
			);

			closeDatabase();
			resetInstance();

			const error = await expectTaskLeft(getTask(99999, dbPath));

			expect(error._tag).toBe("RuntimeError");
		});
	});

	describe("migration", () => {
		test("tasks table is created with correct schema on fresh database", async () => {
			const dbPath = join(tempDir, "migration-schema.db");

			const result = await expectTaskRight(
				createTask(
					{
						type: "schema-test",
						description: "Verify schema",
						payload: '{"nested": true}',
						projectPath: "/test/path",
					},
					dbPath,
				),
			);

			expect(result.id).toBeGreaterThan(0);
			expect(result.status).toBe("pending");
			expect(result.payload).toBe('{"nested": true}');
			expect(result.projectPath).toBe("/test/path");
			expect(result.result).toBeNull();
		});
	});
});
