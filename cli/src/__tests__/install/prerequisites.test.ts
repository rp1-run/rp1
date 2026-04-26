/**
 * Unit tests for prerequisites.ts - OpenCode version checking and prerequisites.
 * Tests rp1's version comparison logic and prerequisite validation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { stat } from "node:fs/promises";
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

const originalFetch = globalThis.fetch;

describe("prerequisites", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("prereq-test");
	});

	afterEach(async () => {
		globalThis.fetch = originalFetch;
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

	describe("checkPackageManagerHealth", () => {
		test(
			"returns result with passed status (P1)",
			async () => {
				const result = await checkPackageManagerHealth()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					expect(result.right.check).toBe("package-manager-health");
					expect(result.right.passed).toBe(true);
				}
			},
			{ timeout: 35000 },
		);
	});

	describe("checkNetworkConnectivity", () => {
		test("returns result with check name (P1)", async () => {
			const result = await checkNetworkConnectivity()();

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
			const result = await checkDiskSpace(1024)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.passed).toBe(true);
			}
		});
	});

	describe("fetchLatestVersion", () => {
		test("returns version string on success", async () => {
			const result = await fetchLatestVersion()();

			if (E.isRight(result)) {
				expect(result.right).toMatch(/^\d+\.\d+\.\d+/);
			} else {
				expect(result.left._tag).toBe("PrerequisiteError");
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

					const checkNames = result.right.results.map((r) => r.check);
					expect(checkNames).toContain("package-manager-health");
					expect(checkNames).toContain("network-connectivity");
					expect(checkNames).toContain("disk-space");
				}
			},
			{ timeout: 45000 },
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
			"aggregates network failures as blockers",
			async () => {
				globalThis.fetch = (() =>
					Promise.reject(new Error("offline"))) as unknown as typeof fetch;

				const result = await runDryRunValidation()();

				expect(E.isRight(result)).toBe(true);
				if (E.isRight(result)) {
					const network = result.right.results.find(
						(r) => r.check === "network-connectivity",
					);
					expect(network?.passed).toBe(false);
					expect(network?.severity).toBe("blocker");
					expect(result.right.blockers).toContain(
						"Cannot reach GitHub API: offline",
					);
					expect(result.right.latestVersion).toBeNull();
				}
			},
			{ timeout: 45000 },
		);
	});
});
