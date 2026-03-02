/**
 * Unit tests for work status update validation.
 * Tests input validation for project path, feature name, status, and metadata.
 */

import { describe, expect, test } from "bun:test";
import {
	type UpdateCommandOptions,
	validateUpdateOptions,
} from "../../../agent-tools/work/update.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("validateUpdateOptions", () => {
	describe("project path validation (BR-002)", () => {
		test("accepts absolute paths", async () => {
			const options: UpdateCommandOptions = {
				project: "/Users/dev/myapp",
				feature: "my-feature",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.projectPath).toBe("/Users/dev/myapp");
		});

		test("rejects relative paths", async () => {
			const options: UpdateCommandOptions = {
				project: "./relative/path",
				feature: "my-feature",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("absolute");
		});

		test("rejects empty project path", async () => {
			const options: UpdateCommandOptions = {
				project: "",
				feature: "my-feature",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("required");
		});

		test("rejects whitespace-only project path", async () => {
			const options: UpdateCommandOptions = {
				project: "   ",
				feature: "my-feature",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("feature name validation (BR-003)", () => {
		test("accepts lowercase kebab-case names", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "auth-refactor",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.feature).toBe("auth-refactor");
		});

		test("accepts lowercase alphanumeric names", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "feature123",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.feature).toBe("feature123");
		});

		test("accepts single-word lowercase names", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "auth",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.feature).toBe("auth");
		});

		test("rejects uppercase letters", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "Auth-Refactor",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("^[a-z0-9-]+$");
		});

		test("rejects underscores", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "auth_refactor",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects spaces", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "auth refactor",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});

		test("rejects empty feature name", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "",
				status: "started",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("required");
		});
	});

	describe("status validation (REQ-004)", () => {
		test("accepts 'started' status", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.status).toBe("started");
		});

		test("accepts 'in_progress' status", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "in_progress",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.status).toBe("in_progress");
		});

		test("accepts 'completed' status", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "completed",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.status).toBe("completed");
		});

		test("accepts 'failed' status", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "failed",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.status).toBe("failed");
		});

		test("rejects invalid status with error listing valid values", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
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
				project: "/path/to/project",
				feature: "my-feature",
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
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				metadata: '{"key": "value", "count": 42}',
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.metadata).toBe('{"key": "value", "count": 42}');
		});

		test("accepts valid JSON array", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				metadata: '["item1", "item2"]',
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.metadata).toBe('["item1", "item2"]');
		});

		test("accepts undefined metadata", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.metadata).toBeUndefined();
		});

		test("accepts empty string metadata as undefined", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				metadata: "",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.metadata).toBeUndefined();
		});

		test("rejects invalid JSON", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				metadata: "{invalid json}",
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
			expect(getErrorMessage(error)).toContain("valid JSON");
		});

		test("rejects malformed JSON", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				metadata: '{"key": }',
			};

			const error = await expectTaskLeft(validateUpdateOptions(options));
			expect(error._tag).toBe("UsageError");
		});
	});

	describe("optional fields", () => {
		test("passes through optional step field", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				step: "T1",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.step).toBe("T1");
		});

		test("passes through optional message field", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
				message: "Working on requirements",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.message).toBe("Working on requirements");
		});

		test("handles all optional fields together", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "in_progress",
				step: "T2",
				message: "Implementing feature",
				metadata: '{"progress": 50}',
			};

			const result = await expectTaskRight(validateUpdateOptions(options));
			expect(result.projectPath).toBe("/path/to/project");
			expect(result.feature).toBe("my-feature");
			expect(result.status).toBe("in_progress");
			expect(result.step).toBe("T2");
			expect(result.message).toBe("Implementing feature");
			expect(result.metadata).toBe('{"progress": 50}');
		});
	});

	describe("output format (REQ-005)", () => {
		test("returns StatusUpdateInput shape", async () => {
			const options: UpdateCommandOptions = {
				project: "/path/to/project",
				feature: "my-feature",
				status: "started",
			};

			const result = await expectTaskRight(validateUpdateOptions(options));

			expect(result).toHaveProperty("projectPath");
			expect(result).toHaveProperty("feature");
			expect(result).toHaveProperty("status");
		});
	});
});
