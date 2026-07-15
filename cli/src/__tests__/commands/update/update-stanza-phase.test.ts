import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	manageGlobalStanzaPhase,
	resolveStanzaHarnesses,
} from "../../../commands/update/index.js";
import { hasFencedContent } from "../../../init/comment-fence.js";
import { writeGlobalStanza } from "../../../init/global-stanza-writer.js";
import { resetSettingsCache } from "../../../settings/loader.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

function writeSettingsToml(dir: string, content: string): string {
	mkdirSync(dir, { recursive: true });
	const filePath = join(dir, "settings.toml");
	writeFileSync(filePath, content, "utf-8");
	return filePath;
}

describe("resolveStanzaHarnesses", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("update-stanza-resolve-");
		resetSettingsCache();
	});

	afterEach(async () => {
		resetSettingsCache();
		await cleanupTempDir(tempDir);
	});

	test("returns persisted source for existing [harnesses] section", async () => {
		const settingsPath = writeSettingsToml(
			join(tempDir, ".config", "rp1"),
			'[harnesses]\nenabled = ["claude-code", "opencode"]\n',
		);

		const result = await resolveStanzaHarnesses(settingsPath);

		expect(result.source).toBe("persisted");
		expect(result.selection).toEqual(["claude-code", "opencode"]);
	});

	test("returns persisted source even when enabled is empty", async () => {
		const settingsPath = writeSettingsToml(
			join(tempDir, ".config", "rp1"),
			"[harnesses]\nenabled = []\n",
		);

		const result = await resolveStanzaHarnesses(settingsPath);

		expect(result.source).toBe("persisted");
		expect(result.selection).toEqual([]);
	});

	test("returns none when settings file does not exist", async () => {
		const settingsPath = join(tempDir, "nonexistent", "settings.toml");

		const result = await resolveStanzaHarnesses(settingsPath);

		expect(result.source).not.toBe("persisted");
	});
});

describe("manageGlobalStanzaPhase integration", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("update-stanza-phase-");
		resetSettingsCache();
	});

	afterEach(async () => {
		resetSettingsCache();
		await cleanupTempDir(tempDir);
	});

	test("persisted selection writes stanzas to temp homeDir", async () => {
		writeSettingsToml(
			join(tempDir, ".config", "rp1"),
			'[harnesses]\nenabled = ["claude-code"]\n',
		);

		const homeDir = join(tempDir, "home");
		mkdirSync(homeDir, { recursive: true });

		await writeGlobalStanza("claude-code", homeDir);

		const claudeMdPath = join(homeDir, ".claude", "CLAUDE.md");
		expect(existsSync(claudeMdPath)).toBe(true);
		const content = readFileSync(claudeMdPath, "utf-8");
		expect(hasFencedContent(content)).toBe(true);
	});

	test("dry-run makes no writes", async () => {
		const settingsPath = writeSettingsToml(
			join(tempDir, ".config", "rp1"),
			'[harnesses]\nenabled = ["claude-code"]\n',
		);

		const result = await manageGlobalStanzaPhase(
			{ dryRun: true, globalSettingsPath: settingsPath },
			false,
		);

		expect(result.success).toBe(true);

		const claudeMdPath = join(tempDir, ".claude", "CLAUDE.md");
		expect(existsSync(claudeMdPath)).toBe(false);
	});

	test("persisted empty selection removes previously written stanza", async () => {
		const homeDir = join(tempDir, "home");

		await writeGlobalStanza("claude-code", homeDir);
		const claudeMdPath = join(homeDir, ".claude", "CLAUDE.md");
		expect(existsSync(claudeMdPath)).toBe(true);
		expect(hasFencedContent(readFileSync(claudeMdPath, "utf-8"))).toBe(true);

		const settingsPath = writeSettingsToml(
			join(tempDir, ".config", "rp1"),
			"[harnesses]\nenabled = []\n",
		);

		resetSettingsCache();

		const resolved = await resolveStanzaHarnesses(settingsPath);
		expect(resolved.source).toBe("persisted");
		expect(resolved.selection).toEqual([]);

		const { manageGlobalStanzas } = await import(
			"../../../init/global-stanza-writer.js"
		);
		const result = await manageGlobalStanzas(resolved.selection, {
			homeDir,
		});

		expect(result.removed).toContain("claude-code");

		const updatedContent = readFileSync(claudeMdPath, "utf-8");
		expect(hasFencedContent(updatedContent)).toBe(false);
	});
});
