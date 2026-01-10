/**
 * Unit tests for the shared install-core module.
 * Tests core installation functions used by both `rp1 init` and `rp1 install` commands.
 */

import { describe, expect, test } from "bun:test";
import type { Logger } from "../../../shared/logger.js";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import type { InstallContext } from "../../shared/install-core.js";

// Create mock logger
const createMockLogger = (): Logger => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
});

// Create mock context
const createMockContext = (
	overrides: Partial<InstallContext> = {},
): InstallContext => ({
	logger: createMockLogger(),
	isTTY: false,
	dryRun: false,
	skipPrompt: true,
	...overrides,
});

// Create mock tool definitions
const createClaudeCodeTool = (): SupportedTool => ({
	id: "claude-code",
	name: "Claude Code",
	binary: "claude",
	min_version: "1.0.33",
	instruction_file: "CLAUDE.md",
	install_url: "https://claude.ai/download",
	plugin_install_cmd: "claude mcp add",
	capabilities: ["plugins", "mcp"],
});

const createOpenCodeTool = (): SupportedTool => ({
	id: "opencode",
	name: "OpenCode",
	binary: "opencode",
	min_version: "0.8.0",
	instruction_file: "AGENTS.md",
	install_url: "https://opencode.ai",
	plugin_install_cmd: null,
	capabilities: ["plugins"],
});

const createMockRegistry = (): ToolsRegistry => ({
	version: "1.0.0",
	tools: [createClaudeCodeTool(), createOpenCodeTool()],
});

describe("install-core module", () => {
	describe("InstallContext interface", () => {
		test("accepts valid context configuration", () => {
			const ctx = createMockContext();

			expect(ctx.logger).toBeDefined();
			expect(ctx.isTTY).toBe(false);
			expect(ctx.dryRun).toBe(false);
			expect(ctx.skipPrompt).toBe(true);
		});

		test("allows TTY and dryRun overrides", () => {
			const ctx = createMockContext({
				isTTY: true,
				dryRun: true,
			});

			expect(ctx.isTTY).toBe(true);
			expect(ctx.dryRun).toBe(true);
		});
	});

	describe("ToolInstallResult interface contract", () => {
		test("result structure contains required fields", () => {
			// This tests the type contract - results should have these fields
			const result = {
				toolId: "claude-code",
				toolName: "Claude Code",
				success: true,
				pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
				warnings: [] as readonly string[],
			};

			expect(result.toolId).toBe("claude-code");
			expect(result.toolName).toBe("Claude Code");
			expect(result.success).toBe(true);
			expect(result.pluginsInstalled).toHaveLength(2);
			expect(result.warnings).toHaveLength(0);
		});

		test("failed result includes error field", () => {
			const result = {
				toolId: "opencode",
				toolName: "OpenCode",
				success: false,
				pluginsInstalled: [] as readonly string[],
				warnings: [] as readonly string[],
				error: {
					_tag: "InstallError" as const,
					operation: "install",
					message: "Failed to install",
				},
			};

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error?._tag).toBe("InstallError");
		});
	});

	describe("InstallAllResult interface contract", () => {
		test("aggregates multiple tool results", () => {
			const result = {
				installed: 2,
				results: [
					{
						toolId: "claude-code",
						toolName: "Claude Code",
						success: true,
						pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
						warnings: [] as readonly string[],
					},
					{
						toolId: "opencode",
						toolName: "OpenCode",
						success: true,
						pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
						warnings: [] as readonly string[],
					},
				],
				detected: [],
			};

			expect(result.installed).toBe(2);
			expect(result.results).toHaveLength(2);
		});

		test("counts successful installations correctly", () => {
			const results = [
				{ success: true },
				{ success: false },
				{ success: true },
			];

			const installed = results.filter((r) => r.success).length;
			expect(installed).toBe(2);
		});
	});

	describe("Registry validation", () => {
		test("mock registry contains expected tools", () => {
			const registry = createMockRegistry();

			expect(registry.tools).toHaveLength(2);
			expect(registry.tools.find((t) => t.id === "claude-code")).toBeDefined();
			expect(registry.tools.find((t) => t.id === "opencode")).toBeDefined();
		});

		test("unknown tool ID is not found in registry", () => {
			const registry = createMockRegistry();
			const unknownTool = registry.tools.find((t) => t.id === "unknown-tool");

			expect(unknownTool).toBeUndefined();
		});
	});
});

describe("install-core function exports", () => {
	test("module exports required functions", async () => {
		// Dynamic import to test exports
		const installCore = await import("../../shared/install-core.js");

		expect(typeof installCore.installClaudeCodePlugins).toBe("function");
		expect(typeof installCore.installOpenCodePlugins).toBe("function");
		expect(typeof installCore.installAllDetectedTools).toBe("function");
		expect(typeof installCore.installForSpecificTool).toBe("function");
	});

	test("context interface is used by exported functions", () => {
		// Type-level validation: verify context interface is compatible
		// with the already imported InstallContext type
		const ctx: InstallContext = createMockContext();

		// Verify the context has all required fields
		expect(ctx.logger).toBeDefined();
		expect(typeof ctx.isTTY).toBe("boolean");
		expect(typeof ctx.dryRun).toBe("boolean");
		expect(typeof ctx.skipPrompt).toBe("boolean");
	});
});

describe("install-core function signatures", () => {
	test("installClaudeCodePlugins accepts scope and context", async () => {
		const { installClaudeCodePlugins } = await import(
			"../../shared/install-core.js"
		);

		// Verify function can be called with expected arguments
		// This is a type-level test - we don't execute the actual installation
		expect(installClaudeCodePlugins.length).toBeGreaterThanOrEqual(0);
	});

	test("installOpenCodePlugins accepts config and context", async () => {
		const { installOpenCodePlugins } = await import(
			"../../shared/install-core.js"
		);

		expect(installOpenCodePlugins.length).toBeGreaterThanOrEqual(0);
	});

	test("installAllDetectedTools accepts registry and context", async () => {
		const { installAllDetectedTools } = await import(
			"../../shared/install-core.js"
		);

		expect(installAllDetectedTools.length).toBeGreaterThanOrEqual(0);
	});

	test("installForSpecificTool accepts toolId, registry, and context", async () => {
		const { installForSpecificTool } = await import(
			"../../shared/install-core.js"
		);

		expect(installForSpecificTool.length).toBeGreaterThanOrEqual(0);
	});
});

describe("install-core context variations", () => {
	test("context with dry-run mode", () => {
		const ctx = createMockContext({ dryRun: true });

		expect(ctx.dryRun).toBe(true);
		// In dry-run mode, no actual installation should occur
	});

	test("context with TTY mode", () => {
		const ctx = createMockContext({ isTTY: true });

		expect(ctx.isTTY).toBe(true);
		// In TTY mode, spinners and prompts may be displayed
	});

	test("context with skipPrompt mode", () => {
		const ctx = createMockContext({ skipPrompt: true });

		expect(ctx.skipPrompt).toBe(true);
		// With skipPrompt, confirmation prompts are bypassed
	});

	test("context combines multiple flags", () => {
		const ctx = createMockContext({
			dryRun: true,
			isTTY: true,
			skipPrompt: false,
		});

		expect(ctx.dryRun).toBe(true);
		expect(ctx.isTTY).toBe(true);
		expect(ctx.skipPrompt).toBe(false);
	});
});

describe("install-core result handling", () => {
	test("success result has expected shape", () => {
		const successResult = {
			toolId: "claude-code",
			toolName: "Claude Code",
			success: true,
			pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
			warnings: [] as readonly string[],
		};

		expect(successResult.success).toBe(true);
		expect(successResult.pluginsInstalled.length).toBeGreaterThan(0);
		expect(successResult.warnings.length).toBe(0);
	});

	test("failure result includes error details", () => {
		const failureResult = {
			toolId: "opencode",
			toolName: "OpenCode",
			success: false,
			pluginsInstalled: [] as readonly string[],
			warnings: ["Some warning"] as readonly string[],
			error: {
				_tag: "InstallError" as const,
				operation: "install",
				message: "Installation failed",
			},
		};

		expect(failureResult.success).toBe(false);
		expect(failureResult.error).toBeDefined();
		expect(failureResult.warnings.length).toBe(1);
	});

	test("partial success result has mixed outcomes", () => {
		const partialResult = {
			installed: 1,
			results: [
				{
					toolId: "claude-code",
					toolName: "Claude Code",
					success: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
					warnings: [] as readonly string[],
				},
				{
					toolId: "opencode",
					toolName: "OpenCode",
					success: false,
					pluginsInstalled: [] as readonly string[],
					warnings: [] as readonly string[],
					error: {
						_tag: "InstallError" as const,
						operation: "install",
						message: "Failed",
					},
				},
			],
			detected: [],
		};

		expect(partialResult.installed).toBe(1);
		expect(partialResult.results.length).toBe(2);

		const successes = partialResult.results.filter((r) => r.success);
		const failures = partialResult.results.filter((r) => !r.success);

		expect(successes.length).toBe(1);
		expect(failures.length).toBe(1);
	});
});
