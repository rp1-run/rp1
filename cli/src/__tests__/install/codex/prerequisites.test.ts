import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	checkCodexVersion,
	checkWritePermissions,
	getCodexPaths,
} from "../../../install/codex/prerequisites.js";
import {
	cleanupTempDir,
	createTempDir,
	getErrorMessage,
} from "../../helpers/index.js";

describe("codex prerequisites", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("codex-prereq-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("checkCodexVersion", () => {
		test("accepts versions >= 0.116.0", () => {
			const validVersions = [
				"0.116.0",
				"0.116.1",
				"0.117.0",
				"0.200.0",
				"1.0.0",
				"2.0.0",
			];

			for (const version of validVersions) {
				const result = checkCodexVersion(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
				}
			}
		});

		test("rejects versions below 0.116.0", () => {
			const oldVersions = ["0.115.9", "0.110.0", "0.100.0", "0.50.0", "0.1.0"];

			for (const version of oldVersions) {
				const result = checkCodexVersion(version);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("below minimum");
					expect((result.left as { suggestion?: string }).suggestion).toContain(
						"0.116.0",
					);
				}
			}
		});

		test("handles 'unknown' version gracefully", () => {
			const result = checkCodexVersion("unknown");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
				expect(result.right.message).toContain("unknown");
			}
		});

		test("returns error for unparseable version strings", () => {
			const invalidFormats = ["not-a-version", "abc.def.ghi"];

			for (const format of invalidFormats) {
				const result = checkCodexVersion(format);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("Could not parse");
				}
			}
		});

		test("extracts version from string containing semver", () => {
			const result = checkCodexVersion("codex version 0.116.0");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.value).toBe("0.116.0");
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

	describe("getCodexPaths", () => {
		test("returns all required path fields with canonical ~/.codex/ paths", () => {
			const paths = getCodexPaths();

			expect(paths.skillsDir).toContain(".codex");
			expect(paths.skillsDir).toContain("skills");
			expect(paths.skillsDir).not.toContain(".agents");
			expect(paths.configDir).toContain(".codex");
			expect(paths.configFile).toContain("config.toml");
			expect(paths.backupDir).toContain("codex-rp1-backups");
			expect(paths.agentsDir).toContain("agents");
			expect(paths.agentsDir).toContain("rp1");
		});

		test("resolves paths relative to home directory", () => {
			const { homedir } = require("node:os");
			const home = homedir();
			const paths = getCodexPaths();

			expect(paths.skillsDir).toStartWith(home);
			expect(paths.configDir).toStartWith(home);
			expect(paths.configFile).toStartWith(home);
			expect(paths.backupDir).toStartWith(home);
			expect(paths.agentsDir).toStartWith(home);
		});
	});
});
