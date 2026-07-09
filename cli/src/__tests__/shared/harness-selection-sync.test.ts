/**
 * Tests for harness selection sync (install/uninstall <-> settings.toml).
 *
 * Regression targets:
 * - syncHarnessSelectionAdd adds new harness to existing enabled list
 * - syncHarnessSelectionAdd creates [harnesses] section when absent
 * - syncHarnessSelectionAdd is idempotent (no duplicate on re-add)
 * - syncHarnessSelectionRemove removes harness from enabled list
 * - syncHarnessSelectionRemove is no-op when section absent
 * - syncHarnessSelectionRemove is no-op when harness not in list
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resetSettingsCache } from "../../settings/loader.js";
import {
	syncHarnessSelectionAdd,
	syncHarnessSelectionRemove,
} from "../../shared/install-core.js";

describe("syncHarnessSelectionAdd", () => {
	let tempDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `rp1-harness-sync-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		settingsPath = join(tempDir, "settings.toml");
		resetSettingsCache();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		resetSettingsCache();
	});

	test("creates [harnesses] section with the tool when no section exists", () => {
		writeFileSync(settingsPath, '[models]\npreset = "standard"\n');

		syncHarnessSelectionAdd("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain("[harnesses]");
		expect(content).toContain('enabled = ["codex"]');
		// Original content preserved
		expect(content).toContain('[models]\npreset = "standard"');
	});

	test("creates settings file with [harnesses] section when file does not exist", () => {
		const nonExistentPath = join(tempDir, "sub", "settings.toml");

		syncHarnessSelectionAdd("claude-code", nonExistentPath);

		const content = readFileSync(nonExistentPath, "utf-8");
		expect(content).toContain("[harnesses]");
		expect(content).toContain('enabled = ["claude-code"]');
	});

	test("adds harness to existing enabled list", () => {
		writeFileSync(settingsPath, '[harnesses]\nenabled = ["claude-code"]\n');

		syncHarnessSelectionAdd("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain('enabled = ["claude-code", "codex"]');
	});

	test("is idempotent -- does not duplicate existing harness", () => {
		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["claude-code", "codex"]\n',
		);

		syncHarnessSelectionAdd("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain('enabled = ["claude-code", "codex"]');
	});

	test("adds to empty enabled array", () => {
		writeFileSync(settingsPath, "[harnesses]\nenabled = []\n");

		syncHarnessSelectionAdd("opencode", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain('enabled = ["opencode"]');
	});
});

describe("syncHarnessSelectionRemove", () => {
	let tempDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `rp1-harness-sync-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		settingsPath = join(tempDir, "settings.toml");
		resetSettingsCache();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		resetSettingsCache();
	});

	test("removes harness from enabled list", () => {
		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["claude-code", "codex", "opencode"]\n',
		);

		syncHarnessSelectionRemove("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain('enabled = ["claude-code", "opencode"]');
	});

	test("is no-op when no [harnesses] section exists", () => {
		writeFileSync(settingsPath, '[models]\npreset = "standard"\n');
		const originalContent = readFileSync(settingsPath, "utf-8");

		syncHarnessSelectionRemove("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toBe(originalContent);
	});

	test("is no-op when harness not in enabled list", () => {
		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["claude-code", "opencode"]\n',
		);

		syncHarnessSelectionRemove("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain('enabled = ["claude-code", "opencode"]');
	});

	test("produces empty array when last harness removed", () => {
		writeFileSync(settingsPath, '[harnesses]\nenabled = ["codex"]\n');

		syncHarnessSelectionRemove("codex", settingsPath);

		const content = readFileSync(settingsPath, "utf-8");
		expect(content).toContain("enabled = []");
	});

	test("is no-op when settings file does not exist", () => {
		const nonExistentPath = join(tempDir, "nonexistent", "settings.toml");

		// Should not throw
		syncHarnessSelectionRemove("codex", nonExistentPath);
	});
});
