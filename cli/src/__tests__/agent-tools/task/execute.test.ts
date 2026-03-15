/**
 * Unit tests for task queue execute functions.
 * Tests ToolResult wrapping, validation-to-database flow, and error handling.
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
	executeCancel,
	executeComplete,
	executeCreate,
	executeFail,
	executeGet,
	executeList,
	executePickup,
} from "../../../agent-tools/task/index.js";
import {
	closeDatabase,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("task execute functions", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `task-exec-test-${Date.now()}`);
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

	describe("executeCreate", () => {
		test("returns successful ToolResult with created task", async () => {
			const result = await expectTaskRight(
				executeCreate(
					{
						type: "check-annotations",
						description: "Review annotations",
					},
					testDbPath,
				),
			);

			expect(result.success).toBe(true);
			expect(result.tool).toBe("task");
			expect(result.data.type).toBe("check-annotations");
			expect(result.data.status).toBe("pending");
		});

		test("returns error ToolResult for empty type", async () => {
			const result = await expectTaskRight(
				executeCreate(
					{ type: "", description: "Valid description" },
					testDbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors).toBeDefined();
			expect(result.errors![0].message).toContain("non-empty");
		});

		test("returns error ToolResult for empty description", async () => {
			const result = await expectTaskRight(
				executeCreate({ type: "valid-type", description: "  " }, testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("non-empty");
		});

		test("returns error ToolResult for invalid JSON payload", async () => {
			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						payload: "not valid json {",
					},
					testDbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("valid JSON");
		});

		test("returns error ToolResult for non-absolute project path", async () => {
			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						projectPath: "relative/path",
					},
					testDbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("absolute path");
		});
	});

	describe("executeList", () => {
		test("returns successful ToolResult with filtered results", async () => {
			const dbPath = join(tempDir, "exec-list.db");

			await expectTaskRight(
				executeCreate({ type: "list-test", description: "A task" }, dbPath),
			);

			closeDatabase();
			resetDatabaseInstance();

			const result = await expectTaskRight(
				executeList({ status: "pending" }, dbPath),
			);

			expect(result.success).toBe(true);
			expect(result.tool).toBe("task");
			expect(result.data.length).toBeGreaterThanOrEqual(1);
		});

		test("returns error ToolResult for invalid status filter", async () => {
			const result = await expectTaskRight(
				executeList({ status: "bogus" as "pending" }, testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("Invalid status");
		});

		test("returns error ToolResult for non-absolute project path", async () => {
			const result = await expectTaskRight(
				executeList({ projectPath: "relative" }, testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("absolute path");
		});

		test("returns error ToolResult for non-positive limit", async () => {
			const result = await expectTaskRight(
				executeList({ limit: 0 }, testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("positive integer");
		});
	});

	describe("executePickup", () => {
		test("returns null data when queue is empty", async () => {
			const dbPath = join(tempDir, "exec-pickup-empty.db");

			await expectTaskRight(
				executeCreate({ type: "init", description: "Init" }, dbPath),
			);

			closeDatabase();
			resetDatabaseInstance();

			await expectTaskRight(executePickup(undefined, dbPath));

			closeDatabase();
			resetDatabaseInstance();

			const result = await expectTaskRight(executePickup(undefined, dbPath));

			expect(result.success).toBe(true);
			expect(result.data).toBeNull();
		});

		test("returns picked up task with in_progress status", async () => {
			const dbPath = join(tempDir, "exec-pickup-success.db");

			await expectTaskRight(
				executeCreate(
					{ type: "pickup-test", description: "Pick me up" },
					dbPath,
				),
			);

			closeDatabase();
			resetDatabaseInstance();

			const result = await expectTaskRight(executePickup(undefined, dbPath));

			expect(result.success).toBe(true);
			expect(result.data).not.toBeNull();
			expect(result.data!.status).toBe("in_progress");
		});

		test("returns error ToolResult for non-absolute project path", async () => {
			const result = await expectTaskRight(
				executePickup("relative/path", testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("absolute path");
		});
	});

	describe("executeComplete", () => {
		test("stores result summary on completed task", async () => {
			const dbPath = join(tempDir, "exec-complete.db");

			const createResult = await expectTaskRight(
				executeCreate(
					{ type: "complete-test", description: "Complete me" },
					dbPath,
				),
			);

			closeDatabase();
			resetDatabaseInstance();

			await expectTaskRight(executePickup(undefined, dbPath));

			closeDatabase();
			resetDatabaseInstance();

			const result = await expectTaskRight(
				executeComplete(
					{
						id: createResult.data.id,
						result: "All checks passed",
					},
					dbPath,
				),
			);

			expect(result.success).toBe(true);
			expect(result.data.status).toBe("completed");
			expect(result.data.result).toBe("All checks passed");
		});

		test("returns error ToolResult for non-positive ID", async () => {
			const result = await expectTaskRight(
				executeComplete({ id: -1 }, testDbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("positive integer");
		});
	});

	describe("executeFail", () => {
		test("stores error description on failed task", async () => {
			const dbPath = join(tempDir, "exec-fail.db");

			const createResult = await expectTaskRight(
				executeCreate({ type: "fail-test", description: "Fail me" }, dbPath),
			);

			closeDatabase();
			resetDatabaseInstance();

			await expectTaskRight(executePickup(undefined, dbPath));

			closeDatabase();
			resetDatabaseInstance();

			const result = await expectTaskRight(
				executeFail(
					{
						id: createResult.data.id,
						result: "Timeout after 30s",
					},
					dbPath,
				),
			);

			expect(result.success).toBe(true);
			expect(result.data.status).toBe("failed");
			expect(result.data.result).toBe("Timeout after 30s");
		});

		test("returns error ToolResult for non-positive ID", async () => {
			const result = await expectTaskRight(executeFail({ id: 0 }, testDbPath));

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("positive integer");
		});
	});

	describe("executeCancel", () => {
		test("returns error ToolResult for non-positive ID", async () => {
			const result = await expectTaskRight(executeCancel(-5, testDbPath));

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("positive integer");
		});
	});

	describe("executeGet", () => {
		test("returns error ToolResult for non-positive ID", async () => {
			const result = await expectTaskRight(executeGet(0, testDbPath));

			expect(result.success).toBe(false);
			expect(result.errors![0].message).toContain("positive integer");
		});
	});

	describe("invalid state transitions produce error ToolResult", () => {
		test("completing a pending task produces CLIError", async () => {
			const dbPath = join(tempDir, "exec-invalid-complete.db");

			const createResult = await expectTaskRight(
				executeCreate(
					{ type: "pending", description: "Still pending" },
					dbPath,
				),
			);

			closeDatabase();
			resetDatabaseInstance();

			const error = await (async () => {
				const te = executeComplete({ id: createResult.data.id }, dbPath);
				const either = await te();
				if (either._tag === "Left") {
					return either.left;
				}
				return null;
			})();

			expect(error).not.toBeNull();
			expect(error!._tag).toBe("RuntimeError");
		});
	});
});
