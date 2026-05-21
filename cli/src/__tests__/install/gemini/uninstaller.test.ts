import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { uninstallGeminiExtensionAssets } from "../../../install/gemini/index.js";
import { createGeminiBundleAssetManifestFixture } from "../../helpers/gemini-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
} from "../../helpers/index.js";

const writeAsset = async (
	homeDir: string,
	relativePath: string,
	content: string,
) => {
	const targetPath = join(homeDir, relativePath);
	await mkdir(dirname(targetPath), { recursive: true });
	await writeFile(targetPath, content, "utf-8");
	return targetPath;
};

const bundleAssets = createGeminiBundleAssetManifestFixture();

const writeManifestAssets = async (homeDir: string): Promise<void> => {
	for (const asset of bundleAssets) {
		await writeAsset(homeDir, asset.relativePath, asset.expectedContent);
	}
};

const exists = async (targetPath: string): Promise<boolean> => {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
};

describe("Gemini extension uninstaller", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-uninstaller");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("dry-run previews manifest-owned files and reports unexpected leftovers", async () => {
		await writeManifestAssets(tempDir);
		const leftoverPath = await writeAsset(
			tempDir,
			".gemini/extensions/rp1-dev/agents/user-agent.md",
			"user content",
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);

		expect(result.state).toBe("current");
		expect(result.wouldRemoveFiles).toHaveLength(bundleAssets.length);
		expect(result.unexpectedLeftovers).toEqual([
			"~/.gemini/extensions/rp1-dev/agents/user-agent.md",
		]);
		expect(await readFile(leftoverPath, "utf-8")).toBe("user content");
		expect(
			await exists(join(tempDir, bundleAssets[1]?.relativePath ?? "")),
		).toBe(true);
	});

	test("removes exact manifest-owned assets and preserves unexpected leftovers", async () => {
		await writeManifestAssets(tempDir);
		const leftoverPath = await writeAsset(
			tempDir,
			".gemini/extensions/rp1-dev/agents/user-agent.md",
			"user content",
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);

		expect(result.state).toBe("removed");
		expect(result.inactive).toBe(true);
		expect(result.removedFiles).toHaveLength(bundleAssets.length);
		expect(result.unexpectedLeftovers).toEqual([
			"~/.gemini/extensions/rp1-dev/agents/user-agent.md",
		]);
		for (const asset of bundleAssets) {
			expect(await exists(join(tempDir, asset.relativePath))).toBe(false);
		}
		expect(await readFile(leftoverPath, "utf-8")).toBe("user content");
	});

	test("blocks modified manifest paths instead of treating them as rp1-owned", async () => {
		await writeManifestAssets(tempDir);
		const commandAsset = bundleAssets.find((asset) => asset.kind === "command");
		if (!commandAsset) throw new Error("bundle fixture has no command asset");
		const commandPath = await writeAsset(
			tempDir,
			commandAsset.relativePath,
			`${commandAsset.expectedContent}\n# user change\n`,
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);

		const commandStatus = result.statuses.find(
			(status) => status.asset.relativePath === commandAsset.relativePath,
		);
		expect(result.state).toBe("blocked");
		expect(result.inactive).toBe(false);
		expect(commandStatus?.result).toBe("blocked_unowned");
		expect(await readFile(commandPath, "utf-8")).toContain("# user change");
	});

	test("reports inactive when no Gemini extension assets exist", async () => {
		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
				assetManifest: bundleAssets,
			}),
		);

		expect(result.state).toBe("removed");
		expect(result.inactive).toBe(true);
		expect(result.removedFiles).toEqual([]);
		expect(
			result.statuses.every((status) => status.result === "skipped_missing"),
		).toBe(true);
		await expect(stat(join(tempDir, ".gemini/extensions"))).rejects.toThrow();
	});
});
