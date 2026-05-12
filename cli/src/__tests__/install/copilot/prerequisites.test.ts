import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { MARKETPLACE_NAME } from "../../../install/copilot/marketplace.js";
import {
	checkCopilotPluginSupport,
	checkCopilotVersion,
	checkWritePermissions,
	getCopilotPaths,
} from "../../../install/copilot/prerequisites.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	getErrorMessage,
	installFakeCopilotCli,
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
		test("accepts parseable Copilot CLI versions", () => {
			const validVersions = ["0.0.1", "0.1.0", "1.0.0", "2.100.0", "3.0.0"];

			for (const version of validVersions) {
				const result = checkCopilotVersion(version);
				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.passed).toBe(true);
				}
			}
		});

		test("rejects unknown version values", () => {
			const result = checkCopilotVersion("unknown");
			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(getErrorMessage(result.left)).toContain("Could not determine");
				expect((result.left as { suggestion?: string }).suggestion).toContain(
					"copilot version",
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
						"copilot version",
					);
				}
			}
		});

		test("extracts version from string containing semver", () => {
			const result = checkCopilotVersion("copilot version 1.2.3");
			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.value).toBe("1.2.3");
			}
		});
	});

	describe("checkCopilotPluginSupport", () => {
		test("fails with standalone Copilot CLI repair guidance when plugin lifecycle is unavailable", async () => {
			const fakeCopilot = await installFakeCopilotCli(tempDir, {
				pluginHelpExitCode: 1,
			});

			try {
				const error = await expectTaskLeft(checkCopilotPluginSupport());

				expect(getErrorMessage(error)).toContain(
					"plugin lifecycle commands are unavailable",
				);
				expect((error as { suggestion?: string }).suggestion).toContain(
					"copilot version",
				);
				expect((error as { suggestion?: string }).suggestion).toContain(
					"copilot plugin --help",
				);
				expect((error as { suggestion?: string }).suggestion).not.toContain(
					"github/" + "gh-copilot",
				);
			} finally {
				fakeCopilot.restore();
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
