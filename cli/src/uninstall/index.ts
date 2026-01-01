/**
 * Main uninstall executor for the rp1 uninstall command.
 * Removes rp1 injections from instruction files and gitignore,
 * uninstalls Claude Code plugins, but preserves .rp1 directory.
 */

import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, runtimeError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { confirmAction, type PromptOptions } from "../../shared/prompts.js";
import { findFencedContent, hasFencedContent } from "../init/comment-fence.js";
import {
	findShellFencedContent,
	hasShellFencedContent,
} from "../init/shell-fence.js";
import type {
	UninstallAction,
	UninstallConfig,
	UninstallResult,
} from "./models.js";

export type {
	UninstallAction,
	UninstallConfig,
	UninstallResult,
} from "./models.js";

const execAsync = promisify(exec);

const COMMAND_TIMEOUT = 30000;

/**
 * Check if a file exists.
 */
async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Check if a directory exists.
 */
async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Read file content safely.
 */
async function readFileContent(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

/**
 * Write file content.
 */
async function writeFileContent(
	filePath: string,
	content: string,
): Promise<void> {
	await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Remove fenced content from a markdown file (CLAUDE.md, AGENTS.md).
 * Uses HTML comment markers: <!-- rp1:start --> and <!-- rp1:end -->
 */
function removeFencedContent(content: string): string {
	const position = findFencedContent(content);
	if (!position) return content;

	const before = content.slice(0, position.start);
	const after = content.slice(position.end);

	// Clean up extra newlines around the removed section
	const result = (before.trimEnd() + after.trimStart()).trim();
	return result.length > 0 ? `${result}\n` : "";
}

/**
 * Remove shell-fenced content from a file (.gitignore).
 * Uses hash comment markers: # rp1:start and # rp1:end
 */
function removeShellFencedContent(content: string): string {
	const position = findShellFencedContent(content);
	if (!position) return content;

	const before = content.slice(0, position.start);
	const after = content.slice(position.end);

	// Clean up extra newlines around the removed section
	const result = (before.trimEnd() + after.trimStart()).trim();
	return result.length > 0 ? `${result}\n` : "";
}

/**
 * Remove rp1 fenced content from an instruction file.
 */
async function cleanInstructionFile(
	cwd: string,
	filename: string,
	dryRun: boolean,
	logger: Logger,
): Promise<UninstallAction | null> {
	const filePath = path.resolve(cwd, filename);

	if (!(await fileExists(filePath))) {
		return null;
	}

	const content = await readFileContent(filePath);
	if (content === null || !hasFencedContent(content)) {
		return null;
	}

	const newContent = removeFencedContent(content);

	if (dryRun) {
		logger.info(`[dry-run] Would remove rp1 content from ${filename}`);
	} else {
		if (newContent.trim().length === 0) {
			// File would be empty after removal - delete it
			await fs.unlink(filePath);
			logger.success(`Removed ${filename} (was only rp1 content)`);
			return { type: "file_emptied", path: filePath };
		}
		await writeFileContent(filePath, newContent);
		logger.success(`Removed rp1 content from ${filename}`);
	}

	return { type: "removed_fenced_content", path: filePath };
}

/**
 * Remove rp1 fenced content from .gitignore.
 */
async function cleanGitignore(
	cwd: string,
	dryRun: boolean,
	logger: Logger,
): Promise<UninstallAction | null> {
	const gitignorePath = path.resolve(cwd, ".gitignore");

	if (!(await fileExists(gitignorePath))) {
		return null;
	}

	const content = await readFileContent(gitignorePath);
	if (content === null || !hasShellFencedContent(content)) {
		return null;
	}

	const newContent = removeShellFencedContent(content);

	if (dryRun) {
		logger.info("[dry-run] Would remove rp1 entries from .gitignore");
	} else {
		if (newContent.trim().length === 0) {
			// File would be empty after removal - delete it
			await fs.unlink(gitignorePath);
			logger.success("Removed .gitignore (was only rp1 content)");
			return { type: "file_emptied", path: gitignorePath };
		}
		await writeFileContent(gitignorePath, newContent);
		logger.success("Removed rp1 entries from .gitignore");
	}

	return { type: "removed_fenced_content", path: gitignorePath };
}

/**
 * Check if Claude Code is available.
 */
async function isClaudeCodeAvailable(): Promise<boolean> {
	try {
		await execAsync("claude --version", { timeout: 5000 });
		return true;
	} catch {
		return false;
	}
}

/**
 * Uninstall a plugin from Claude Code.
 */
async function uninstallClaudePlugin(
	pluginName: string,
	scope: string,
	dryRun: boolean,
	logger: Logger,
): Promise<UninstallAction> {
	const scopeArg = `--scope ${scope}`;
	const command = `claude plugin uninstall ${pluginName} ${scopeArg}`;

	if (dryRun) {
		logger.info(`[dry-run] Would execute: ${command}`);
		return { type: "plugin_uninstalled", name: pluginName };
	}

	try {
		await execAsync(command, { timeout: COMMAND_TIMEOUT });
		logger.success(`Uninstalled plugin: ${pluginName}`);
		return { type: "plugin_uninstalled", name: pluginName };
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		// Check if plugin wasn't installed
		if (message.includes("not found") || message.includes("not installed")) {
			logger.info(`Plugin ${pluginName} was not installed`);
			return {
				type: "skipped",
				reason: `Plugin ${pluginName} was not installed`,
			};
		}
		logger.warn(`Failed to uninstall ${pluginName}: ${message}`);
		return {
			type: "plugin_uninstall_failed",
			name: pluginName,
			error: message,
		};
	}
}

/**
 * Uninstall all rp1 plugins from Claude Code.
 */
async function uninstallClaudePlugins(
	scope: string,
	dryRun: boolean,
	logger: Logger,
): Promise<UninstallAction[]> {
	const actions: UninstallAction[] = [];
	const plugins = ["rp1-dev", "rp1-base"]; // Uninstall dev first (depends on base)

	for (const plugin of plugins) {
		const action = await uninstallClaudePlugin(plugin, scope, dryRun, logger);
		actions.push(action);
	}

	return actions;
}

/**
 * Execute the full uninstall workflow.
 */
export function executeUninstall(
	config: UninstallConfig,
	logger: Logger,
	promptOptions: PromptOptions,
): TE.TaskEither<CLIError, UninstallResult> {
	return pipe(
		TE.tryCatch(
			async (): Promise<UninstallResult> => {
				const cwd = process.cwd();
				const actions: UninstallAction[] = [];
				const warnings: string[] = [];
				const manualCleanup: string[] = [];

				// Check if anything to uninstall
				const rp1Dir = path.resolve(cwd, process.env.RP1_ROOT || ".rp1");
				const hasRp1Dir = await directoryExists(rp1Dir);
				const claudeExists = await fileExists(path.resolve(cwd, "CLAUDE.md"));
				const agentsExists = await fileExists(path.resolve(cwd, "AGENTS.md"));
				const gitignoreExists = await fileExists(
					path.resolve(cwd, ".gitignore"),
				);

				let hasRp1Content = false;
				if (claudeExists) {
					const content = await readFileContent(path.resolve(cwd, "CLAUDE.md"));
					if (content && hasFencedContent(content)) hasRp1Content = true;
				}
				if (agentsExists) {
					const content = await readFileContent(path.resolve(cwd, "AGENTS.md"));
					if (content && hasFencedContent(content)) hasRp1Content = true;
				}
				if (gitignoreExists) {
					const content = await readFileContent(
						path.resolve(cwd, ".gitignore"),
					);
					if (content && hasShellFencedContent(content)) hasRp1Content = true;
				}

				const claudeAvailable = await isClaudeCodeAvailable();

				if (!hasRp1Dir && !hasRp1Content && !claudeAvailable) {
					logger.info("No rp1 installation found in this directory.");
					return {
						actions: [{ type: "no_changes", component: "project" }],
						warnings: [],
						manualCleanup: [],
					};
				}

				// Confirm uninstall if interactive
				if (promptOptions.isTTY && !config.yes) {
					logger.info("\nThe following will be removed:");
					if (hasRp1Content) {
						logger.info("  - rp1 content from CLAUDE.md/AGENTS.md");
						logger.info("  - rp1 entries from .gitignore");
					}
					if (claudeAvailable) {
						logger.info("  - rp1-base and rp1-dev Claude Code plugins");
					}
					if (hasRp1Dir) {
						logger.info(`\nThe ${rp1Dir} directory will be preserved.`);
						logger.info("You can remove it manually if desired.");
					}
					logger.info("");

					const confirmed = await confirmAction(
						"Proceed with uninstall?",
						promptOptions,
					);
					if (!confirmed) {
						logger.info("Uninstall cancelled.");
						return {
							actions: [{ type: "skipped", reason: "User cancelled" }],
							warnings: [],
							manualCleanup: [],
						};
					}
				}

				// Step 1: Clean instruction files
				const claudeAction = await cleanInstructionFile(
					cwd,
					"CLAUDE.md",
					config.dryRun,
					logger,
				);
				if (claudeAction) actions.push(claudeAction);

				const agentsAction = await cleanInstructionFile(
					cwd,
					"AGENTS.md",
					config.dryRun,
					logger,
				);
				if (agentsAction) actions.push(agentsAction);

				// Step 2: Clean .gitignore
				const gitignoreAction = await cleanGitignore(
					cwd,
					config.dryRun,
					logger,
				);
				if (gitignoreAction) actions.push(gitignoreAction);

				// Step 3: Uninstall Claude Code plugins
				if (claudeAvailable) {
					const pluginActions = await uninstallClaudePlugins(
						config.scope,
						config.dryRun,
						logger,
					);
					actions.push(...pluginActions);
				}

				// Step 4: Note manual cleanup items
				if (hasRp1Dir) {
					manualCleanup.push(
						`The ${rp1Dir} directory contains your knowledge base and work artifacts.`,
						"To remove it completely, run:",
						`  rm -rf ${rp1Dir}`,
					);
				}

				return {
					actions,
					warnings,
					manualCleanup,
				};
			},
			(error): CLIError => {
				const message = error instanceof Error ? error.message : String(error);
				return runtimeError(message, error);
			},
		),
	);
}
