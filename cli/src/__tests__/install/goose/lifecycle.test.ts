import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getGooseManifestLifecycleStatus,
	installGooseBundleAssets,
	loadGooseBundleAssetManifest,
	verifyGooseBundleSetup,
} from "../../../install/goose/index.js";
import {
	createBundledGooseAssetsFixture,
	createGooseBundleAssetManifestFixture,
	writeGooseBundleDistFixture,
} from "../../helpers/goose-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

const fakeGoosePath = "/usr/local/bin/goose";

const passingCommand = async () => ({
	exitCode: 0,
	stdout: "ok\n",
	stderr: "",
});

describe("Goose lifecycle", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("goose-lifecycle");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("derives manifest-owned assets from Goose bundle assets", async () => {
		const assets = await loadGooseBundleAssetManifest({
			bundledAssets: createBundledGooseAssetsFixture(),
		});

		expect(assets.map((asset) => asset.relativePath)).toEqual(
			expect.arrayContaining([
				".agents/skills/rp1-guide/SKILL.md",
				".agents/agents/rp1-dev-task-builder.md",
				".agents/recipes/rp1-base-guide.yaml",
				".agents/plugins/rp1-base/support-metadata.json",
			]),
		);
		expect(
			assets.every(
				(asset) =>
					asset.owner === "rp1" &&
					asset.contentCheck === "exact_content" &&
					asset.safeRemovalEligible &&
					asset.lifecycleStages.includes("verify") &&
					asset.lifecycleStages.includes("uninstall"),
			),
		).toBe(true);
	});

	test("prefers targeted Goose dist assets over embedded Goose assets", async () => {
		const distDir = await writeGooseBundleDistFixture(tempDir);
		await writeFile(
			join(distDir, "base/skills/rp1-guide/SKILL.md"),
			"# Guide from dist\n",
			"utf-8",
		);

		const assets = await loadGooseBundleAssetManifest({
			distDir,
			bundledAssets: createBundledGooseAssetsFixture(),
		});

		expect(
			assets.find(
				(asset) => asset.relativePath === ".agents/skills/rp1-guide/SKILL.md",
			)?.expectedContent,
		).toBe("# Guide from dist\n");
	});

	test("runs install and verify in an isolated home", async () => {
		const assets = createGooseBundleAssetManifestFixture();
		const install = await expectTaskRight(
			installGooseBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
				getGooseBinaryPath: () => fakeGoosePath,
			}),
		);

		expect(install.assetCount).toBe(assets.length);
		expect(install.skillCount).toBe(1);
		expect(install.agentCount).toBe(1);
		expect(install.recipeCount).toBe(1);
		expect(install.metadataCount).toBe(1);
		expect(install.pluginDisplayDirs).toContain("~/.agents/plugins/rp1-base");
		expect(install.versionMarkerWritten).toBe(true);
		await expect(
			access(join(tempDir, ".agents/skills/rp1-guide/SKILL.md")),
		).resolves.toBeNull();
		await expect(
			access(join(tempDir, ".agents/agents/rp1-dev-task-builder.md")),
		).resolves.toBeNull();
		await expect(
			access(join(tempDir, ".agents/recipes/rp1-base-guide.yaml")),
		).resolves.toBeNull();

		const marker = JSON.parse(
			await readFile(join(tempDir, ".rp1/platform-versions.json"), "utf-8"),
		);
		expect(marker.goose.platform).toBe("goose");

		const verified = await verifyGooseBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getGooseBinaryPath: () => fakeGoosePath,
			getGooseVersion: async () => "goose 1.37.0",
			runGooseRecipeValidate: passingCommand,
			runGooseRecipeRender: passingCommand,
		});

		expect(verified.status).toBe("ready");
		expect(verified.verified).toBe(true);
		expect(verified.recipeCheck.status).toBe("passed");
		expect(verified.supportMetadata.status).toBe("passed");
		expect(verified.runtimeSmoke.status).toBe("not_run");
		expect(verified.issues.join("\n")).not.toContain("runtime smoke");
	});

	test("reports missing binary and stale assets with next actions", async () => {
		const assets = createGooseBundleAssetManifestFixture();
		const missingBinary = await verifyGooseBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getGooseBinaryPath: () => null,
		});
		expect(missingBinary.status).toBe("degraded_missing_binary");
		expect(missingBinary.remediation.join("\n")).toContain("goose --version");

		await expectTaskRight(
			installGooseBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
				getGooseBinaryPath: () => fakeGoosePath,
			}),
		);
		await writeFile(
			join(tempDir, ".agents/recipes/rp1-base-guide.yaml"),
			"edited",
			"utf-8",
		);

		const lifecycle = await expectTaskRight(
			getGooseManifestLifecycleStatus({
				homeDir: tempDir,
				stage: "verify",
				assetManifest: assets,
			}),
		);
		expect(lifecycle.state).toBe("stale");

		const stale = await verifyGooseBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getGooseBinaryPath: () => fakeGoosePath,
			getGooseVersion: async () => "goose 1.37.0",
			runGooseRecipeValidate: passingCommand,
			runGooseRecipeRender: passingCommand,
		});
		expect(stale.status).toBe("degraded_stale_assets");
		expect(stale.issues.join("\n")).toContain("does not match");
	});
});
