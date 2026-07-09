/**
 * Plugin update subcommand for rp1.
 * Updates rp1 plugins for detected or specified agentic tools.
 */

import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import { formatError, getExitCode } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import { loadToolsRegistry } from "../../config/supported-tools.js";
import { detectTools } from "../../init/tool-detector.js";
import { getColorFns } from "../../lib/colors.js";
import {
	getEffectiveHarnesses,
	type InstallAllResult,
	type InstallContext,
	installAllDetectedTools,
	type ToolInstallResult,
	updateForSpecificTool,
} from "../../shared/install-core.js";

interface PluginsSubcommandDeps {
	readonly loadToolsRegistry: typeof loadToolsRegistry;
	readonly installAllDetectedTools: typeof installAllDetectedTools;
	readonly updateForSpecificTool: typeof updateForSpecificTool;
	readonly detectTools: typeof detectTools;
	readonly getEffectiveHarnesses: typeof getEffectiveHarnesses;
}

const defaultPluginsSubcommandDeps: PluginsSubcommandDeps = {
	loadToolsRegistry,
	installAllDetectedTools,
	updateForSpecificTool,
	detectTools,
	getEffectiveHarnesses,
};

/**
 * Valid tool identifiers for plugin updates.
 */
const VALID_TOOLS = [
	"claude-code",
	"opencode",
	"codex",
	"copilot",
	"antigravity",
] as const;
type ValidTool = (typeof VALID_TOOLS)[number];

const formatToolList = (toolNames: readonly string[]): string => {
	if (toolNames.length === 0) {
		return "your agentic tools";
	}
	if (toolNames.length === 1) {
		return toolNames[0];
	}
	if (toolNames.length === 2) {
		return `${toolNames[0]} and ${toolNames[1]}`;
	}
	return `${toolNames.slice(0, -1).join(", ")}, and ${toolNames.at(-1)}`;
};

/**
 * Format output for plugin update result.
 */
export const formatPluginUpdateResult = (
	result: ToolInstallResult,
	isTTY: boolean,
): void => {
	const { green, red, yellow, dim } = getColorFns(isTTY);

	if (result.skipped) {
		console.log(yellow(`${result.toolName}: Plugin update skipped`));
	} else if (result.success) {
		console.log(green(`${result.toolName}: Plugins updated successfully`));
		if (result.pluginsInstalled.length > 0) {
			console.log(dim(`  Plugins: ${result.pluginsInstalled.join(", ")}`));
		}
	} else {
		console.log(red(`${result.toolName}: Plugin update failed`));
		if (result.error) {
			console.log(dim(`  Error: ${formatError(result.error, false)}`));
		}
	}

	if (result.details && result.details.length > 0) {
		for (const detail of result.details) {
			console.log(dim(`  ${detail}`));
		}
	}

	if (result.warnings.length > 0) {
		for (const warning of result.warnings) {
			console.log(yellow(`  Warning: ${warning}`));
		}
	}
};

/**
 * Format output for update all result.
 */
export const formatUpdateAllResult = (
	result: InstallAllResult,
	isTTY: boolean,
): void => {
	const { green, yellow, bold, dim } = getColorFns(isTTY);
	const skipped = result.results.filter((res) => res.skipped).length;
	const failed = result.results.filter((res) => !res.success && !res.skipped);

	console.log("");
	console.log(bold("Plugin Update Summary"));
	console.log(dim("---------------------"));
	console.log(
		`Detected tools: ${result.detected.map((d) => d.tool.name).join(", ")}`,
	);
	console.log(
		`Successfully updated: ${result.installed}/${result.results.length}`,
	);
	if (skipped > 0) {
		console.log(`Skipped: ${skipped}`);
	}
	console.log("");

	for (const res of result.results) {
		formatPluginUpdateResult(res, isTTY);
	}

	console.log("");
	if (failed.length === 0 && result.installed === result.results.length) {
		console.log(green(bold("All plugins updated successfully.")));
	} else if (failed.length === 0 && result.installed > 0) {
		console.log(
			yellow(bold("Plugin update completed with skipped tools listed above.")),
		);
	} else if (failed.length === 0) {
		console.log(
			yellow(
				bold(
					"No automatic plugin updates were applied; skipped tools are listed above.",
				),
			),
		);
	} else if (result.installed > 0) {
		console.log(
			yellow(bold("Some plugins failed to update. See errors above.")),
		);
	} else {
		console.log(yellow(bold("No plugins were updated. See errors above.")));
	}
};

/**
 * Plugins update subcommand.
 *
 * Usage:
 *   rp1 update plugins [tool]
 *
 * Arguments:
 *   tool - Specific tool to update (claude-code, opencode, codex, copilot, antigravity) or "all"
 *          If omitted, defaults to "all"
 *
 * Options:
 *   --dry-run  Show what would be done without executing
 *   -y, --yes  Skip confirmation prompts
 */
export const createPluginsSubcommand = (
	deps: PluginsSubcommandDeps = defaultPluginsSubcommandDeps,
): Command =>
	new Command("plugins")
		.description("Update rp1 plugins for agentic tools")
		.argument(
			"[tool]",
			'Tool to update: "all", "claude-code", "opencode", "codex", "copilot", or "antigravity" (default: "all")',
		)
		.option("--dry-run", "Show what would be done without executing", false)
		.option("-y, --yes", "Skip confirmation prompts", false)
		.addHelpText(
			"after",
			`
Arguments:
  tool  The tool to update plugins for:
        - all          Update plugins for all detected tools (default)
        - claude-code  Update plugins for Claude Code only
        - opencode     Update plugins for OpenCode only
        - codex        Update plugins for Codex only
        - copilot      Update plugins for Copilot CLI only
        - antigravity  Refresh Antigravity CLI package assets only

Examples:
  rp1 update plugins           Update plugins for all detected tools
  rp1 update plugins all       Same as above (explicit)
  rp1 update plugins claude-code  Update Claude Code plugins only
  rp1 update plugins opencode     Update OpenCode plugins only
  rp1 update plugins codex        Update Codex plugins only
  rp1 update plugins copilot      Update Copilot CLI plugins only
  rp1 update plugins antigravity  Refresh Antigravity package assets
  rp1 update plugins --dry-run    Preview what would be updated
`,
		)
		.action(async (tool: string | undefined, options, command) => {
			const logger = command.parent?.parent?._logger as Logger | undefined;
			const isTTY =
				command.parent?.parent?._isTTY ?? process.stdout.isTTY ?? false;
			const { bold, dim } = getColorFns(isTTY);

			if (!logger) {
				console.error("Logger not initialized");
				process.exit(1);
			}

			const parentOptions = command.parent?.opts?.() ?? {};
			const dryRun = Boolean(options.dryRun || parentOptions.dryRun);
			const yes = Boolean(options.yes || parentOptions.yes);

			// Default to "all" if no tool specified
			const targetTool = tool ?? "all";

			// Validate tool argument
			if (
				targetTool !== "all" &&
				!VALID_TOOLS.includes(targetTool as ValidTool)
			) {
				console.error(
					`Invalid tool: ${targetTool}. Use "all", "claude-code", "opencode", "codex", "copilot", or "antigravity".`,
				);
				process.exit(1);
			}

			logger.debug(
				`Plugin update starting (tool=${targetTool}, dry-run=${dryRun}, yes=${yes})`,
			);

			// Build installation context
			const ctx: InstallContext = {
				logger,
				isTTY,
				dryRun,
				skipPrompt: yes || !isTTY,
			};

			// Load tools registry
			const registry = await deps.loadToolsRegistry();

			if (dryRun) {
				console.log(bold("\nDry run mode - showing what would be done:\n"));
			}

			let restartTargets: string[] = [];

			if (targetTool === "all") {
				// Detect tools and filter to effective harnesses
				console.log("Detecting installed tools...");
				const detection = await deps.detectTools(registry)();

				if (E.isLeft(detection) || detection.right.detected.length === 0) {
					console.log(
						"No installed agentic tools detected. Nothing to update.",
					);
					process.exit(0);
				}

				const effective = deps.getEffectiveHarnesses(detection.right);

				if (effective.length === 0) {
					console.log(
						"No enabled harnesses among detected tools. Nothing to update.",
					);
					process.exit(0);
				}

				const results: ToolInstallResult[] = [];
				for (const tool of effective) {
					const toolResult = await deps.updateForSpecificTool(
						tool.tool.id,
						registry,
						ctx,
					)();
					if (E.isRight(toolResult)) {
						results.push(toolResult.right);
					} else {
						results.push({
							toolId: tool.tool.id,
							toolName: tool.tool.name,
							success: false,
							pluginsInstalled: [],
							warnings: [],
							error: toolResult.left,
						});
					}
				}

				const allResult: InstallAllResult = {
					installed: results.filter((r) => r.success).length,
					results,
					detected: effective,
				};

				formatUpdateAllResult(allResult, isTTY);
				restartTargets = results
					.filter(
						(toolResult) =>
							toolResult.success && toolResult.restartRequired !== false,
					)
					.map((toolResult) => toolResult.toolName);

				// Exit with error if any failed
				if (
					results.some(
						(toolResult) => !toolResult.success && !toolResult.skipped,
					)
				) {
					process.exit(1);
				}
			} else {
				// Update specific tool
				console.log(`Updating plugins for ${targetTool}...`);
				const result = await deps.updateForSpecificTool(
					targetTool,
					registry,
					ctx,
				)();

				if (E.isLeft(result)) {
					console.error(formatError(result.left, isTTY));
					process.exit(getExitCode(result.left));
				}

				console.log("");
				formatPluginUpdateResult(result.right, isTTY);
				restartTargets =
					result.right.success && result.right.restartRequired !== false
						? [result.right.toolName]
						: [];

				if (!result.right.success) {
					process.exit(1);
				}
			}

			if (!dryRun && restartTargets.length > 0) {
				console.log("");
				console.log(
					dim(
						`Please restart ${formatToolList(restartTargets)} to use the updated plugins.`,
					),
				);
			}

			process.exit(0);
		});

export const pluginsSubcommand = createPluginsSubcommand();
