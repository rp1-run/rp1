/**
 * Tests for Antigravity active plugin registry synchronization.
 * Covers current (`~/.gemini/config/plugins/`) vs legacy
 * (`~/.gemini/antigravity-cli/plugins/`) registry precedence, missing-asset
 * drift within the authoritative registry, and the update-flow drift sync.
 */

import { describe, expect, test } from "bun:test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncAntigravityActivePlugins } from "../../../install/antigravity/index.js";
import { createAntigravityBundleAssetManifestFixture } from "../../helpers/antigravity-bundle.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const CURRENT_REGISTRY_ROOT = ".gemini/config/plugins";
const LEGACY_REGISTRY_ROOT = ".gemini/antigravity-cli/plugins";

const bundleAssets = createAntigravityBundleAssetManifestFixture();

const commandAsset = bundleAssets.find((asset) => asset.kind === "command");
if (!commandAsset) throw new Error("Fixture is missing a command asset");

const registrySuffixFor = (relativePath: string): string =>
	relativePath.replace(/^\.gemini\/antigravity-cli\//, "");

const activePathFor = (
	homeDir: string,
	registryRoot: string,
	relativePath: string = commandAsset.relativePath,
): string => join(homeDir, registryRoot, registrySuffixFor(relativePath));

const writeActiveAsset = async (path: string, content: string) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf-8");
};

const writeActiveRegistry = async (
	homeDir: string,
	registryRoot: string,
	overrides: Readonly<Record<string, string>> = {},
) => {
	for (const asset of bundleAssets) {
		const suffix = registrySuffixFor(asset.relativePath);
		await writeActiveAsset(
			join(homeDir, registryRoot, suffix),
			overrides[suffix] ?? asset.expectedContent,
		);
	}
};

describe("syncAntigravityActivePlugins", () => {
	test("reports no drift when no active registry exists", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-none");
		try {
			const result = await syncAntigravityActivePlugins({
				dryRun: false,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(result).toEqual({
				driftDetected: false,
				driftIssue: null,
				install: null,
			});
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("prefers the current registry over a stale legacy leftover", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-current");
		try {
			await writeActiveRegistry(homeDir, CURRENT_REGISTRY_ROOT);
			await writeActiveAsset(
				activePathFor(homeDir, LEGACY_REGISTRY_ROOT),
				"stale legacy content",
			);

			const result = await syncAntigravityActivePlugins({
				dryRun: false,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(result.driftDetected).toBe(false);
			expect(result.install).toBeNull();
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("detects drift in the current registry and reimports plugins", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-drift");
		try {
			const driftedSuffix = registrySuffixFor(commandAsset.relativePath);
			await writeActiveRegistry(homeDir, CURRENT_REGISTRY_ROOT, {
				[driftedSuffix]: "drifted content",
			});

			const installedDirs: string[] = [];
			const result = await syncAntigravityActivePlugins({
				dryRun: false,
				homeDir,
				assetManifest: bundleAssets,
				getAntigravityBinaryPath: () => "/usr/local/bin/agy",
				runAgyPluginInstall: async (_binaryPath, pluginDir) => {
					installedDirs.push(pluginDir);
					return { exitCode: 0, stdout: "ok", stderr: "" };
				},
			});

			expect(result.driftDetected).toBe(true);
			expect(result.driftIssue).toContain(
				".gemini/config/plugins/rp1-base/commands/rp1-base/guide.toml",
			);
			expect(result.driftIssue).toContain("does not match");
			expect(result.install?.status).toBe("passed");
			expect(installedDirs).toEqual(
				expect.arrayContaining([
					join(homeDir, ".gemini/antigravity-cli/rp1-base"),
					join(homeDir, ".gemini/antigravity-cli/rp1-dev"),
				]),
			);
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("treats an asset missing from the authoritative registry as drift", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-missing");
		try {
			await writeActiveRegistry(homeDir, CURRENT_REGISTRY_ROOT);
			await rm(activePathFor(homeDir, CURRENT_REGISTRY_ROOT));
			// A complete legacy copy must not mask the missing current asset.
			await writeActiveRegistry(homeDir, LEGACY_REGISTRY_ROOT);

			const result = await syncAntigravityActivePlugins({
				dryRun: true,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(result.driftDetected).toBe(true);
			expect(result.driftIssue).toContain(
				".gemini/config/plugins/rp1-base/commands/rp1-base/guide.toml",
			);
			expect(result.driftIssue).toContain("is missing");
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("detects legacy-only drift when no current registry exists", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-legacy");
		try {
			const driftedSuffix = registrySuffixFor(commandAsset.relativePath);
			await writeActiveRegistry(homeDir, LEGACY_REGISTRY_ROOT, {
				[driftedSuffix]: "stale legacy content",
			});

			const result = await syncAntigravityActivePlugins({
				dryRun: true,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(result.driftDetected).toBe(true);
			expect(result.driftIssue).toContain(
				".gemini/antigravity-cli/plugins/rp1-base/commands/rp1-base/guide.toml",
			);
			expect(result.install).toBeNull();
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("honors an injected binary resolver that returns null", async () => {
		const homeDir = await createTempDir(
			"antigravity-active-registry-no-binary",
		);
		try {
			const driftedSuffix = registrySuffixFor(commandAsset.relativePath);
			await writeActiveRegistry(homeDir, CURRENT_REGISTRY_ROOT, {
				[driftedSuffix]: "drifted content",
			});

			const result = await syncAntigravityActivePlugins({
				dryRun: false,
				homeDir,
				assetManifest: bundleAssets,
				getAntigravityBinaryPath: () => null,
				runAgyPluginInstall: async () => {
					throw new Error("must not be invoked without a binary");
				},
			});

			expect(result.driftDetected).toBe(true);
			expect(result.install?.status).toBe("missing_binary");
		} finally {
			await cleanupTempDir(homeDir);
		}
	});

	test("reads the current import manifest before the legacy one", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-manifest");
		try {
			const legacyManifestPath = join(
				homeDir,
				".gemini/antigravity-cli/import_manifest.json",
			);
			await writeActiveAsset(
				legacyManifestPath,
				JSON.stringify({
					imports: [{ name: "rp1-base", source: "gemini-cli" }],
				}),
			);

			const legacyOnly = await syncAntigravityActivePlugins({
				dryRun: true,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(legacyOnly.driftDetected).toBe(true);
			expect(legacyOnly.driftIssue).toContain("Gemini CLI");

			await writeActiveAsset(
				join(homeDir, ".gemini/config/import_manifest.json"),
				JSON.stringify({
					imports: [{ name: "rp1-base", source: "antigravity" }],
				}),
			);
			const currentWins = await syncAntigravityActivePlugins({
				dryRun: true,
				homeDir,
				assetManifest: bundleAssets,
			});
			expect(currentWins.driftDetected).toBe(false);
		} finally {
			await cleanupTempDir(homeDir);
		}
	});
});
