import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	checkCopilotVersion,
	checkWritePermissions,
	getCopilotPaths,
} from "../../../install/copilot/prerequisites.js";
import {
	cleanupTempDir,
	createTempDir,
	getErrorMessage,
} from "../../helpers/index.js";

describe("copilot prerequisites", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("copilot-prereq-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("checkCopilotVersion", () => {
		test("accepts versions >= 2.74.0", () => {
			const validVersions = ["2.74.0", "2.74.1", "2.75.0", "2.100.0", "3.0.0"];

			for (const version of validVersions) {
				const result = checkCopilotVersion(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
				}
			}
		});

		test("rejects versions below 2.74.0", () => {
			const oldVersions = ["2.73.9", "2.73.0", "2.50.0", "1.0.0", "0.1.0"];

			for (const version of oldVersions) {
				const result = checkCopilotVersion(version);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("below minimum");
					expect((result.left as { suggestion?: string }).suggestion).toContain(
						"2.74.0",
					);
				}
			}
		});

		test("handles 'unknown' version gracefully", () => {
			const result = checkCopilotVersion("unknown");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
				expect(result.right.message).toContain("unknown");
			}
		});

		test("returns error for unparseable version strings", () => {
			const invalidFormats = ["not-a-version", "abc.def.ghi"];

			for (const format of invalidFormats) {
				const result = checkCopilotVersion(format);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("Could not parse");
				}
			}
		});

		test("extracts version from string containing semver", () => {
			const result = checkCopilotVersion("gh version 2.74.0 (2026-01-15)");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.value).toBe("2.74.0");
			}
		});
	});

	describe("checkWritePermissions", () => {
		test("succeeds for writable directory", async () => {
			const result = await checkWritePermissions(tempDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
				expect(result.right.message).toContain("Write permissions OK");
			}
		});

		test("creates target directory if missing", async () => {
			const { stat } = await import("node:fs/promises");
			const nestedDir = join(tempDir, "nested", "deep", "dir");
			const result = await checkWritePermissions(nestedDir)();

			expect(E.isRight(result)).toBe(true);

			const dirStat = await stat(nestedDir);
			expect(dirStat.isDirectory()).toBe(true);
		});

		test("returns error for unwritable directory", async () => {
			const invalidPath = "/nonexistent/root/path/that/cannot/be/created";
			const result = await checkWritePermissions(invalidPath)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("Cannot write");
			}
		});
	});

	describe("getCopilotPaths", () => {
		test("returns all required path fields with canonical ~/.config/github-copilot/ paths", () => {
			const paths = getCopilotPaths();

			expect(paths.skillsDir).toContain("github-copilot");
			expect(paths.skillsDir).toContain("skills");
			expect(paths.agentsDir).toContain("github-copilot");
			expect(paths.agentsDir).toContain("agents");
			expect(paths.configDir).toContain("github-copilot");
			expect(paths.backupDir).toContain("github-copilot-rp1-backups");
		});

		test("resolves paths relative to home directory", () => {
			const { homedir } = require("node:os");
			const home = homedir();
			const paths = getCopilotPaths();

			expect(paths.skillsDir).toStartWith(home);
			expect(paths.agentsDir).toStartWith(home);
			expect(paths.configDir).toStartWith(home);
			expect(paths.backupDir).toStartWith(home);
		});
	});
});
