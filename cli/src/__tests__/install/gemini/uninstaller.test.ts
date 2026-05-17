import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { access, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
	GEMINI_ASSET_MANIFEST,
	GEMINI_EXTENSION_RELATIVE_DIR,
	GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
	GEMINI_SMOKE_COMMAND_TOML,
	uninstallGeminiExtensionAssets,
} from "../../../install/gemini/index.js";
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

const writeManifestAssets = async (homeDir: string): Promise<void> => {
	for (const asset of GEMINI_ASSET_MANIFEST) {
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
			`${GEMINI_EXTENSION_RELATIVE_DIR}/agents/user-agent.md`,
			"user content",
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: true,
				homeDir: tempDir,
			}),
		);

		expect(result.state).toBe("current");
		expect(result.wouldRemoveFiles).toHaveLength(GEMINI_ASSET_MANIFEST.length);
		expect(result.unexpectedLeftovers).toEqual([
			"~/.gemini/extensions/rp1-phase2-validation/agents/user-agent.md",
		]);
		expect(await readFile(leftoverPath, "utf-8")).toBe("user content");
		expect(
			await exists(join(tempDir, GEMINI_SMOKE_COMMAND_RELATIVE_PATH)),
		).toBe(true);
	});

	test("removes exact manifest-owned assets and preserves unexpected leftovers", async () => {
		await writeManifestAssets(tempDir);
		const leftoverPath = await writeAsset(
			tempDir,
			`${GEMINI_EXTENSION_RELATIVE_DIR}/agents/user-agent.md`,
			"user content",
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
			}),
		);

		expect(result.state).toBe("removed");
		expect(result.inactive).toBe(true);
		expect(result.removedFiles).toHaveLength(GEMINI_ASSET_MANIFEST.length);
		expect(result.unexpectedLeftovers).toEqual([
			"~/.gemini/extensions/rp1-phase2-validation/agents/user-agent.md",
		]);
		for (const asset of GEMINI_ASSET_MANIFEST) {
			expect(await exists(join(tempDir, asset.relativePath))).toBe(false);
		}
		expect(await readFile(leftoverPath, "utf-8")).toBe("user content");
	});

	test("blocks modified manifest paths instead of treating them as rp1-owned", async () => {
		await writeManifestAssets(tempDir);
		const smokePath = await writeAsset(
			tempDir,
			GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
			`${GEMINI_SMOKE_COMMAND_TOML}\n# user change\n`,
		);

		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
			}),
		);

		const smokeStatus = result.statuses.find(
			(status) =>
				status.asset.relativePath === GEMINI_SMOKE_COMMAND_RELATIVE_PATH,
		);
		expect(result.state).toBe("blocked");
		expect(result.inactive).toBe(false);
		expect(smokeStatus?.result).toBe("blocked_unowned");
		expect(await readFile(smokePath, "utf-8")).toContain("# user change");
	});

	test("reports inactive when no Gemini extension assets exist", async () => {
		const result = await expectTaskRight(
			uninstallGeminiExtensionAssets({
				dryRun: false,
				homeDir: tempDir,
			}),
		);

		expect(result.state).toBe("removed");
		expect(result.inactive).toBe(true);
		expect(result.removedFiles).toEqual([]);
		expect(
			result.statuses.every((status) => status.result === "skipped_missing"),
		).toBe(true);
		await expect(
			stat(join(tempDir, GEMINI_EXTENSION_RELATIVE_DIR)),
		).rejects.toThrow();
	});
});
