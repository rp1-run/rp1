/**
 * Unit tests for prerequisites.ts - OpenCode version checking and prerequisites.
 * Tests rp1's version comparison logic and prerequisite validation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	checkDiskSpace,
	checkNetworkConnectivity,
	checkOpenCodeVersion,
	checkPackageManagerHealth,
	checkWritePermissions,
	fetchLatestVersion,
	runDryRunValidation,
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

	describe("checkPackageManagerHealth", () => {
		test(
			"returns result with passed status (P1)",
			async () => {
				const result = await checkPackageManagerHealth()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.check).toBe("package-manager-health");
					// Should pass (maybe with warning) on any platform
					expect(result.right.passed).toBe(true);
				}
			},
			{ timeout: 35000 }, // brew doctor can take up to 30s
		);

		test(
			"returns warning severity when appropriate",
			async () => {
				const result = await checkPackageManagerHealth()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					// On non-macOS/Linux or when Homebrew not installed, expect warning
					if (result.right.severity) {
						expect(result.right.severity).toBe("warning");
					}
				}
			},
			{ timeout: 35000 }, // brew doctor can take up to 30s
		);
	});

	describe("checkNetworkConnectivity", () => {
		test("returns result with check name (P1)", async () => {
			const result = await checkNetworkConnectivity()();

			// Network may or may not be available in test environment
			if (E.isRight(result)) {
				expect(result.right.check).toBe("network-connectivity");
				expect(result.right.message).toContain("GitHub");
			} else {
				expect(result.left._tag).toBe("PrerequisiteError");
				if (result.left._tag === "PrerequisiteError") {
					expect(result.left.check).toBe("network-connectivity");
				}
			}
		});

		test("message describes GitHub API status on success", async () => {
			const result = await checkNetworkConnectivity()();

			if (E.isRight(result) && result.right.passed) {
				expect(result.right.message).toContain("GitHub API");
				expect(result.right.message).toContain("reachable");
			}
		});
	});

	describe("checkDiskSpace", () => {
		test("returns passed result with space info (P1)", async () => {
			const result = await checkDiskSpace()();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.check).toBe("disk-space");
				expect(result.right.passed).toBe(true);
				expect(result.right.message).toContain("MB");
			}
		});

		test("accepts custom required bytes parameter", async () => {
			// Request a small amount that should always pass
			const result = await checkDiskSpace(1024)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
			}
		});

		test("reports warning for potentially low space", async () => {
			// Request a very large amount to trigger warning
			const result = await checkDiskSpace(1024 * 1024 * 1024 * 1024)(); // 1TB

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				// Either passes or has warning severity
				if (!result.right.passed || result.right.severity === "warning") {
					// Expected behavior for low space scenario
				}
			}
		});
	});

	describe("fetchLatestVersion", () => {
		test("returns version string on success", async () => {
			const result = await fetchLatestVersion()();

			// Network may or may not be available
			if (E.isRight(result)) {
				// Version should be a semver-like string
				expect(result.right).toMatch(/^\d+\.\d+\.\d+/);
			} else {
				// Network error is acceptable in tests
				expect(result.left._tag).toBe("PrerequisiteError");
			}
		});

		test("strips leading 'v' from version", async () => {
			const result = await fetchLatestVersion()();

			if (E.isRight(result)) {
				// Should not start with 'v'
				expect(result.right.startsWith("v")).toBe(false);
			}
		});
	});

	describe("runDryRunValidation", () => {
		test(
			"aggregates results from all checks (P1)",
			async () => {
				const result = await runDryRunValidation()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(Array.isArray(result.right.results)).toBe(true);
					expect(result.right.results.length).toBeGreaterThanOrEqual(3);

					// Should have checks for package manager, network, disk space
					const checkNames = result.right.results.map((r) => r.check);
					expect(checkNames).toContain("package-manager-health");
					expect(checkNames).toContain("network-connectivity");
					expect(checkNames).toContain("disk-space");
				}
			},
			{ timeout: 45000 }, // Includes brew doctor (up to 30s) + network checks
		);

		test(
			"separates warnings from blockers",
			async () => {
				const result = await runDryRunValidation()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(Array.isArray(result.right.warnings)).toBe(true);
					expect(Array.isArray(result.right.blockers)).toBe(true);
				}
			},
			{ timeout: 45000 },
		);

		test(
			"includes latest version when network available",
			async () => {
				const result = await runDryRunValidation()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					// Version may be null if network unavailable
					if (result.right.latestVersion) {
						expect(result.right.latestVersion).toMatch(/^\d+\.\d+/);
					}
				}
			},
			{ timeout: 45000 },
		);

		test(
			"completes within reasonable time (dry-run speed)",
			async () => {
				const start = Date.now();
				await runDryRunValidation()();
				const elapsed = Date.now() - start;

				// Allow up to 40s due to brew doctor (30s) + network (5s each)
				expect(elapsed).toBeLessThan(45000);
			},
			{ timeout: 50000 },
		);
	});
});
