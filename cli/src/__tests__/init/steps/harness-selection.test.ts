/**
 * Unit tests for the harness-selection step business logic.
 *
 * Tests item building from detected tools, default selection resolution
 * (fresh vs re-init), and stable-defaults fallback.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SupportedTool } from "../../../config/supported-tools.js";
import {
	buildHarnessItems,
	getStableDefaults,
	resolveDefaultSelection,
	writeHarnessSelection,
} from "../../../init/steps/harness-selection.js";
import type { DetectedTool } from "../../../init/tool-detector.js";
import { resetSettingsCache } from "../../../settings/loader.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

function makeTool(overrides: Partial<SupportedTool> = {}): SupportedTool {
	return {
		id: "claude-code",
		name: "Claude Code",
		binary: "claude",
		min_version: "1.0.0",
		instruction_file: "CLAUDE.md",
		install_url: "https://example.com",
		plugin_install_cmd: null,
		capabilities: [],
		...overrides,
	};
}

function makeDetected(
	toolOverrides: Partial<SupportedTool> = {},
	version = "1.0.0",
): DetectedTool {
	return {
		tool: makeTool(toolOverrides),
		version,
		meetsMinVersion: true,
	};
}

describe("harness-selection step", () => {
	describe("buildHarnessItems", () => {
		test("maps detected tools to multi-select items", () => {
			const detected: DetectedTool[] = [
				makeDetected({ id: "claude-code", name: "Claude Code" }, "1.2.3"),
				makeDetected(
					{
						id: "codex",
						name: "Codex",
						supportLevel: "experimental",
					},
					"0.5.0",
				),
			];

			const items = buildHarnessItems(detected);

			expect(items).toHaveLength(2);
			expect(items[0].value).toBe("claude-code");
			expect(items[0].label).toBe("Claude Code");
			expect(items[0].isStable).toBe(true);
			expect(items[0].description).toBe("v1.2.3");

			expect(items[1].value).toBe("codex");
			expect(items[1].label).toBe("Codex");
			expect(items[1].isStable).toBe(false);
			expect(items[1].description).toBe("v0.5.0 (experimental)");
		});

		test("filters out disabled tools", () => {
			const detected: DetectedTool[] = [
				makeDetected({ id: "claude-code", enabled: false }),
				makeDetected({ id: "opencode", name: "OpenCode" }),
			];

			const items = buildHarnessItems(detected);

			expect(items).toHaveLength(1);
			expect(items[0].value).toBe("opencode");
		});

		test("handles unknown version", () => {
			const detected: DetectedTool[] = [
				makeDetected({ id: "claude-code" }, "unknown"),
			];

			const items = buildHarnessItems(detected);

			expect(items[0].description).toBeUndefined();
		});
	});

	describe("getStableDefaults", () => {
		test("returns only stable harness IDs", () => {
			const items = [
				{ value: "claude-code", label: "Claude Code", isStable: true },
				{ value: "codex", label: "Codex", isStable: false },
				{ value: "opencode", label: "OpenCode", isStable: true },
			];

			const defaults = getStableDefaults(items);

			expect(defaults).toEqual(["claude-code", "opencode"]);
		});

		test("returns empty array when no stable harnesses", () => {
			const items = [{ value: "codex", label: "Codex", isStable: false }];

			expect(getStableDefaults(items)).toEqual([]);
		});
	});

	describe("resolveDefaultSelection", () => {
		let tempDir: string;
		let settingsPath: string;

		beforeEach(async () => {
			resetSettingsCache();
			tempDir = await createTempDir("harness-selection-test");
			settingsPath = join(tempDir, "settings.toml");
		});

		afterEach(async () => {
			resetSettingsCache();
			await cleanupTempDir(tempDir);
		});

		test("returns stable defaults when no persisted selection exists", () => {
			const items = [
				{ value: "claude-code", label: "Claude Code", isStable: true },
				{ value: "codex", label: "Codex", isStable: false },
			];

			const defaults = resolveDefaultSelection(items, settingsPath);

			expect(defaults).toEqual(["claude-code"]);
		});

		test("returns persisted selection filtered to detected harnesses on re-init", () => {
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(
				settingsPath,
				'[harnesses]\nenabled = ["claude-code", "codex", "copilot"]\n',
			);

			const items = [
				{ value: "claude-code", label: "Claude Code", isStable: true },
				{ value: "opencode", label: "OpenCode", isStable: true },
			];

			const defaults = resolveDefaultSelection(items, settingsPath);

			// "copilot" and "codex" not in detected -> filtered out
			// "opencode" detected but not in persisted -> not included
			expect(defaults).toEqual(["claude-code"]);
		});

		test("returns empty when persisted selection has no overlap with detected", () => {
			mkdirSync(tempDir, { recursive: true });
			writeFileSync(settingsPath, '[harnesses]\nenabled = ["copilot"]\n');

			const items = [
				{ value: "claude-code", label: "Claude Code", isStable: true },
			];

			const defaults = resolveDefaultSelection(items, settingsPath);

			expect(defaults).toEqual([]);
		});
	});

	describe("writeHarnessSelection integration", () => {
		let tempDir: string;
		let settingsPath: string;

		beforeEach(async () => {
			resetSettingsCache();
			tempDir = await createTempDir("harness-write-test");
			settingsPath = join(tempDir, "settings.toml");
		});

		afterEach(async () => {
			resetSettingsCache();
			await cleanupTempDir(tempDir);
		});

		test("creates settings file and writes selection", () => {
			writeHarnessSelection(["claude-code", "opencode"], settingsPath);

			const content = readFileSync(settingsPath, "utf-8");
			expect(content).toContain("[harnesses]");
			expect(content).toContain('enabled = ["claude-code", "opencode"]');
		});
	});
});
