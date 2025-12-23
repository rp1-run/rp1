/**
 * Unit tests for prerequisites.ts - OpenCode version checking and prerequisites.
 * Tests rp1's version comparison logic and prerequisite validation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	checkOpenCodeVersion,
	checkWritePermissions,
} from "../../install/prerequisites.js";
import {
	cleanupTempDir,
	createTempDir,
	getErrorMessage,
} from "../helpers/index.js";

describe("prerequisites", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("prereq-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("checkOpenCodeVersion", () => {
		test("accepts versions >= 0.8.0", () => {
			const validVersions = [
				"opencode 0.8.0",
				"opencode 0.8.1",
				"opencode 0.9.0",
				"opencode 0.9.5",
				"opencode 1.0.0",
				"opencode 1.2.3",
				"opencode 2.0.0",
			];

			for (const version of validVersions) {
				const result = checkOpenCodeVersion(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
				}
			}
		});

		test("rejects versions < 0.8.0 with actionable error message", () => {
			const oldVersions = [
				"opencode 0.7.9",
				"opencode 0.5.0",
				"opencode 0.1.0",
			];

			for (const version of oldVersions) {
				const result = checkOpenCodeVersion(version);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("too old");
					// suggestion field contains the actionable info
					expect((result.left as { suggestion?: string }).suggestion).toContain(
						"Minimum required: 0.8.0",
					);
				}
			}
		});

		test("warns for untested versions > 0.9.x", () => {
			const newVersions = ["opencode 0.10.0", "opencode 0.11.5"];

			for (const version of newVersions) {
				const result = checkOpenCodeVersion(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
					expect(result.right.message).toContain("not tested");
					expect(result.right.message).toContain("0.9.x");
				}
			}
		});

		test("handles version string parsing (extracts last space-separated token)", () => {
			// The function splits on whitespace and takes the last token
			// This tests versions with leading text
			const formatsWithVersion = [
				{ input: "opencode 0.9.5", expectedVersion: "0.9.5" },
				{ input: "0.9.5", expectedVersion: "0.9.5" },
				{ input: "opencode CLI version 0.9.5", expectedVersion: "0.9.5" },
			];

			for (const { input, expectedVersion } of formatsWithVersion) {
				const result = checkOpenCodeVersion(input);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.value).toBe(expectedVersion);
				}
			}
		});

		test("returns error for unparseable version strings", () => {
			const invalidFormats = ["not-a-version", "opencode xyz"];

			for (const format of invalidFormats) {
				const result = checkOpenCodeVersion(format);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("Could not parse");
				}
			}
		});

		test("1.x versions are accepted without warning", () => {
			const result = checkOpenCodeVersion("opencode 1.0.0");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
				expect(result.right.message).not.toContain("not tested");
			}
		});
	});

	describe("checkWritePermissions", () => {
		test("creates test file and cleans up successfully", async () => {
			const result = await checkWritePermissions(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
				expect(result.right.message).toContain("Write permissions OK");
			}

			// Verify test file was cleaned up (no .rp1-write-test file remaining)
			const testFilePath = join(tempDir, ".rp1-write-test");
			let fileExists = true;
			try {
				await stat(testFilePath);
			} catch {
				fileExists = false;
			}
			expect(fileExists).toBe(false);
		});

		test("creates target directory if missing", async () => {
			const nestedDir = join(tempDir, "nested", "deep", "dir");
			const result = await checkWritePermissions(nestedDir)();

			expect(E.isRight(result)).toBe(true);

			// Verify directory was created
			const dirStat = await stat(nestedDir);
			expect(dirStat.isDirectory()).toBe(true);
		});

		test("returns error for unwritable directory", async () => {
			// Use an invalid path that can't be created
			const invalidPath = "/nonexistent/root/path/that/cannot/be/created";
			const result = await checkWritePermissions(invalidPath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("Cannot write");
			}
		});

		test("passes for existing writable directory", async () => {
			// Create a file in the temp dir to ensure it's already set up
			await writeFile(join(tempDir, "existing.txt"), "content");

			const result = await checkWritePermissions(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
			}
		});
	});
});
