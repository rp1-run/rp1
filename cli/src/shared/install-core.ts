/**
 * Shared installation logic for rp1 plugins.
 * Provides core functions used by both `rp1 init` and `rp1 install` commands.
 */

import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipe } from "fp-ts/lib/function.js";
import * as RA from "fp-ts/lib/ReadonlyArray.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../shared/errors.js";
import { installError, usageError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import {
	collectPlatformPlugins,
	getBundledAssets,
	hasBundledAssets,
} from "../assets/index.js";
import {
	getEnabledTools,
	isToolEnabled,
	type ToolsRegistry,
} from "../config/supported-tools.js";
import {
	type DetectedTool,
	detectTools,
	type ToolDetectionResult,
} from "../init/tool-detector.js";
import { extractPlatformAssets } from "../install/asset-extractor.js";
import { installAllPlugins } from "../install/claudecode/installer.js";
import type { ClaudeCodeInstallResult } from "../install/claudecode/models.js";
import { runAllPrerequisiteChecks } from "../install/claudecode/prerequisites.js";
import {
	getDefaultCodexArtifactsDir,
	installCodex,
} from "../install/codex/index.js";
import type { CodexInstallResult } from "../install/codex/models.js";
import {
	executeInstall,
	type InstallArgs,
	type InstallOptions,
} from "../install/command.js";
import { writeVersionMarker } from "../install/version-marker.js";
import { getInstalledVersion } from "../lib/version.js";

/**
 * Context for installation operations.
 * Provides shared configuration for all installation functions.
 */
export interface InstallContext {
	readonly logger: Logger;
	readonly isTTY: boolean;
	readonly dryRun: boolean;
	readonly skipPrompt: boolean;
}

/**
 * Result of installing plugins to a single tool.
 */
export interface ToolInstallResult {
	readonly toolId: string;
	readonly toolName: string;
	readonly success: boolean;
	readonly pluginsInstalled: readonly string[];
	readonly warnings: readonly string[];
	readonly error?: CLIError;
}

/**
 * Result of installing plugins to all detected tools.
 */
export interface InstallAllResult {
	readonly installed: number;
	readonly results: readonly ToolInstallResult[];
	readonly detected: readonly DetectedTool[];
}

/**
 * Install rp1 plugins to Claude Code.
 * Runs prerequisite checks and installs both rp1-base and rp1-dev plugins.
 *
 * @param scope - Installation scope: "user", "project", or "local"
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with ClaudeCodeInstallResult on success or CLIError on failure
 */
export const installClaudeCodePlugins = (
	scope: "user" | "project" | "local",
	ctx: InstallContext,
): TE.TaskEither<CLIError, ClaudeCodeInstallResult> =>
	pipe(
		// Step 1: Run prerequisite checks
		runAllPrerequisiteChecks(),
		// Step 2: Install all plugins via Claude CLI
		TE.chain(() => installAllPlugins(scope, ctx.logger, ctx.dryRun, ctx.isTTY)),
	);

/**
 * Build args array for OpenCode installation from context.
 */
const buildOpenCodeArgs = (
	config: Partial<InstallArgs>,
	ctx: InstallContext,
): string[] => {
	const args: string[] = [];

	if (config.artifactsDir) {
		args.push("--artifacts-dir", config.artifactsDir);
	}

	if (ctx.dryRun) {
		args.push("--dry-run");
	}

	if (ctx.skipPrompt) {
		args.push("--yes");
	}

	return args;
};

/**
 * Install rp1 plugins to OpenCode.
 * Copies plugin artifacts to the OpenCode configuration directory.
 *
 * @param config - Optional configuration for artifacts directory, etc.
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with void on success or CLIError on failure
 */
/**
 * Result of installing OpenCode plugins.
 */
export interface OpenCodeInstallResult {
	readonly pluginsInstalled: readonly string[];
	readonly warnings: readonly string[];
}

export const installOpenCodePlugins = (
	config: Partial<InstallArgs>,
	ctx: InstallContext,
): TE.TaskEither<CLIError, OpenCodeInstallResult> => {
	const args = buildOpenCodeArgs(config, ctx);
	const options: InstallOptions = {
		isTTY: ctx.isTTY,
		skipPrompt: ctx.skipPrompt,
	};

	return pipe(
		executeInstall(args, ctx.logger, options),
		TE.map((): OpenCodeInstallResult => {
			// Derive installed plugins from bundled assets when available
			const assetsResult = getBundledAssets();
			if ("right" in assetsResult) {
				const platform = assetsResult.right.platforms.opencode;
				if (platform) {
					return {
						pluginsInstalled: collectPlatformPlugins(platform).map(
							(p) => p.name,
						),
						warnings: [],
					};
				}
			}
			// Fallback: report required plugins (optional plugins unknown without manifest)
			return {
				pluginsInstalled: ["rp1-base", "rp1-dev"],
				warnings: [],
			};
		}),
	);
};

/**
 * Install rp1 plugins to Codex CLI.
 * When running from a bundled binary, extracts Codex assets from the embedded
 * manifest to a temp staging directory before installing. When not bundled,
 * uses the existing dist/ or artifactsDir path (dev mode).
 * Writes a version marker after successful install.
 *
 * @param config - Optional configuration for artifacts directory, etc.
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with CodexInstallResult on success or CLIError on failure
 */
export const installCodexPlugins = (
	config: Partial<{ artifactsDir: string | null }>,
	ctx: InstallContext,
): TE.TaskEither<CLIError, CodexInstallResult> => {
	if (config.artifactsDir == null && hasBundledAssets()) {
		return installCodexFromBundled(ctx);
	}

	const artifactsDir =
		config.artifactsDir ?? getDefaultCodexArtifactsDir() ?? "dist/codex";

	return pipe(
		installCodex(
			{
				artifactsDir,
				dryRun: ctx.dryRun,
				yes: ctx.skipPrompt,
			},
			ctx,
		),
		TE.chainFirst(() => writeVersionMarker("codex", getInstalledVersion())),
	);
};

/**
 * Install Codex plugins from bundled binary assets.
 * Extracts to a temp staging directory, installs from there, then cleans up.
 */
const installCodexFromBundled = (
	ctx: InstallContext,
): TE.TaskEither<CLIError, CodexInstallResult> => {
	const stagingDir = join(tmpdir(), `rp1-codex-extract-${Date.now()}`);

	const cleanupStaging = TE.tryCatch(
		() => rm(stagingDir, { recursive: true, force: true }),
		() => usageError("cleanup", "Failed to clean up staging directory"),
	);

	return pipe(
		extractPlatformAssets({
			platform: "codex",
			targetDir: stagingDir,
		}),
		TE.chain(() =>
			pipe(
				installCodex(
					{
						artifactsDir: stagingDir,
						dryRun: ctx.dryRun,
						yes: ctx.skipPrompt,
					},
					ctx,
				),
				TE.chainFirst(() => writeVersionMarker("codex", getInstalledVersion())),
				TE.chainFirst(() => cleanupStaging),
			),
		),
		TE.orElse((error) =>
			pipe(
				cleanupStaging,
				TE.chain(() => TE.left<CLIError, CodexInstallResult>(error)),
			),
		),
	);
};

/**
 * Install plugins for a single detected tool.
 * Routes to the appropriate installation function based on tool ID.
 * This function never fails - errors are captured in the result.
 *
 * @param tool - The detected tool to install plugins for
 * @param ctx - Installation context
 * @returns TaskEither with ToolInstallResult (never fails, errors in result)
 */
const installForTool = (
	tool: DetectedTool,
	ctx: InstallContext,
): TE.TaskEither<CLIError, ToolInstallResult> => {
	const baseResult: Omit<
		ToolInstallResult,
		"success" | "pluginsInstalled" | "warnings" | "error"
	> = {
		toolId: tool.tool.id,
		toolName: tool.tool.name,
	};

	if (tool.tool.id === "claude-code") {
		return pipe(
			installClaudeCodePlugins("user", ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "opencode") {
		return pipe(
			installOpenCodePlugins({}, ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: result.warnings,
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	if (tool.tool.id === "codex") {
		return pipe(
			installCodexPlugins({}, ctx),
			TE.map(
				(result): ToolInstallResult => ({
					...baseResult,
					success: true,
					pluginsInstalled: result.pluginsInstalled,
					warnings: [],
				}),
			),
			TE.orElse(
				(error): TE.TaskEither<CLIError, ToolInstallResult> =>
					TE.right({
						...baseResult,
						success: false,
						pluginsInstalled: [],
						warnings: [],
						error,
					}),
			),
		);
	}

	// Unknown tool - return failure result
	return TE.right({
		...baseResult,
		success: false,
		pluginsInstalled: [],
		warnings: [`Automated installation not supported for ${tool.tool.name}`],
	});
};

/**
 * Detect tools and validate at least one is present.
 * Wraps detectTools to convert from never-failing to CLIError-failing.
 */
const detectToolsWithValidation = (
	registry: ToolsRegistry,
): TE.TaskEither<CLIError, ToolDetectionResult> =>
	TE.tryCatch(
		async () => {
			const result = await detectTools(registry)();
			// detectTools never fails, so result is always Right
			if ("right" in result) {
				const detection = result.right;
				if (detection.detected.length === 0) {
					throw new Error(
						"No agentic tools detected. Install Claude Code or OpenCode first.",
					);
				}
				return detection;
			}
			// This should never happen since detectTools returns TaskEither<never, ...>
			throw new Error("Unexpected detection failure");
		},
		(err) =>
			installError(
				"tool-detection",
				err instanceof Error ? err.message : "Unknown detection error",
			),
	);

/**
 * Install plugins for all detected agentic tools.
 * Detects installed tools (Claude Code, OpenCode, etc.) and installs
 * rp1 plugins for each one.
 *
 * @param registry - The tools registry to detect against
 * @param ctx - Installation context with logger, TTY info, etc.
 * @returns TaskEither with InstallAllResult containing results for each tool
 */
export const installAllDetectedTools = (
	registry: ToolsRegistry,
	ctx: InstallContext,
): TE.TaskEither<CLIError, InstallAllResult> =>
	pipe(
		// Step 1: Detect installed tools with validation
		detectToolsWithValidation(registry),
		// Step 2: Install for each detected tool sequentially
		TE.chain((detection) =>
			pipe(
				detection.detected,
				RA.traverse(TE.ApplicativeSeq)((tool) => installForTool(tool, ctx)),
				TE.map(
					(results): InstallAllResult => ({
						installed: results.filter((r) => r.success).length,
						results,
						detected: detection.detected,
					}),
				),
			),
		),
	);

/**
 * Install plugins for a specific tool by ID.
 * Useful for `rp1 install <tool>` commands.
 *
 * @param toolId - The tool ID ("claude-code", "opencode", or "codex")
 * @param registry - The tools registry to get tool metadata
 * @param ctx - Installation context
 * @returns TaskEither with ToolInstallResult
 */
export const installForSpecificTool = (
	toolId: string,
	registry: ToolsRegistry,
	ctx: InstallContext,
): TE.TaskEither<CLIError, ToolInstallResult> => {
	const tool = registry.tools.find((t) => t.id === toolId);

	if (!tool) {
		const enabledIds = getEnabledTools(registry)
			.map((t) => `"${t.id}"`)
			.join(", ");
		return TE.left(
			installError(
				"invalid-tool",
				`Unknown tool: ${toolId}. Available tools: ${enabledIds}.`,
			),
		);
	}

	if (!isToolEnabled(registry, toolId)) {
		return TE.left(
			installError(
				"disabled-tool",
				`Tool "${toolId}" is currently disabled and cannot be installed.`,
			),
		);
	}

	// Create a synthetic DetectedTool for the installation
	const detectedTool: DetectedTool = {
		tool,
		version: "unknown",
		meetsMinVersion: true,
	};

	return pipe(
		installForTool(detectedTool, ctx),
		TE.chain((result) => {
			if (!result.success && result.error) {
				return TE.left(result.error);
			}
			return TE.right(result);
		}),
	);
};
