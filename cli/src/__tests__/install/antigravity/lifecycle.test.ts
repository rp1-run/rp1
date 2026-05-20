import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	getAntigravityManifestAsset,
	getAntigravityManifestLifecycleStatus,
	installAntigravityBundleAssets,
	loadAntigravityBundleAssetManifest,
	refreshAntigravityManifestAssets,
	uninstallAntigravityPackageAssets,
	verifyAntigravityBundleSetup,
} from "../../../install/antigravity/index.js";
import { validateAntigravityPackages } from "../../../install/antigravity/plugin-validation.js";
import {
	createAntigravityBundleAssetManifestFixture,
	createBundledAntigravityAssetsFixture,
	writeAntigravityBundleAssetManifestFixture,
} from "../../helpers/antigravity-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

const fakeAgyPath = "/usr/local/bin/agy";

const passingValidate = async () => ({
	exitCode: 0,
	stdout: "valid\n",
	stderr: "",
});

describe("Antigravity lifecycle", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-lifecycle");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("runs install, verify, update, and repeated uninstall in an isolated home", async () => {
		const assets = createAntigravityBundleAssetManifestFixture();
		const install = await expectTaskRight(
			installAntigravityBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
				getAntigravityBinaryPath: () => fakeAgyPath,
				runAgyPluginValidate: passingValidate,
			}),
		);

		expect(install.assetCount).toBe(assets.length);
		expect(install.pluginDisplayDirs).toContain(
			"~/.gemini/antigravity-cli/rp1-base",
		);
		expect(install.validation.status).toBe("passed");
		expect(install.versionMarkerWritten).toBe(true);
		await expect(
			access(join(tempDir, ".gemini/antigravity-cli/rp1-base/plugin.json")),
		).resolves.toBeNull();

		const marker = JSON.parse(
			await readFile(join(tempDir, ".rp1/platform-versions.json"), "utf-8"),
		);
		expect(marker.antigravity.platform).toBe("antigravity");

		const verified = await verifyAntigravityBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getAntigravityBinaryPath: () => fakeAgyPath,
			getAntigravityVersion: async () => "agy 1.0.0",
			runAgyPluginValidate: passingValidate,
		});
		expect(verified.status).toBe("ready");
		expect(verified.verified).toBe(true);

		const staleAsset = assets.find((asset) => asset.kind === "mcp_config");
		if (!staleAsset) throw new Error("missing mcp fixture");
		await writeFile(join(tempDir, staleAsset.relativePath), "edited", "utf-8");

		const dryRunRefresh = await expectTaskRight(
			refreshAntigravityManifestAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: assets,
			}),
		);
		expect(dryRunRefresh.initialStatus.state).toBe("stale");
		expect(
			dryRunRefresh.refreshableAssets.map((asset) => asset.kind),
		).toContain("mcp_config");

		const refreshed = await expectTaskRight(
			refreshAntigravityManifestAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
			}),
		);
		expect(refreshed.finalStatus.state).toBe("current");
		expect(refreshed.versionMarkerWritten).toBe(true);

		const uninstallPreview = await expectTaskRight(
			uninstallAntigravityPackageAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: assets,
			}),
		);
		expect(uninstallPreview.wouldRemoveFiles).toHaveLength(assets.length);

		const uninstalled = await expectTaskRight(
			uninstallAntigravityPackageAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
			}),
		);
		expect(uninstalled.inactive).toBe(true);
		expect(uninstalled.removedFiles).toHaveLength(assets.length);

		const repeated = await expectTaskRight(
			uninstallAntigravityPackageAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
			}),
		);
		expect(repeated.inactive).toBe(true);
		expect(repeated.removedFiles).toHaveLength(0);

		const afterRemoval = await expectTaskRight(
			getAntigravityManifestLifecycleStatus({
				homeDir: tempDir,
				stage: "verify",
				assetManifest: assets,
			}),
		);
		expect(afterRemoval.state).toBe("removed");
	});

	test("reports missing agy and unavailable plugin validation with next actions", async () => {
		const assets = createAntigravityBundleAssetManifestFixture();
		await writeAntigravityBundleAssetManifestFixture(tempDir, assets);

		const missingBinary = await verifyAntigravityBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getAntigravityBinaryPath: () => null,
		});
		expect(missingBinary.status).toBe("degraded_missing_binary");
		expect(missingBinary.remediation.join("\n")).toContain("agy --version");

		await expectTaskRight(
			installAntigravityBundleAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: assets,
				getAntigravityBinaryPath: () => fakeAgyPath,
				runAgyPluginValidate: passingValidate,
			}),
		);

		const unsupportedValidation = await verifyAntigravityBundleSetup({
			homeDir: tempDir,
			assetManifest: assets,
			getAntigravityBinaryPath: () => fakeAgyPath,
			getAntigravityVersion: async () => "agy 1.0.0",
			runAgyPluginValidate: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "unknown command: plugin validate",
			}),
		});
		expect(unsupportedValidation.status).toBe(
			"degraded_validation_unavailable",
		);
		expect(unsupportedValidation.issues.join("\n")).toContain(
			"agy` binary does not expose `agy plugin validate",
		);
	});

	test("loads bundled Antigravity package assets with native package destinations", async () => {
		const bundledAssets = createBundledAntigravityAssetsFixture();
		const assets = await loadAntigravityBundleAssetManifest({ bundledAssets });
		const paths = assets.map((asset) => asset.relativePath);

		expect(paths).toEqual([...paths].sort());
		expect(paths).toEqual(
			expect.arrayContaining([
				".gemini/antigravity-cli/rp1-base/plugin.json",
				".gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
				".gemini/antigravity-cli/rp1-base/skills/rp1-guide/SKILL.md",
				".gemini/antigravity-cli/rp1-base/mcp_config.json",
				".gemini/antigravity-cli/rp1-dev/agents/rp1-dev-task-builder.md",
				".gemini/antigravity-cli/rp1-dev/delegation-definitions/index.json",
			]),
		);
		const delegationDefinition = assets.find(
			(asset) => asset.kind === "delegation_definition",
		);
		expect(delegationDefinition?.expectedContent).toContain(
			"define_subagent_once_per_session",
		);

		const mcpAsset = await getAntigravityManifestAsset(
			".gemini/antigravity-cli/rp1-base/mcp_config.json",
			{ bundledAssets },
		);
		expect(mcpAsset?.kind).toBe("mcp_config");
		expect(mcpAsset?.displayPath).toBe(
			"~/.gemini/antigravity-cli/rp1-base/mcp_config.json",
		);
		await expect(
			getAntigravityManifestAsset(
				".gemini/antigravity-cli/rp1-base/missing.json",
				{ bundledAssets },
			),
		).resolves.toBeUndefined();
	});

	test("maps agy plugin validation outcomes into actionable package status", async () => {
		const missingBinary = await validateAntigravityPackages({
			pluginDirs: ["/tmp/rp1-base"],
			pluginDisplayDirs: ["~/.gemini/antigravity-cli/rp1-base"],
			getAntigravityBinaryPath: () => "",
		});
		expect(missingBinary).toMatchObject({
			status: "missing_binary",
			checked: false,
			binaryPath: null,
			issue: "Antigravity CLI was not found in PATH.",
		});

		const noPackages = await validateAntigravityPackages({
			pluginDirs: [],
			pluginDisplayDirs: [],
			getAntigravityBinaryPath: () => fakeAgyPath,
		});
		expect(noPackages).toMatchObject({
			status: "not_run",
			checked: false,
			plugins: [],
		});
		expect(noPackages.remediation).toContain("rp1 verify antigravity");

		const unsupported = await validateAntigravityPackages({
			pluginDirs: ["/tmp/rp1-base"],
			pluginDisplayDirs: ["~/.gemini/antigravity-cli/rp1-base"],
			getAntigravityBinaryPath: () => fakeAgyPath,
			runAgyPluginValidate: async () => ({
				exitCode: 1,
				stdout: "",
				stderr: "no such command: plugin validate",
			}),
		});
		expect(unsupported.status).toBe("unsupported");
		expect(unsupported.checked).toBe(false);
		expect(unsupported.plugins[0]).toMatchObject({
			pluginName: "rp1-base",
			status: "unsupported",
			command: [fakeAgyPath, "plugin", "validate", "/tmp/rp1-base"],
		});

		const failed = await validateAntigravityPackages({
			pluginDirs: ["/tmp/rp1-base", "/tmp/rp1-dev"],
			pluginDisplayDirs: [
				"~/.gemini/antigravity-cli/rp1-base",
				"~/.gemini/antigravity-cli/rp1-dev",
			],
			getAntigravityBinaryPath: () => fakeAgyPath,
			runAgyPluginValidate: async (_binary, pluginDir) =>
				pluginDir.endsWith("rp1-base")
					? { exitCode: 0, stdout: "valid", stderr: "" }
					: { exitCode: 1, stdout: "", stderr: "schema mismatch" },
		});
		expect(failed.status).toBe("failed");
		expect(failed.checked).toBe(true);
		expect(failed.plugins.map((plugin) => plugin.status)).toEqual([
			"passed",
			"failed",
		]);
		expect(failed.plugins[1]?.issue).toBe("schema mismatch");
		expect(failed.remediation).toContain("rp1 update plugins antigravity -y");
	});
});
