import { describe, expect, test } from "bun:test";
import { validateFilePath } from "../../server/routes/content-utils";

describe("content-utils", () => {
	describe("validateFilePath", () => {
		test("accepts canonical project section paths", () => {
			expect(validateFilePath(".rp1/context/index.md")).toBeNull();
			expect(validateFilePath(".rp1/work/features/feat-1/tasks.md")).toBeNull();
		});

		test("rejects legacy aliases for project content access", () => {
			expect(validateFilePath("context/index.md")).toBe(
				"Access denied: path outside allowed directories",
			);
			expect(validateFilePath("kb/index.md")).toBe(
				"Access denied: path outside allowed directories",
			);
			expect(validateFilePath("work/features/feat-1/tasks.md")).toBe(
				"Access denied: path outside allowed directories",
			);
		});
	});
});
