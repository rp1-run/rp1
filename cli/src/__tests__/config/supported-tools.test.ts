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
	test("includes Antigravity as the stable Google harness without reclassifying existing harnesses", async () => {
		const registry = await loadToolsRegistry();

		expect(registry.tools.map((tool) => tool.id)).toEqual([
			"claude-code",
			"opencode",
			"codex",
			"copilot",
			"antigravity",
			"goose",
		]);
		expect(
			registry.tools.map((tool) => ({
				id: tool.id,
				name: tool.name,
				binary: tool.binary,
				enabled: tool.enabled,
				supportLevel: getToolSupportLevel(tool),
			})),
		).toEqual([
			{
				id: "claude-code",
				name: "Claude Code",
				binary: "claude",
				enabled: undefined,
				supportLevel: "stable",
			},
			{
				id: "opencode",
				name: "OpenCode",
				binary: "opencode",
				enabled: undefined,
				supportLevel: "stable",
			},
			{
				id: "codex",
				name: "Codex CLI",
				binary: "codex",
				enabled: true,
				supportLevel: "stable",
			},
			{
				id: "copilot",
				name: "GitHub Copilot CLI",
				binary: "copilot",
				enabled: undefined,
				supportLevel: "stable",
			},
			{
				id: "antigravity",
				name: "Antigravity CLI",
				binary: "agy",
				enabled: undefined,
				supportLevel: "stable",
			},
			{
				id: "goose",
				name: "Goose",
				binary: "goose",
				enabled: true,
				supportLevel: "experimental",
			},
		]);
	});

	test("includes Antigravity in default install targets", async () => {
		const registry = await loadToolsRegistry();
		const antigravity = findToolById(registry, "antigravity");

		expect(antigravity).toBeDefined();
		expect(antigravity).toMatchObject({
			id: "antigravity",
			name: "Antigravity CLI",
			binary: "agy",
			min_version: "0.0.0",
			instruction_file: "AGENTS.md",
			install_url: "https://www.antigravity.google/product/antigravity-cli",
			plugin_install_cmd: "agy plugin install {plugin}",
			capabilities: [
				"plugins",
				"skills",
				"agents",
				"slash-commands",
				"hooks",
				"mcp",
				"rules",
			],
		});
		expect(antigravity?.icon).toEqual({
			source: "@lobehub/icons",
			name: "Antigravity",
			variant: "mono",
		});
		expect(getEnabledTools(registry).map((tool) => tool.id)).toContain(
			"antigravity",
		);
		expect(getDefaultInstallTools(registry).map((tool) => tool.id)).toContain(
			"antigravity",
		);
	});

	test("enables Goose for targeted experimental install and verify surfaces", async () => {
		const registry = await loadToolsRegistry();
		const goose = findToolById(registry, "goose");

		expect(goose).toMatchObject({
			id: "goose",
			name: "Goose",
			enabled: true,
			binary: "goose",
			min_version: "1.35.0",
			instruction_file: "AGENTS.md",
			install_url: "https://block.github.io/goose/",
			plugin_install_cmd: null,
			supportLevel: "experimental",
			capabilities: ["skills", "agents", "recipes"],
		});
		expect(goose?.icon).toEqual({
			source: "@lobehub/icons",
			name: "Goose",
			variant: "mono",
		});
		expect(getEnabledTools(registry).map((tool) => tool.id)).toContain("goose");
		expect(
			getDefaultInstallTools(registry).map((tool) => tool.id),
		).not.toContain("goose");
	});
});
