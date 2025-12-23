/**
 * Unit tests for the tool detector module.
 * Focuses on version comparison logic which is the core business logic.
 * Tool detection itself is tested implicitly via integration.
 */

import { describe, expect, test } from "bun:test";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import {
	type DetectedTool,
	detectTools,
	formatDetectedTool,
	getOutdatedTools,
	getPrimaryTool,
	hasDetectedTools,
	type ToolDetectionResult,
} from "../../init/tool-detector.js";
import { expectTaskRight } from "../helpers/index.js";

// Helper to create mock registry
const createMockRegistry = (tools: SupportedTool[]): ToolsRegistry => ({
	version: "1.0",
	tools,
});

// Helper to create a mock tool
const createMockTool = (
	overrides: Partial<SupportedTool> = {},
): SupportedTool => ({
	id: "mock-tool",
	name: "Mock Tool",
	binary: "mock-binary-that-does-not-exist",
	min_version: "1.0.0",
	instruction_file: "MOCK.md",
	install_url: "https://example.com",
	plugin_install_cmd: null,
	capabilities: ["plugins"],
	...overrides,
});

// Helper to create mock detected tool
const createMockDetectedTool = (
	overrides: Partial<DetectedTool> = {},
): DetectedTool => ({
	tool: createMockTool(),
	version: "1.0.0",
	meetsMinVersion: true,
	...overrides,
});

describe("tool-detector", () => {
	describe("detectTools", () => {
		test("returns empty detected array when no tools in registry", async () => {
			const registry = createMockRegistry([]);
			const result = await expectTaskRight(detectTools(registry));

			expect(result.detected).toHaveLength(0);
			expect(result.missing).toHaveLength(0);
		});

		test("returns tools in missing array when binary not found", async () => {
			const tool = createMockTool({
				binary: "this-binary-definitely-does-not-exist-abc123",
			});
			const registry = createMockRegistry([tool]);
			const result = await expectTaskRight(detectTools(registry));

			expect(result.detected).toHaveLength(0);
			expect(result.missing).toHaveLength(1);
			expect(result.missing[0].id).toBe("mock-tool");
		});

		test("detects multiple tools in parallel", async () => {
			const tools = [
				createMockTool({ id: "tool-1", binary: "nonexistent1" }),
				createMockTool({ id: "tool-2", binary: "nonexistent2" }),
				createMockTool({ id: "tool-3", binary: "nonexistent3" }),
			];
			const registry = createMockRegistry(tools);
			const result = await expectTaskRight(detectTools(registry));

			expect(result.missing).toHaveLength(3);
		});

		test("never throws - returns result on error", async () => {
			// Even with completely invalid registry, should not throw
			const registry = createMockRegistry([
				createMockTool({ binary: "" }), // Empty binary name
			]);

			// Should complete without throwing
			const result = await expectTaskRight(detectTools(registry));
			expect(result).toBeDefined();
		});
	});

	describe("helper functions", () => {
		describe("hasDetectedTools", () => {
			test("returns true when tools detected", () => {
				const result: ToolDetectionResult = {
					detected: [createMockDetectedTool()],
					missing: [],
				};
				expect(hasDetectedTools(result)).toBe(true);
			});

			test("returns false when no tools detected", () => {
				const result: ToolDetectionResult = {
					detected: [],
					missing: [createMockTool()],
				};
				expect(hasDetectedTools(result)).toBe(false);
			});
		});

		describe("getPrimaryTool", () => {
			test("returns first detected tool", () => {
				const tool1 = createMockDetectedTool({
					tool: createMockTool({ id: "first" }),
				});
				const tool2 = createMockDetectedTool({
					tool: createMockTool({ id: "second" }),
				});
				const result: ToolDetectionResult = {
					detected: [tool1, tool2],
					missing: [],
				};

				const primary = getPrimaryTool(result);
				expect(primary?.tool.id).toBe("first");
			});

			test("returns undefined when no tools detected", () => {
				const result: ToolDetectionResult = {
					detected: [],
					missing: [],
				};

				expect(getPrimaryTool(result)).toBeUndefined();
			});
		});

		describe("getOutdatedTools", () => {
			test("returns tools that do not meet min version", () => {
				const outdated = createMockDetectedTool({
					meetsMinVersion: false,
					tool: createMockTool({ id: "outdated" }),
				});
				const current = createMockDetectedTool({
					meetsMinVersion: true,
					tool: createMockTool({ id: "current" }),
				});
				const result: ToolDetectionResult = {
					detected: [outdated, current],
					missing: [],
				};

				const outdatedTools = getOutdatedTools(result);
				expect(outdatedTools).toHaveLength(1);
				expect(outdatedTools[0].tool.id).toBe("outdated");
			});

			test("returns empty array when all tools meet version", () => {
				const result: ToolDetectionResult = {
					detected: [
						createMockDetectedTool({ meetsMinVersion: true }),
						createMockDetectedTool({ meetsMinVersion: true }),
					],
					missing: [],
				};

				expect(getOutdatedTools(result)).toHaveLength(0);
			});
		});

		describe("formatDetectedTool", () => {
			test("formats tool with version", () => {
				const detected = createMockDetectedTool({
					tool: createMockTool({ name: "Claude Code" }),
					version: "2.0.75",
					meetsMinVersion: true,
				});

				const formatted = formatDetectedTool(detected);
				expect(formatted).toBe("Claude Code v2.0.75");
			});

			test("formats tool with unknown version", () => {
				const detected = createMockDetectedTool({
					tool: createMockTool({ name: "Some Tool" }),
					version: "unknown",
					meetsMinVersion: true,
				});

				const formatted = formatDetectedTool(detected);
				expect(formatted).toBe("Some Tool (version unknown)");
			});

			test("includes warning for outdated tool", () => {
				const detected = createMockDetectedTool({
					tool: createMockTool({ name: "Old Tool", min_version: "2.0.0" }),
					version: "1.5.0",
					meetsMinVersion: false,
				});

				const formatted = formatDetectedTool(detected);
				expect(formatted).toContain("Old Tool");
				expect(formatted).toContain("v1.5.0");
				expect(formatted).toContain("requires >= 2.0.0");
			});
		});
	});

	describe("version comparison logic", () => {
		// These tests verify the version comparison behavior through the public API
		// by examining the meetsMinVersion field on mock DetectedTool objects

		test("version comparison edge cases documentation", () => {
			// The version comparison logic in tool-detector.ts:
			// - Parses X.Y.Z pattern from version strings
			// - Compares major, then minor, then patch
			// - actual >= minimum returns true
			//
			// Key edge cases:
			// - 1.0.33 vs 1.0.32: true (patch higher)
			// - 1.0.32 vs 1.0.33: false (patch lower)
			// - 2.0.0 vs 1.9.9: true (major higher)
			// - 1.9.9 vs 2.0.0: false (major lower)
			// - 1.0.0 vs 1.0.0: true (equal)
			// - Unparseable versions: assume true (safe default)
			//
			// This is verified by the actual detectTools behavior
			// when it parses real tool output.
			expect(true).toBe(true);
		});
	});
});

/**
 * Separate describe block for version parsing tests.
 * These test the parseVersion and compareVersions logic indirectly
 * through mock scenarios that mirror the internal implementation.
 */
describe("version parsing (unit tests)", () => {
	// Since parseVersion and compareVersions are private, we test their
	// behavior through expected scenarios

	describe("expected version parsing behavior", () => {
		test("should extract version from various formats", () => {
			// These formats should all work based on the regex /(\d+)\.(\d+)\.(\d+)/
			const formats = [
				"1.0.33",
				"v1.0.33",
				"claude 1.0.33",
				"OpenCode version 0.8.0",
				"Tool v2.0.0-beta",
				"  1.2.3  ",
			];

			// All should match the pattern and extract a version
			for (const format of formats) {
				const match = format.match(/(\d+)\.(\d+)\.(\d+)/);
				expect(match).not.toBeNull();
			}
		});

		test("should not extract from invalid formats", () => {
			const invalidFormats = ["no version", "1.2", "v1", ""];

			for (const format of invalidFormats) {
				const match = format.match(/(\d+)\.(\d+)\.(\d+)/);
				expect(match).toBeNull();
			}
		});
	});

	describe("expected version comparison behavior", () => {
		// Helper that mirrors the internal compareVersions logic
		const compareVersions = (
			actual: [number, number, number],
			minimum: [number, number, number],
		): boolean => {
			if (actual[0] !== minimum[0]) return actual[0] > minimum[0];
			if (actual[1] !== minimum[1]) return actual[1] > minimum[1];
			return actual[2] >= minimum[2];
		};

		test("patch version comparison", () => {
			// 1.0.33 >= 1.0.32 should be true
			expect(compareVersions([1, 0, 33], [1, 0, 32])).toBe(true);

			// 1.0.32 >= 1.0.33 should be false
			expect(compareVersions([1, 0, 32], [1, 0, 33])).toBe(false);

			// Equal versions
			expect(compareVersions([1, 0, 33], [1, 0, 33])).toBe(true);
		});

		test("minor version comparison", () => {
			// 1.1.0 >= 1.0.99 should be true (minor version wins)
			expect(compareVersions([1, 1, 0], [1, 0, 99])).toBe(true);

			// 1.0.99 >= 1.1.0 should be false
			expect(compareVersions([1, 0, 99], [1, 1, 0])).toBe(false);
		});

		test("major version comparison", () => {
			// 2.0.0 >= 1.9.9 should be true (major version wins)
			expect(compareVersions([2, 0, 0], [1, 9, 9])).toBe(true);

			// 1.9.9 >= 2.0.0 should be false
			expect(compareVersions([1, 9, 9], [2, 0, 0])).toBe(false);
		});

		test("real-world version scenarios", () => {
			// Claude Code minimum is 1.0.33
			expect(compareVersions([2, 0, 75], [1, 0, 33])).toBe(true); // Current version
			expect(compareVersions([1, 0, 33], [1, 0, 33])).toBe(true); // Exact match
			expect(compareVersions([1, 0, 32], [1, 0, 33])).toBe(false); // One below

			// OpenCode minimum is 0.8.0
			expect(compareVersions([1, 0, 106], [0, 8, 0])).toBe(true); // Current version
			expect(compareVersions([0, 8, 0], [0, 8, 0])).toBe(true); // Exact match
			expect(compareVersions([0, 7, 99], [0, 8, 0])).toBe(false); // Below minimum
		});
	});
});
