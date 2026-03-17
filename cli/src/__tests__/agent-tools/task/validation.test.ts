/**
 * Unit tests for task input validation.
 * Tests validation rules enforced at the execute layer.
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

describe("task input validation", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `task-validation-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("project path validation", () => {
		test("rejects relative project path on create", async () => {
			const dbPath = join(tempDir, "val-create-path.db");

			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						projectPath: "relative/path",
					},
					dbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("absolute path");
		});

		test("rejects relative project path on list", async () => {
			const dbPath = join(tempDir, "val-list-path.db");

			const result = await expectTaskRight(
				executeList({ projectPath: "not/absolute" }, dbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("absolute path");
		});

		test("rejects relative project path on pickup", async () => {
			const dbPath = join(tempDir, "val-pickup-path.db");

			const result = await expectTaskRight(executePickup("relative", dbPath));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("absolute path");
		});

		test("accepts absolute project path on create", async () => {
			const dbPath = join(tempDir, "val-create-abs.db");

			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						projectPath: "/absolute/path",
					},
					dbPath,
				),
			);

			expect(result.success).toBe(true);
		});
	});

	describe("type and description validation", () => {
		test("rejects empty type string", async () => {
			const dbPath = join(tempDir, "val-empty-type.db");

			const result = await expectTaskRight(
				executeCreate({ type: "", description: "Valid description" }, dbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("type");
			expect(result.errors?.[0].message).toContain("non-empty");
		});

		test("rejects whitespace-only type string", async () => {
			const dbPath = join(tempDir, "val-ws-type.db");

			const result = await expectTaskRight(
				executeCreate(
					{ type: "   ", description: "Valid description" },
					dbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("non-empty");
		});

		test("rejects empty description string", async () => {
			const dbPath = join(tempDir, "val-empty-desc.db");

			const result = await expectTaskRight(
				executeCreate({ type: "valid-type", description: "" }, dbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("description");
			expect(result.errors?.[0].message).toContain("non-empty");
		});

		test("rejects whitespace-only description string", async () => {
			const dbPath = join(tempDir, "val-ws-desc.db");

			const result = await expectTaskRight(
				executeCreate({ type: "valid-type", description: "\t\n " }, dbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("non-empty");
		});
	});

	describe("payload validation", () => {
		test("rejects invalid JSON payload", async () => {
			const dbPath = join(tempDir, "val-bad-json.db");

			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						payload: "{not: valid json}",
					},
					dbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("valid JSON");
		});

		test("rejects truncated JSON payload", async () => {
			const dbPath = join(tempDir, "val-truncated-json.db");

			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						payload: '{"key": "value"',
					},
					dbPath,
				),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("valid JSON");
		});

		test("accepts valid JSON payload", async () => {
			const dbPath = join(tempDir, "val-good-json.db");

			const result = await expectTaskRight(
				executeCreate(
					{
						type: "valid",
						description: "Valid",
						payload: '{"key": "value", "nested": {"a": 1}}',
					},
					dbPath,
				),
			);

			expect(result.success).toBe(true);
		});

		test("accepts absent payload (optional field)", async () => {
			const dbPath = join(tempDir, "val-no-payload.db");

			const result = await expectTaskRight(
				executeCreate({ type: "valid", description: "Valid" }, dbPath),
			);

			expect(result.success).toBe(true);
			expect(result.data.payload).toBeNull();
		});
	});

	describe("status filter validation", () => {
		test("rejects invalid status value on list", async () => {
			const dbPath = join(tempDir, "val-bad-status.db");

			const result = await expectTaskRight(
				executeList({ status: "nonexistent" as "pending" }, dbPath),
			);

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("Invalid status");
			expect(result.errors?.[0].message).toContain("Valid values");
		});

		test("accepts all valid status values on list", async () => {
			const dbPath = join(tempDir, "val-good-status.db");

			await expectTaskRight(
				executeCreate({ type: "init", description: "Init" }, dbPath),
			);

			closeDatabase();
			resetDatabaseInstance();

			for (const status of [
				"pending",
				"in_progress",
				"completed",
				"failed",
				"cancelled",
			] as const) {
				const result = await expectTaskRight(executeList({ status }, dbPath));
				expect(result.success).toBe(true);

				closeDatabase();
				resetDatabaseInstance();
			}
		});
	});

	describe("ID validation", () => {
		test("rejects zero ID on complete", async () => {
			const result = await expectTaskRight(executeComplete({ id: 0 }));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("rejects negative ID on fail", async () => {
			const result = await expectTaskRight(executeFail({ id: -1 }));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("rejects fractional ID on cancel", async () => {
			const result = await expectTaskRight(executeCancel(1.5));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("rejects zero ID on get", async () => {
			const result = await expectTaskRight(executeGet(0));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("accepts valid positive integer ID", async () => {
			const dbPath = join(tempDir, "val-good-id.db");

			const createResult = await expectTaskRight(
				executeCreate({ type: "id-test", description: "Test" }, dbPath),
			);

			closeDatabase();
			resetDatabaseInstance();

			const getResult = await expectTaskRight(
				executeGet(createResult.data.id, dbPath),
			);

			expect(getResult.success).toBe(true);
			expect(getResult.data.id).toBe(createResult.data.id);
		});
	});

	describe("limit validation", () => {
		test("rejects zero limit", async () => {
			const result = await expectTaskRight(executeList({ limit: 0 }));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("rejects negative limit", async () => {
			const result = await expectTaskRight(executeList({ limit: -3 }));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});

		test("rejects fractional limit", async () => {
			const result = await expectTaskRight(executeList({ limit: 2.5 }));

			expect(result.success).toBe(false);
			expect(result.errors?.[0].message).toContain("positive integer");
		});
	});
});
