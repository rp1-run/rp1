import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { MARKETPLACE_NAME } from "../../../install/copilot/marketplace.js";
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

		test("rejects unknown version values", () => {
			const result = checkCopilotVersion("unknown");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("Could not determine");
				expect((result.left as { suggestion?: string }).suggestion).toContain(
					"2.74.0",
				);
			}
		});

		test("returns error for unparseable version strings", () => {
			const invalidFormats = ["", "not-a-version", "abc.def.ghi"];

			for (const format of invalidFormats) {
				const result = checkCopilotVersion(format);
				expect(E.isLeft(result)).toBe(true);
				if (E.isLeft(result)) {
					expect(getErrorMessage(result.left)).toContain("Could not parse");
					expect((result.left as { suggestion?: string }).suggestion).toContain(
						"2.74.0",
					);
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
		test("returns separated native, marketplace, and legacy path groups", () => {
			const paths = getCopilotPaths();

			expect(paths.marketplaceDir).toContain(".rp1");
			expect(paths.marketplaceDir).toContain("copilot");
			expect(paths.marketplacePluginsDir).toContain("plugins");
			expect(paths.marketplaceMetadataPath).toContain("marketplace.json");
			expect(paths.nativeInstalledPluginsDir).toContain(".copilot");
			expect(paths.nativeInstalledPluginsDir).toContain("installed-plugins");
			expect(paths.nativeMarketplaceDir).toContain(MARKETPLACE_NAME);
			expect(paths.legacySkillsDir).toContain("github-copilot");
			expect(paths.legacySkillsDir).toContain("skills");
			expect(paths.legacyAgentsDir).toContain("github-copilot");
			expect(paths.legacyAgentsDir).toContain("agents");
			expect(paths.legacyConfigDir).toContain("github-copilot");
			expect(paths.skillsDir).toBe(paths.legacySkillsDir);
			expect(paths.agentsDir).toBe(paths.legacyAgentsDir);
			expect(paths.configDir).toBe(paths.legacyConfigDir);
		});

		test("resolves paths relative to home directory", () => {
			const { homedir } = require("node:os");
			const home = homedir();
			const paths = getCopilotPaths();

			expect(paths.marketplaceDir).toStartWith(home);
			expect(paths.marketplacePluginsDir).toStartWith(home);
			expect(paths.marketplaceMetadataPath).toStartWith(home);
			expect(paths.nativeInstalledPluginsDir).toStartWith(home);
			expect(paths.nativeMarketplaceDir).toStartWith(home);
			expect(paths.legacyConfigDir).toStartWith(home);
			expect(paths.legacySkillsDir).toStartWith(home);
			expect(paths.legacyAgentsDir).toStartWith(home);
			expect(paths.skillsDir).toStartWith(home);
			expect(paths.agentsDir).toStartWith(home);
			expect(paths.configDir).toStartWith(home);
		});
	});
});
