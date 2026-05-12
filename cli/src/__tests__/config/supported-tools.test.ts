/**
 * Unit tests for supported tools registry helpers.
 * Validates getEnabledTools and isToolEnabled filtering behavior.
 */

import { describe, expect, test } from "bun:test";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import {
	findToolById,
	getDefaultInstallTools,
	getEnabledTools,
	getToolSupportLevel,
	isToolEnabled,
	loadToolsRegistry,
} from "../../config/supported-tools.js";

const createTool = (overrides: Partial<SupportedTool> = {}): SupportedTool => ({
	id: "test-tool",
	name: "Test Tool",
	enabled: true,
	binary: "test",
	min_version: "1.0.0",
	instruction_file: "TEST.md",
	install_url: "https://example.com",
	plugin_install_cmd: null,
	capabilities: [],
	...overrides,
});

const createRegistry = (tools: SupportedTool[]): ToolsRegistry => ({
	version: "1.0",
	tools,
});

describe("getEnabledTools", () => {
	test("returns only enabled tools from a mixed registry", () => {
		const registry = createRegistry([
			createTool({ id: "a", enabled: true }),
			createTool({ id: "b", enabled: false }),
			createTool({ id: "c", enabled: true }),
		]);

		const result = getEnabledTools(registry);

		expect(result).toHaveLength(2);
		expect(result.map((t) => t.id)).toEqual(["a", "c"]);
	});

	test("returns all tools when none are disabled", () => {
		const registry = createRegistry([
			createTool({ id: "a", enabled: true }),
			createTool({ id: "b", enabled: true }),
		]);

		const result = getEnabledTools(registry);

		expect(result).toHaveLength(2);
	});

	test("returns empty array when all tools are disabled", () => {
		const registry = createRegistry([
			createTool({ id: "a", enabled: false }),
			createTool({ id: "b", enabled: false }),
		]);

		const result = getEnabledTools(registry);

		expect(result).toHaveLength(0);
	});

	test("treats undefined enabled as enabled (backward compatibility)", () => {
		const toolWithoutEnabled = {
			id: "legacy",
			name: "Legacy Tool",
			binary: "legacy",
			min_version: "1.0.0",
			instruction_file: "LEGACY.md",
			install_url: "https://example.com",
			plugin_install_cmd: null,
			capabilities: [],
		} as unknown as SupportedTool;

		const registry = createRegistry([
			toolWithoutEnabled,
			createTool({ id: "disabled", enabled: false }),
		]);

		const result = getEnabledTools(registry);

		expect(result).toHaveLength(1);
		expect(result[0].id).toBe("legacy");
	});

	test("returns empty array for empty registry", () => {
		const registry = createRegistry([]);

		const result = getEnabledTools(registry);

		expect(result).toHaveLength(0);
	});
});

describe("getDefaultInstallTools", () => {
	test("excludes experimental tools from default install targets", () => {
		const registry = createRegistry([
			createTool({ id: "stable" }),
			createTool({ id: "experimental", supportLevel: "experimental" }),
			createTool({
				id: "disabled-experimental",
				enabled: false,
				supportLevel: "experimental",
			}),
		]);

		const result = getDefaultInstallTools(registry);

		expect(result.map((tool) => tool.id)).toEqual(["stable"]);
	});

	test("treats omitted supportLevel as stable", () => {
		const tool = createTool({ supportLevel: undefined });

		expect(getToolSupportLevel(tool)).toBe("stable");
	});
});

describe("isToolEnabled", () => {
	test("returns true for an enabled tool", () => {
		const registry = createRegistry([
			createTool({ id: "claude-code", enabled: true }),
		]);

		expect(isToolEnabled(registry, "claude-code")).toBe(true);
	});

	test("returns false for a disabled tool", () => {
		const registry = createRegistry([
			createTool({ id: "codex", enabled: false }),
		]);

		expect(isToolEnabled(registry, "codex")).toBe(false);
	});

	test("returns true for an unknown tool ID", () => {
		const registry = createRegistry([
			createTool({ id: "claude-code", enabled: true }),
		]);

		expect(isToolEnabled(registry, "nonexistent")).toBe(true);
	});

	test("treats undefined enabled as enabled (backward compatibility)", () => {
		const toolWithoutEnabled = {
			id: "legacy",
			name: "Legacy Tool",
			binary: "legacy",
			min_version: "1.0.0",
			instruction_file: "LEGACY.md",
			install_url: "https://example.com",
			plugin_install_cmd: null,
			capabilities: [],
		} as unknown as SupportedTool;

		const registry = createRegistry([toolWithoutEnabled]);

		expect(isToolEnabled(registry, "legacy")).toBe(true);
	});
});

describe("embedded supported tools registry", () => {
	test("includes Gemini as experimental without reclassifying existing harnesses", async () => {
		const registry = await loadToolsRegistry();

		expect(registry.tools.map((tool) => tool.id)).toEqual([
			"claude-code",
			"opencode",
			"codex",
			"copilot",
			"gemini",
		]);
		expect(
			registry.tools.map((tool) => ({
				id: tool.id,
				name: tool.name,
				binary: tool.binary,
				supportLevel: getToolSupportLevel(tool),
			})),
		).toEqual([
			{
				id: "claude-code",
				name: "Claude Code",
				binary: "claude",
				supportLevel: "stable",
			},
			{
				id: "opencode",
				name: "OpenCode",
				binary: "opencode",
				supportLevel: "stable",
			},
			{
				id: "codex",
				name: "Codex CLI",
				binary: "codex",
				supportLevel: "stable",
			},
			{
				id: "copilot",
				name: "GitHub Copilot CLI",
				binary: "gh",
				supportLevel: "stable",
			},
			{
				id: "gemini",
				name: "Gemini CLI",
				binary: "gemini",
				supportLevel: "experimental",
			},
		]);
	});

	test("keeps Gemini visible while excluding it from default install targets", async () => {
		const registry = await loadToolsRegistry();
		const gemini = findToolById(registry, "gemini");

		expect(gemini).toBeDefined();
		expect(getEnabledTools(registry).map((tool) => tool.id)).toContain(
			"gemini",
		);
		expect(
			getDefaultInstallTools(registry).map((tool) => tool.id),
		).not.toContain("gemini");
	});
});
