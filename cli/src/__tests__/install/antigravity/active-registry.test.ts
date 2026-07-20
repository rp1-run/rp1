/**
 * Tests for Antigravity active plugin registry synchronization.
 * Covers current (`~/.gemini/config/plugins/`) vs legacy
 * (`~/.gemini/antigravity-cli/plugins/`) registry precedence and the
 * update-flow drift sync.
 */

import { describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { syncAntigravityActivePlugins } from "../../../install/antigravity/index.js";
import { createAntigravityBundleAssetManifestFixture } from "../../helpers/antigravity-bundle.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

const bundleAssets = createAntigravityBundleAssetManifestFixture();

const commandAsset = bundleAssets.find((asset) => asset.kind === "command");
if (!commandAsset) throw new Error("Fixture is missing a command asset");

const activePathFor = (
	homeDir: string,
	registryRoot: ".gemini/config/plugins" | ".gemini/antigravity-cli/plugins",
): string =>
	join(
		homeDir,
		registryRoot,
		commandAsset.relativePath.replace(/^\.gemini\/antigravity-cli\//, ""),
	);

const writeActiveAsset = async (path: string, content: string) => {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, content, "utf-8");
};

describe("syncAntigravityActivePlugins", () => {
	test("reports no drift when no active registry copies exist", async () => {
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
			await writeActiveAsset(
				activePathFor(homeDir, ".gemini/config/plugins"),
				commandAsset.expectedContent,
			);
			await writeActiveAsset(
				activePathFor(homeDir, ".gemini/antigravity-cli/plugins"),
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
			await writeActiveAsset(
				activePathFor(homeDir, ".gemini/config/plugins"),
				"drifted content",
			);

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

	test("detects legacy-only drift when no current registry exists", async () => {
		const homeDir = await createTempDir("antigravity-active-registry-legacy");
		try {
			await writeActiveAsset(
				activePathFor(homeDir, ".gemini/antigravity-cli/plugins"),
				"stale legacy content",
			);

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
