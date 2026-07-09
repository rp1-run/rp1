/**
 * Tests for getEffectiveHarnesses() -- harness selection filter for update/migrate.
 *
 * Regression targets:
 * - Absent [harnesses] enabled returns all detected stable (backward compat)
 * - Persisted selection filters to intersection of detected + selected
 * - Empty intersection returns empty array (no silent fallback)
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SupportedTool } from "../../config/supported-tools.js";
import type {
	DetectedTool,
	ToolDetectionResult,
} from "../../init/tool-detector.js";
import { resetSettingsCache } from "../../settings/loader.js";

const makeTool = (
	id: string,
	name: string,
	supportLevel?: "stable" | "experimental" | "degraded",
): SupportedTool => ({
	id,
	name,
	binary: id,
	min_version: "0.0.0",
	instruction_file: `${id}.md`,
	install_url: `https://example.com/${id}`,
	plugin_install_cmd: null,
	supportLevel,
	capabilities: [],
});

const makeDetected = (tool: SupportedTool): DetectedTool => ({
	tool,
	version: "1.0.0",
	meetsMinVersion: true,
});

const claudeCode = makeTool("claude-code", "Claude Code", "stable");
const opencode = makeTool("opencode", "OpenCode", "stable");
const codex = makeTool("codex", "Codex", "stable");
const copilot = makeTool("copilot", "Copilot", "stable");
const antigravity = makeTool("antigravity", "Antigravity", "experimental");

describe("getEffectiveHarnesses", () => {
	let tempDir: string;
	let settingsPath: string;

	beforeEach(() => {
		tempDir = join(tmpdir(), `rp1-eff-harness-test-${Date.now()}`);
		mkdirSync(tempDir, { recursive: true });
		settingsPath = join(tempDir, "settings.toml");
		resetSettingsCache();
	});

	afterEach(() => {
		rmSync(tempDir, { recursive: true, force: true });
		resetSettingsCache();
	});

	const loadGetEffectiveHarnesses = async () => {
		const mod = await import("../../shared/install-core.js");
		return mod.getEffectiveHarnesses;
	};

	test("returns all detected stable when no selection persisted (backward compat)", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		const detection: ToolDetectionResult = {
			detected: [
				makeDetected(claudeCode),
				makeDetected(opencode),
				makeDetected(antigravity),
			],
			missing: [codex, copilot],
		};

		// No settings file exists -- loadEnabledHarnesses returns undefined
		const result = getEffectiveHarnesses(detection, settingsPath);

		// Should return only stable detected tools (claude-code, opencode), not antigravity (experimental)
		expect(result.map((d) => d.tool.id)).toEqual(["claude-code", "opencode"]);
	});

	test("returns intersection of detected and persisted selection", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["claude-code", "codex"]\n',
		);

		const detection: ToolDetectionResult = {
			detected: [
				makeDetected(claudeCode),
				makeDetected(opencode),
				makeDetected(codex),
			],
			missing: [copilot],
		};

		const result = getEffectiveHarnesses(detection, settingsPath);

		// opencode is detected but not in enabled list -- excluded
		// codex is in enabled list and detected -- included
		expect(result.map((d) => d.tool.id)).toEqual(["claude-code", "codex"]);
	});

	test("returns empty array when no detected tools match selection", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		writeFileSync(settingsPath, '[harnesses]\nenabled = ["copilot"]\n');

		const detection: ToolDetectionResult = {
			detected: [makeDetected(claudeCode), makeDetected(opencode)],
			missing: [copilot, codex],
		};

		const result = getEffectiveHarnesses(detection, settingsPath);

		expect(result).toEqual([]);
	});

	test("empty enabled array returns empty array (user explicitly deselected all)", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		writeFileSync(settingsPath, "[harnesses]\nenabled = []\n");

		const detection: ToolDetectionResult = {
			detected: [makeDetected(claudeCode)],
			missing: [],
		};

		const result = getEffectiveHarnesses(detection, settingsPath);

		expect(result).toEqual([]);
	});

	test("preserves order from detected tools", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["codex", "claude-code", "opencode"]\n',
		);

		const detection: ToolDetectionResult = {
			detected: [
				makeDetected(opencode),
				makeDetected(claudeCode),
				makeDetected(codex),
			],
			missing: [],
		};

		const result = getEffectiveHarnesses(detection, settingsPath);

		// Order should follow detected order, not enabled order
		expect(result.map((d) => d.tool.id)).toEqual([
			"opencode",
			"claude-code",
			"codex",
		]);
	});

	test("includes experimental tools when explicitly selected", async () => {
		const getEffectiveHarnesses = await loadGetEffectiveHarnesses();

		writeFileSync(
			settingsPath,
			'[harnesses]\nenabled = ["claude-code", "antigravity"]\n',
		);

		const detection: ToolDetectionResult = {
			detected: [makeDetected(claudeCode), makeDetected(antigravity)],
			missing: [],
		};

		const result = getEffectiveHarnesses(detection, settingsPath);

		// Explicit selection overrides support level filtering
		expect(result.map((d) => d.tool.id)).toEqual([
			"claude-code",
			"antigravity",
		]);
	});
});
