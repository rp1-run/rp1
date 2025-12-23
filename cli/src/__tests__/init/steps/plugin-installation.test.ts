/**
 * Unit tests for the plugin-installation step module.
 * Tests plugin installation execution for different scenarios.
 *
 * Uses dependency injection to mock external installer modules.
 */

import { describe, expect, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../../shared/errors.js";
import type { Logger } from "../../../../shared/logger.js";
import {
	defaultPluginInstallConfig,
	defaultPluginInstallDeps,
	executePluginInstallation,
	installClaudeCodePlugins,
	type PluginInstallConfig,
	type PluginInstallDeps,
} from "../../../init/steps/plugin-installation.js";
import type { DetectedTool } from "../../../init/tool-detector.js";
import type {
	ClaudeCodeInstallResult,
	ClaudeCodePrerequisiteResult,
} from "../../../install/claudecode/models.js";

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

// Create mock logger that tracks calls
const createTrackingMockLogger = (): Logger & {
	calls: { method: string; args: unknown[] }[];
} => {
	const calls: { method: string; args: unknown[] }[] = [];
	return {
		calls,
		trace: (...args: unknown[]) => calls.push({ method: "trace", args }),
		debug: (...args: unknown[]) => calls.push({ method: "debug", args }),
		info: (...args: unknown[]) => calls.push({ method: "info", args }),
		warn: (...args: unknown[]) => calls.push({ method: "warn", args }),
		error: (...args: unknown[]) => calls.push({ method: "error", args }),
		start: (...args: unknown[]) => calls.push({ method: "start", args }),
		success: (...args: unknown[]) => calls.push({ method: "success", args }),
		fail: (...args: unknown[]) => calls.push({ method: "fail", args }),
		box: (...args: unknown[]) => calls.push({ method: "box", args }),
	};
};

// Mock tool definitions
const createClaudeCodeTool = (version = "1.0.40"): DetectedTool => ({
	tool: {
		id: "claude-code",
		name: "Claude Code",
		binary: "claude",
		min_version: "1.0.33",
		instruction_file: "CLAUDE.md",
		install_url: "https://claude.ai/download",
		plugin_install_cmd: "claude mcp add",
		capabilities: ["plugins", "mcp"],
	},
	version,
	meetsMinVersion: true,
});

const createOpenCodeTool = (): DetectedTool => ({
	tool: {
		id: "opencode",
		name: "OpenCode",
		binary: "opencode",
		min_version: "0.8.0",
		instruction_file: "AGENTS.md",
		install_url: "https://opencode.ai",
		plugin_install_cmd: null,
		capabilities: ["plugins"],
	},
	version: "0.9.0",
	meetsMinVersion: true,
});

// Mock dependencies that succeed
const createSuccessDeps = (
	pluginsInstalled = ["rp1-base", "rp1-dev"],
): PluginInstallDeps => ({
	runPrerequisiteChecks: () =>
		TE.right([
			{
				check: "claude-installed",
				passed: true,
				message: "Claude Code found",
				value: "1.0.40",
			},
			{
				check: "claude-version",
				passed: true,
				message: "Claude Code version supports plugins",
				value: "1.0.40",
			},
		] as readonly ClaudeCodePrerequisiteResult[]),
	installPlugins: (_scope, _logger, _dryRun, _isTTY) =>
		TE.right({
			marketplaceAdded: true,
			pluginsInstalled,
			warnings: [],
		} as ClaudeCodeInstallResult),
});

// Mock dependencies that fail on prerequisites
const createPrereqFailDeps = (): PluginInstallDeps => ({
	runPrerequisiteChecks: () =>
		TE.left({
			_tag: "PrerequisiteError",
			check: "claude-installed",
			message: "Claude Code CLI not found in PATH",
			suggestion: "Install Claude Code",
		} as CLIError),
	installPlugins: (_scope, _logger, _dryRun, _isTTY) =>
		TE.right({
			marketplaceAdded: false,
			pluginsInstalled: [],
			warnings: [],
		} as ClaudeCodeInstallResult),
});

// Mock dependencies that fail on installation
const createInstallFailDeps = (): PluginInstallDeps => ({
	runPrerequisiteChecks: () =>
		TE.right([
			{
				check: "claude-installed",
				passed: true,
				message: "Claude Code found",
				value: "1.0.40",
			},
		] as readonly ClaudeCodePrerequisiteResult[]),
	installPlugins: (_scope, _logger, _dryRun, _isTTY) =>
		TE.left({
			_tag: "InstallError",
			operation: "plugin-install",
			message: "Network timeout",
		} as CLIError),
});

describe("plugin-installation step", () => {
	describe("executePluginInstallation", () => {
		test("skips installation when no tool detected", async () => {
			const logger = createTrackingMockLogger();

			const result = await executePluginInstallation(
				null, // No detected tool
				{ isTTY: false },
				logger,
			);

			// Should return skipped action
			expect(result.actions).toHaveLength(1);
			expect(result.actions[0]).toEqual({
				type: "skipped",
				reason: "No agentic tool detected - cannot install plugins",
			});

			// Result should be null (no installation attempted)
			expect(result.result).toBeNull();

			// Should log info message
			const infoCall = logger.calls.find(
				(c) =>
					c.method === "info" && String(c.args[0]).includes("No agentic tool"),
			);
			expect(infoCall).toBeDefined();
		});

		test("skips with manual guidance for non-Claude Code tools", async () => {
			const logger = createTrackingMockLogger();
			const openCodeTool = createOpenCodeTool();

			const result = await executePluginInstallation(
				openCodeTool,
				{ isTTY: false },
				logger,
			);

			// Should return skipped action with tool-specific reason
			expect(result.actions).toHaveLength(1);
			expect(result.actions[0]).toEqual({
				type: "skipped",
				reason: "Automated installation not supported for OpenCode",
			});

			// Result should be null
			expect(result.result).toBeNull();

			// Should show manual installation guidance
			const infoCall = logger.calls.find(
				(c) =>
					c.method === "info" && String(c.args[0]).includes("manual setup"),
			);
			expect(infoCall).toBeDefined();

			const boxCall = logger.calls.find(
				(c) =>
					c.method === "box" && String(c.args[0]).includes("https://rp1.run"),
			);
			expect(boxCall).toBeDefined();
		});

		test("respects non-interactive mode flag and proceeds with installation", async () => {
			const logger = createTrackingMockLogger();
			const claudeTool = createClaudeCodeTool();
			const deps = createSuccessDeps();

			// Non-interactive mode (isTTY: false)
			const result = await executePluginInstallation(
				claudeTool,
				{ isTTY: false },
				logger,
				defaultPluginInstallConfig,
				deps,
			);

			// Should log that we're in non-interactive mode
			const nonInteractiveCall = logger.calls.find(
				(c) =>
					c.method === "info" &&
					String(c.args[0]).includes("non-interactive mode"),
			);
			expect(nonInteractiveCall).toBeDefined();

			// Should have plugin_installed actions
			const installedActions = result.actions.filter(
				(a) => a.type === "plugin_installed",
			);
			expect(installedActions.length).toBe(2);
		});

		test("executes installation successfully for Claude Code (mocked)", async () => {
			const logger = createTrackingMockLogger();
			const claudeTool = createClaudeCodeTool();
			const deps = createSuccessDeps();

			const result = await executePluginInstallation(
				claudeTool,
				{ isTTY: false },
				logger,
				defaultPluginInstallConfig,
				deps,
			);

			// Should have plugin_installed actions for both plugins
			const installedActions = result.actions.filter(
				(a) => a.type === "plugin_installed",
			);
			expect(installedActions.length).toBe(2);

			const pluginNames = installedActions.map((a) =>
				a.type === "plugin_installed" ? a.name : "",
			);
			expect(pluginNames).toContain("rp1-base");
			expect(pluginNames).toContain("rp1-dev");

			// Result should indicate success
			expect(result.result).not.toBeNull();
			expect(result.result?.success).toBe(true);
		});

		test("handles installation failure gracefully", async () => {
			const logger = createTrackingMockLogger();
			const claudeTool = createClaudeCodeTool();
			const deps = createInstallFailDeps();

			const result = await executePluginInstallation(
				claudeTool,
				{ isTTY: false },
				logger,
				defaultPluginInstallConfig,
				deps,
			);

			// Should have plugin_install_failed action
			const failedAction = result.actions.find(
				(a) => a.type === "plugin_install_failed",
			);
			expect(failedAction).toBeDefined();

			if (failedAction && failedAction.type === "plugin_install_failed") {
				expect(failedAction.name).toBe("rp1-plugins");
				expect(failedAction.error).toBeDefined();
			}

			// Should show manual installation link
			const manualCall = logger.calls.find(
				(c) =>
					c.method === "info" &&
					String(c.args[0]).includes("installing manually"),
			);
			expect(manualCall).toBeDefined();

			// Result should indicate failure
			expect(result.result).not.toBeNull();
			expect(result.result?.success).toBe(false);
		});
	});

	describe("installClaudeCodePlugins", () => {
		test("executes installation successfully with mocked dependencies", async () => {
			const logger = createMockLogger();
			const deps = createSuccessDeps();
			const config: PluginInstallConfig = { dryRun: false, scope: "user" };

			const result = await installClaudeCodePlugins(
				config,
				logger,
				false,
				deps,
			)();

			// installClaudeCodePlugins never fails - errors become failed results
			expect(result._tag).toBe("Right");

			if (result._tag === "Right") {
				expect(result.right.success).toBe(true);
				expect(result.right.pluginsInstalled).toContain("rp1-base");
				expect(result.right.pluginsInstalled).toContain("rp1-dev");
			}
		});

		test("handles installation failure gracefully", async () => {
			const logger = createMockLogger();
			const deps = createInstallFailDeps();
			const config: PluginInstallConfig = { dryRun: false, scope: "user" };

			const result = await installClaudeCodePlugins(
				config,
				logger,
				false,
				deps,
			)();

			// Should still return Right (errors are converted to failed results)
			expect(result._tag).toBe("Right");

			if (result._tag === "Right") {
				expect(result.right.success).toBe(false);
				expect(result.right.pluginsInstalled).toHaveLength(0);
				expect(result.right.error).toBeDefined();
			}
		});

		test("handles prerequisite check failure gracefully", async () => {
			const logger = createMockLogger();
			const deps = createPrereqFailDeps();
			const config: PluginInstallConfig = { dryRun: false, scope: "user" };

			const result = await installClaudeCodePlugins(
				config,
				logger,
				false,
				deps,
			)();

			// Should return Right with failed result (errors converted via orElse)
			expect(result._tag).toBe("Right");

			if (result._tag === "Right") {
				expect(result.right.success).toBe(false);
				expect(result.right.error).toBeDefined();
			}
		});

		test("passes config to installPlugins", async () => {
			let capturedScope: string | undefined;
			let capturedDryRun: boolean | undefined;
			let capturedIsTTY: boolean | undefined;

			const deps: PluginInstallDeps = {
				runPrerequisiteChecks: () =>
					TE.right([
						{
							check: "claude-installed",
							passed: true,
							message: "OK",
							value: "1.0.40",
						},
					] as readonly ClaudeCodePrerequisiteResult[]),
				installPlugins: (scope, _logger, dryRun, isTTY) => {
					capturedScope = scope;
					capturedDryRun = dryRun;
					capturedIsTTY = isTTY;
					return TE.right({
						marketplaceAdded: true,
						pluginsInstalled: [],
						warnings: [],
					} as ClaudeCodeInstallResult);
				},
			};

			const config: PluginInstallConfig = { dryRun: true, scope: "project" };
			const logger = createMockLogger();

			await installClaudeCodePlugins(config, logger, true, deps)();

			expect(capturedScope).toBe("project");
			expect(capturedDryRun).toBe(true);
			expect(capturedIsTTY).toBe(true);
		});
	});

	describe("defaultPluginInstallConfig", () => {
		test("has correct default values", () => {
			expect(defaultPluginInstallConfig.dryRun).toBe(false);
			expect(defaultPluginInstallConfig.scope).toBe("user");
		});
	});

	describe("defaultPluginInstallDeps", () => {
		test("exports real dependencies", () => {
			// Just verify the exports exist and are functions
			expect(typeof defaultPluginInstallDeps.runPrerequisiteChecks).toBe(
				"function",
			);
			expect(typeof defaultPluginInstallDeps.installPlugins).toBe("function");
		});
	});

	describe("installation with warnings", () => {
		test("logs warnings from installation result", async () => {
			const logger = createTrackingMockLogger();
			const claudeTool = createClaudeCodeTool();

			const deps: PluginInstallDeps = {
				runPrerequisiteChecks: () =>
					TE.right([
						{
							check: "claude-installed",
							passed: true,
							message: "OK",
							value: "1.0.40",
						},
					] as readonly ClaudeCodePrerequisiteResult[]),
				installPlugins: (_scope, _logger, _dryRun, _isTTY) =>
					TE.right({
						marketplaceAdded: true,
						pluginsInstalled: ["rp1-base"],
						warnings: ["Plugin rp1-dev was already installed"],
					} as ClaudeCodeInstallResult),
			};

			await executePluginInstallation(
				claudeTool,
				{ isTTY: false },
				logger,
				defaultPluginInstallConfig,
				deps,
			);

			// Should log the warning
			const warnCall = logger.calls.find(
				(c) =>
					c.method === "warn" &&
					String(c.args[0]).includes("already installed"),
			);
			expect(warnCall).toBeDefined();
		});
	});
});
