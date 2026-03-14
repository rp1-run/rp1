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
	getEnabledTools,
	isToolEnabled,
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
