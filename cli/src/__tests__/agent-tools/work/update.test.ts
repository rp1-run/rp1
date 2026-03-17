/**
 * Unit tests for work status update validation.
 * Tests input validation for project path, feature name, status, and metadata.
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
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import {
	type UpdateCommandOptions,
	validateUpdateOptions,
} from "../../../agent-tools/work/update.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

/**
 * Base valid options that satisfy all required fields.
 * Tests override specific fields to test their validation.
 */
const validBase: UpdateCommandOptions = {
	project: "/path/to/project",
	feature: "my-feature",
	status: "started",
	workflow: "build",
	step: "requirements",
};

describe("validateUpdateOptions", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `work-update-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-update.db");
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("project path validation (BR-002)", () => {
		test("accepts absolute paths", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				project: "/Users/dev/myapp",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.projectPath).toBe("/Users/dev/myapp");
		});

		test("rejects relative paths", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				project: "./relative/path",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("absolute");
		});

		test("rejects empty project path", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				project: "",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("required");
		});

		test("rejects whitespace-only project path", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				project: "   ",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("feature name validation (BR-003)", () => {
		test("accepts lowercase kebab-case names", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "auth-refactor",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.feature).toBe("auth-refactor");
		});

		test("accepts lowercase alphanumeric names", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "feature123",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.feature).toBe("feature123");
		});

		test("accepts single-word lowercase names", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "auth",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.feature).toBe("auth");
		});

		test("rejects uppercase letters", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "Auth-Refactor",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("^[a-z0-9-]+$");
		});

		test("rejects underscores", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "auth_refactor",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects spaces", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "auth refactor",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects empty feature name", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				feature: "",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("required");
		});
	});

	describe("status validation (REQ-004)", () => {
		test("accepts 'started' status", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "started",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.status).toBe("started");
		});

		test("accepts 'in_progress' status", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "in_progress",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.status).toBe("in_progress");
		});

		test("accepts 'completed' status", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "completed",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.status).toBe("completed");
		});

		test("accepts 'failed' status", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "failed",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.status).toBe("failed");
		});

		test("rejects invalid status with error listing valid values", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "pending",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("started");
			expect(getErrorMessage(error)).toContain("in_progress");
			expect(getErrorMessage(error)).toContain("completed");
			expect(getErrorMessage(error)).toContain("failed");
		});

		test("rejects empty status", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				status: "",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("required");
		});
	});

	describe("metadata validation (REQ-006)", () => {
		test("accepts valid JSON object", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				metadata: '{"key": "value", "count": 42}',
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.metadata).toBe('{"key": "value", "count": 42}');
		});

		test("accepts valid JSON array", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				metadata: '["item1", "item2"]',
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.metadata).toBe('["item1", "item2"]');
		});

		test("accepts undefined metadata", async () => {
			const result = await expectTaskRight(
				validateUpdateOptions(validBase, testDbPath),
			);
			expect(result.metadata).toBeUndefined();
		});

		test("accepts empty string metadata as undefined", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				metadata: "",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.metadata).toBeUndefined();
		});

		test("rejects invalid JSON", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				metadata: "{invalid json}",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("valid JSON");
		});

		test("rejects malformed JSON", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				metadata: '{"key": }',
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("workflow and step required", () => {
		test("rejects missing workflow and step", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			const msg = getErrorMessage(error);
			expect(msg).toContain("--workflow and --step are required");
			expect(msg).toContain("STATE-MACHINE");
		});

		test("passes through message field with workflow and step", async () => {
			const options: UpdateCommandOptions = {
				...validBase,
				message: "Working on requirements",
			};

			const result = await expectTaskRight(
				validateUpdateOptions(options, testDbPath),
			);
			expect(result.message).toBe("Working on requirements");
		});
	});

	describe("output format (REQ-005)", () => {
		test("returns StatusUpdateInput shape", async () => {
			const result = await expectTaskRight(
				validateUpdateOptions(validBase, testDbPath),
			);

			expect(result).toHaveProperty("projectPath");
			expect(result).toHaveProperty("feature");
			expect(result).toHaveProperty("status");
			expect(result).toHaveProperty("step");
			expect(result).toHaveProperty("workflow");
		});
	});
});
