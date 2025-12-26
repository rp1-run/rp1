/**
 * Health check step for the rp1 init command.
 * Performs comprehensive validation of the rp1 setup.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { hasFencedContent } from "../comment-fence.js";
import type { HealthReport, PluginStatus, StepCallbacks } from "../models.js";
import { hasShellFencedContent } from "../shell-fence.js";
import type { ReadinessResult } from "./readiness.js";

/**
 * Instruction files to check for rp1 content.
 * Checked in order; first file with fenced content is considered valid.
 */
const INSTRUCTION_FILES = ["CLAUDE.md", "AGENTS.md"] as const;

/**
 * Check if a path exists and is a directory.
 *
 * @param dirPath - Absolute path to check
 * @returns true if path exists and is a directory
 */
async function isDirectory(dirPath: string): Promise<boolean> {
	try {
		const dirStat = await stat(dirPath);
		return dirStat.isDirectory();
	} catch {
		return false;
	}
}

/**
 * Check if any instruction file contains rp1 fenced content.
 *
 * @param cwd - Current working directory
 * @returns true if any instruction file has fenced rp1 content
 */
async function checkInstructionFile(cwd: string): Promise<boolean> {
	for (const file of INSTRUCTION_FILES) {
		const filePath = resolve(cwd, file);
		try {
			const content = await readFile(filePath, "utf-8");
			if (hasFencedContent(content)) {
				return true;
			}
		} catch {
			// File doesn't exist or isn't readable - try next file
		}
	}
	return false;
}

/**
 * Check if .gitignore has rp1 fenced content.
 * Returns true if no .gitignore exists (non-git repo scenario).
 *
 * @param cwd - Current working directory
 * @returns true if gitignore is configured or doesn't exist
 */
async function checkGitignore(cwd: string): Promise<{
	configured: boolean;
	exists: boolean;
}> {
	const gitignorePath = resolve(cwd, ".gitignore");
	try {
		const content = await readFile(gitignorePath, "utf-8");
		return {
			configured: hasShellFencedContent(content),
			exists: true,
		};
	} catch {
		// No .gitignore - skip this check (not a git repo or no gitignore)
		return {
			configured: true, // Consider it configured if not applicable
			exists: false,
		};
	}
}

/**
 * Check if all expected plugins are installed.
 *
 * @param plugins - Array of plugin statuses from verification
 * @returns Whether all plugins are installed
 */
function checkPluginsInstalled(plugins: readonly PluginStatus[]): {
	allInstalled: boolean;
	missingPlugins: readonly string[];
} {
	const missingPlugins = plugins.filter((p) => !p.installed).map((p) => p.name);

	return {
		allInstalled: missingPlugins.length === 0,
		missingPlugins,
	};
}

/**
 * Perform comprehensive health check of rp1 setup.
 * Validates all components are correctly configured.
 *
 * @param cwd - Current working directory
 * @param plugins - Plugin status array from verification step
 * @param readiness - Optional readiness result from parallel checks
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @returns HealthReport with boolean flags and issues array
 */
export async function performHealthCheck(
	cwd: string,
	plugins: readonly PluginStatus[],
	readiness?: ReadinessResult,
	callbacks?: StepCallbacks,
): Promise<HealthReport> {
	const rp1Root = process.env.RP1_ROOT || ".rp1";
	const rp1Dir = resolve(cwd, rp1Root);
	const issues: string[] = [];

	callbacks?.onActivity("Checking rp1 directory structure", "info");

	const rp1DirExists = await isDirectory(rp1Dir);
	if (!rp1DirExists) {
		issues.push(`${rp1Root}/ directory not found`);
	}

	const instructionFileValid = await checkInstructionFile(cwd);
	if (!instructionFileValid) {
		issues.push("Instruction file missing rp1 content");
	}

	const gitignoreResult = await checkGitignore(cwd);
	const gitignoreConfigured = gitignoreResult.configured;
	if (gitignoreResult.exists && !gitignoreResult.configured) {
		issues.push(".gitignore missing rp1 entries");
	}

	const pluginCheck = checkPluginsInstalled(plugins);
	const pluginsInstalled = pluginCheck.allInstalled;
	if (!pluginsInstalled && pluginCheck.missingPlugins.length > 0) {
		issues.push(
			`Plugins not installed: ${pluginCheck.missingPlugins.join(", ")}`,
		);
	}

	const issueCount = issues.length;
	if (issueCount === 0) {
		callbacks?.onActivity("All health checks passed", "success");
	} else {
		callbacks?.onActivity(`Found ${issueCount} issue(s)`, "warning");
	}

	return {
		rp1DirExists,
		instructionFileValid,
		gitignoreConfigured,
		pluginsInstalled,
		plugins,
		issues,
		kbExists: readiness?.kbExists ?? false,
		charterExists: readiness?.charterExists ?? false,
	};
}
