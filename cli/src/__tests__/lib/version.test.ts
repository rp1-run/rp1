/**
 * Unit tests for the version library.
 * Tests version comparison, installed version detection, latest version fetching,
 * and the composite checkForUpdate function.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	invalidateCache,
	readCacheSync,
	type VersionCache,
	writeCache,
} from "../../lib/cache.js";
import {
	checkForUpdate,
	compareVersions,
	getInstalledVersion,
	getLatestVersion,
	stripVersionPrefix,
} from "../../lib/version.js";
import { expectTaskRight } from "../helpers/index.js";

describe("version", () => {
	describe("stripVersionPrefix", () => {
		test("removes v prefix from version string", () => {
			expect(stripVersionPrefix("v0.2.3")).toBe("0.2.3");
		});

		test("returns unchanged string if no v prefix", () => {
			expect(stripVersionPrefix("0.2.3")).toBe("0.2.3");
		});

		test("only removes leading v", () => {
			expect(stripVersionPrefix("v1.0.0-v2")).toBe("1.0.0-v2");
		});

		test("handles empty string", () => {
			expect(stripVersionPrefix("")).toBe("");
		});
	});

	describe("compareVersions", () => {
		describe("basic semver comparison", () => {
			test("detects newer version available (0.2.3 < 0.3.0)", () => {
				const result = compareVersions("0.2.3", "0.3.0");
				expect(result).toBeLessThan(0);
			});

			test("detects current version is latest (equal)", () => {
				const result = compareVersions("0.3.0", "0.3.0");
				expect(result).toBe(0);
			});

			test("detects current version is newer than latest (dev build)", () => {
				const result = compareVersions("0.4.0", "0.3.0");
				expect(result).toBeGreaterThan(0);
			});

			test("compares major versions correctly", () => {
				expect(compareVersions("1.0.0", "2.0.0")).toBeLessThan(0);
				expect(compareVersions("2.0.0", "1.0.0")).toBeGreaterThan(0);
			});

			test("compares minor versions correctly", () => {
				expect(compareVersions("1.0.0", "1.1.0")).toBeLessThan(0);
				expect(compareVersions("1.2.0", "1.1.0")).toBeGreaterThan(0);
			});

			test("compares patch versions correctly", () => {
				expect(compareVersions("1.0.0", "1.0.1")).toBeLessThan(0);
				expect(compareVersions("1.0.2", "1.0.1")).toBeGreaterThan(0);
			});

			test("handles versions with v prefix", () => {
				expect(compareVersions("v0.2.3", "v0.3.0")).toBeLessThan(0);
				expect(compareVersions("v0.3.0", "0.3.0")).toBe(0);
			});
		});

		describe("pre-release versions", () => {
			test("release version is greater than pre-release", () => {
				// 0.3.0 > 0.3.0-beta.1
				expect(compareVersions("0.3.0", "0.3.0-beta.1")).toBeGreaterThan(0);
			});

			test("pre-release version is less than release", () => {
				// 0.3.0-beta.1 < 0.3.0
				expect(compareVersions("0.3.0-beta.1", "0.3.0")).toBeLessThan(0);
			});

			test("compares pre-release identifiers alphabetically", () => {
				// alpha < beta < rc
				expect(compareVersions("0.3.0-alpha", "0.3.0-beta")).toBeLessThan(0);
				expect(compareVersions("0.3.0-beta", "0.3.0-rc")).toBeLessThan(0);
			});

			test("compares numeric pre-release identifiers", () => {
				// beta.1 < beta.2 < beta.10
				expect(compareVersions("0.3.0-beta.1", "0.3.0-beta.2")).toBeLessThan(0);
				expect(compareVersions("0.3.0-beta.2", "0.3.0-beta.10")).toBeLessThan(
					0,
				);
			});

			test("handles complex pre-release identifiers", () => {
				expect(compareVersions("1.0.0-alpha.1", "1.0.0-alpha.2")).toBeLessThan(
					0,
				);
				expect(compareVersions("1.0.0-rc.1", "1.0.0")).toBeLessThan(0);
			});

			test("equal pre-release versions are equal", () => {
				expect(compareVersions("0.3.0-beta.1", "0.3.0-beta.1")).toBe(0);
			});
		});

		describe("invalid version strings", () => {
			test("handles missing patch version", () => {
				const result = compareVersions("0.2", "0.2.0");
				expect(result).toBe(0);
			});

			test("handles missing minor and patch", () => {
				const result = compareVersions("1", "1.0.0");
				expect(result).toBe(0);
			});

			test("handles empty string as 0.0.0", () => {
				const result = compareVersions("", "0.0.0");
				expect(result).toBe(0);
			});

			test("handles non-numeric parts gracefully", () => {
				const result = compareVersions("abc.def.ghi", "0.0.0");
				expect(result).toBe(0);
			});

			test("handles malformed versions with extra dots", () => {
				const result = compareVersions("1.2.3.4.5", "1.2.3");
				expect(result).toBe(0);
			});
		});
	});

	describe("getInstalledVersion", () => {
		test("returns a version string from package.json", () => {
			const version = getInstalledVersion();

			expect(typeof version).toBe("string");
			expect(version).not.toBe("");
			expect(version === "unknown" || /^\d+\.\d+\.\d+/.test(version)).toBe(
				true,
			);
		});

		test("returns version without v prefix", () => {
			const version = getInstalledVersion();

			if (version !== "unknown") {
				expect(version.startsWith("v")).toBe(false);
			}
		});

		test("returns consistent version on multiple calls", () => {
			const version1 = getInstalledVersion();
			const version2 = getInstalledVersion();

			expect(version1).toBe(version2);
		});
	});

	describe("getLatestVersion", () => {
		beforeEach(async () => {
			await expectTaskRight(invalidateCache());
		});

		afterEach(async () => {
			await expectTaskRight(invalidateCache());
		});

		test("returns cached version when cache is valid", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "9.9.9",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v9.9.9",
					ttlHours: 24,
				}),
			);

			const result = await getLatestVersion();

			expect(result).not.toBeNull();
			expect(result?.version).toBe("9.9.9");
			expect(result?.cached).toBe(true);
			expect(result?.cacheAgeHours).not.toBeNull();
			expect(result?.cacheExpiresInHours).not.toBeNull();
		});

		test("bypasses cache when force=true", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "9.9.9",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v9.9.9",
					ttlHours: 24,
				}),
			);

			const result = await getLatestVersion({ force: true, timeoutMs: 5000 });

			if (result !== null) {
				expect(result.cached).toBe(false);
			}
		});

		test("returns null on network error with short timeout", async () => {
			const result = await getLatestVersion({ timeoutMs: 1 });

			expect(result).toBeNull();
		});

		test("updates cache after successful fetch", async () => {
			await expectTaskRight(invalidateCache());

			const result = await getLatestVersion({ force: true, timeoutMs: 5000 });

			if (result !== null && !result.cached) {
				const cache = readCacheSync();
				expect(cache).not.toBeNull();
				expect(cache?.latestVersion).toBe(result.version);
			}
		});

		test("returns cache metadata when using cached result", async () => {
			const oneHourAgo = new Date();
			oneHourAgo.setHours(oneHourAgo.getHours() - 1);

			await expectTaskRight(
				writeCache({
					latestVersion: "1.2.3",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v1.2.3",
					ttlHours: 24,
				}),
			);

			const result = await getLatestVersion();

			expect(result).not.toBeNull();
			expect(result?.cached).toBe(true);
			expect(typeof result?.cacheAgeHours).toBe("number");
			expect(typeof result?.cacheExpiresInHours).toBe("number");
			expect(result?.cacheAgeHours).toBeLessThan(0.1);
			expect(result?.cacheExpiresInHours).toBeGreaterThan(23);
		});

		test("fetches from GitHub when cache is expired", async () => {
			const expiredDate = new Date();
			expiredDate.setHours(expiredDate.getHours() - 26);

			const { writeFile, mkdir } = await import("node:fs/promises");
			const { existsSync } = await import("node:fs");
			const { join } = await import("node:path");
			const { homedir } = await import("node:os");

			const configDir = join(homedir(), ".config", "rp1");
			if (!existsSync(configDir)) {
				await mkdir(configDir, { recursive: true });
			}

			const cachePath = join(configDir, "version-cache.json");
			const expiredCache: VersionCache = {
				latestVersion: "0.0.1",
				releaseUrl: "https://example.com/old",
				checkedAt: expiredDate.toISOString(),
				ttlHours: 24,
			};
			await writeFile(cachePath, JSON.stringify(expiredCache));

			const result = await getLatestVersion({ timeoutMs: 5000 });

			if (result !== null) {
				expect(result.cached).toBe(false);
			}
		});
	});

	describe("checkForUpdate", () => {
		beforeEach(async () => {
			await expectTaskRight(invalidateCache());
		});

		afterEach(async () => {
			await expectTaskRight(invalidateCache());
		});

		test("returns complete result structure", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "99.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v99.0.0",
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate();

			expect(result).toHaveProperty("currentVersion");
			expect(result).toHaveProperty("latestVersion");
			expect(result).toHaveProperty("updateAvailable");
			expect(result).toHaveProperty("releaseUrl");
			expect(result).toHaveProperty("error");
			expect(result).toHaveProperty("cached");
			expect(result).toHaveProperty("cacheAgeHours");
			expect(result).toHaveProperty("cacheExpiresInHours");
		});

		test("detects update available when latest > current", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "99.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v99.0.0",
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate();

			expect(result.updateAvailable).toBe(true);
			expect(result.latestVersion).toBe("99.0.0");
			expect(result.error).toBeNull();
		});

		test("detects no update when current >= latest", async () => {
			const currentVersion = getInstalledVersion();

			await expectTaskRight(
				writeCache({
					latestVersion: currentVersion,
					releaseUrl: `https://github.com/rp1-run/rp1/releases/tag/v${currentVersion}`,
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate();

			expect(result.updateAvailable).toBe(false);
			expect(result.latestVersion).toBe(currentVersion);
			expect(result.error).toBeNull();
		});

		test("includes cache metadata in result", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "1.0.0",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v1.0.0",
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate();

			expect(result.cached).toBe(true);
			expect(typeof result.cacheAgeHours).toBe("number");
			expect(typeof result.cacheExpiresInHours).toBe("number");
		});

		test("includes release URL in result", async () => {
			const releaseUrl = "https://github.com/rp1-run/rp1/releases/tag/v5.0.0";
			await expectTaskRight(
				writeCache({
					latestVersion: "5.0.0",
					releaseUrl,
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate();

			expect(result.releaseUrl).toBe(releaseUrl);
		});

		test("returns error when latest version cannot be fetched", async () => {
			const result = await checkForUpdate({ timeoutMs: 1 });

			expect(result.updateAvailable).toBe(false);
			expect(result.latestVersion).toBeNull();
			expect(result.error).not.toBeNull();
			expect(result.error).toContain("Could not fetch");
		});

		test("respects force option to bypass cache", async () => {
			await expectTaskRight(
				writeCache({
					latestVersion: "9.9.9",
					releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v9.9.9",
					ttlHours: 24,
				}),
			);

			const result = await checkForUpdate({ force: true, timeoutMs: 1 });

			expect(result.cached).toBe(false);
			expect(result.latestVersion).toBeNull();
		});

		test("returns current version even when latest fetch fails", async () => {
			const result = await checkForUpdate({ timeoutMs: 1 });

			expect(result.currentVersion).toBe(getInstalledVersion());
			expect(typeof result.currentVersion).toBe("string");
		});
	});

	describe("error handling", () => {
		afterEach(async () => {
			await expectTaskRight(invalidateCache());
		});

		test("handles network timeout gracefully", async () => {
			const result = await getLatestVersion({ timeoutMs: 1 });

			expect(result).toBeNull();
		});

		test("checkForUpdate provides meaningful error on network failure", async () => {
			const result = await checkForUpdate({ timeoutMs: 1 });

			expect(result.error).not.toBeNull();
			expect(result.error?.length).toBeGreaterThan(0);
			expect(result.updateAvailable).toBe(false);
		});

		test("gracefully handles corrupted cache", async () => {
			const { writeFile, mkdir } = await import("node:fs/promises");
			const { existsSync } = await import("node:fs");
			const { join } = await import("node:path");
			const { homedir } = await import("node:os");

			const configDir = join(homedir(), ".config", "rp1");
			if (!existsSync(configDir)) {
				await mkdir(configDir, { recursive: true });
			}

			const cachePath = join(configDir, "version-cache.json");
			await writeFile(cachePath, "{ invalid json here }}}");

			const result = await getLatestVersion({ timeoutMs: 5000 });

			expect(result === null || typeof result === "object").toBe(true);
		});

		test("gracefully handles cache with missing fields", async () => {
			const { writeFile, mkdir } = await import("node:fs/promises");
			const { existsSync } = await import("node:fs");
			const { join } = await import("node:path");
			const { homedir } = await import("node:os");

			const configDir = join(homedir(), ".config", "rp1");
			if (!existsSync(configDir)) {
				await mkdir(configDir, { recursive: true });
			}

			const cachePath = join(configDir, "version-cache.json");
			await writeFile(cachePath, JSON.stringify({ latestVersion: "1.0.0" }));

			const result = await getLatestVersion({ timeoutMs: 5000 });

			expect(result === null || typeof result === "object").toBe(true);
		});
	});
});
