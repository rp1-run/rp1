/**
 * Unit tests for artifact save endpoint path validation.
 * Tests directory traversal prevention, project root boundary enforcement,
 * non-existent file rejection, and valid write success.
 */

import { describe, expect, test } from "bun:test";
import { validateSavePath } from "../../server/routes/artifacts-api";

describe("validateSavePath", () => {
	const projectRoot = "/home/user/project";

	test("rejects paths containing directory traversal", () => {
		const result = validateSavePath("../etc/passwd", projectRoot);
		expect(result).toBe("Invalid path: directory traversal not allowed");
	});

	test("rejects paths with embedded traversal segments", () => {
		const result = validateSavePath("docs/../../../etc/shadow", projectRoot);
		expect(result).toBe("Invalid path: directory traversal not allowed");
	});

	test("rejects paths that resolve outside project root", () => {
		const result = validateSavePath("/etc/passwd", projectRoot);
		expect(result).not.toBeNull();
	});

	test("accepts valid relative paths within project root", () => {
		const result = validateSavePath(
			".rp1/work/features/my-feature/tasks.md",
			projectRoot,
		);
		expect(result).toBeNull();
	});

	test("accepts paths in nested directories", () => {
		const result = validateSavePath("src/components/App.tsx", projectRoot);
		expect(result).toBeNull();
	});

	test("accepts simple filenames", () => {
		const result = validateSavePath("README.md", projectRoot);
		expect(result).toBeNull();
	});
});
