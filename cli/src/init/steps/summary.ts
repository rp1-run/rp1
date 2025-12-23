/**
 * Summary display step for the rp1 init command.
 * Generates contextual next steps and displays comprehensive summary.
 */

import type { Logger } from "../../../shared/logger.js";
import { getColorFns } from "../../lib/colors.js";
import type { HealthReport, InitAction, NextStep } from "../models.js";
import type { DetectedTool } from "../tool-detector.js";

/**
 * Generate next steps based on init result.
 * Produces contextual NextStep array based on health report and detected tool.
 *
 * @param healthReport - Health check report (may be null)
 * @param detectedTool - Primary detected tool (may be null)
 * @param hasKBContent - Whether KB content exists (.rp1/context/index.md)
 * @returns Array of next steps ordered by priority
 */
export function generateNextSteps(
	healthReport: HealthReport | null,
	detectedTool: DetectedTool | null,
	hasKBContent: boolean,
): NextStep[] {
	const steps: NextStep[] = [];
	let order = 1;

	// If plugins were just installed, restart AI tool
	if (healthReport?.pluginsInstalled) {
		steps.push({
			order: order++,
			action: `Restart ${detectedTool?.tool.name ?? "your AI tool"} to load plugins`,
			required: true,
		});
	}

	// If no KB content, suggest building
	if (!hasKBContent) {
		steps.push({
			order: order++,
			action: "Build knowledge base to analyze your codebase",
			command: "/knowledge-build",
			required: false,
		});
	}

	// If no AI tool detected, suggest installing one
	if (!detectedTool) {
		steps.push({
			order: order++,
			action: "Install an AI coding tool (Claude Code or OpenCode)",
			required: true,
		});
	}

	return steps;
}

/**
 * Count actions by type category.
 *
 * @param actions - Array of init actions
 * @returns Object with counts for each category
 */
function countActions(actions: readonly InitAction[]): {
	created: number;
	updated: number;
	installed: number;
	failed: number;
} {
	let created = 0;
	let updated = 0;
	let installed = 0;
	let failed = 0;

	for (const action of actions) {
		switch (action.type) {
			case "created_directory":
			case "created_file":
				created++;
				break;
			case "updated_file":
				updated++;
				break;
			case "plugin_installed":
			case "plugin_updated":
				installed++;
				break;
			case "plugin_install_failed":
			case "verification_failed":
				failed++;
				break;
		}
	}

	return { created, updated, installed, failed };
}

/**
 * Display comprehensive summary of initialization.
 * Renders formatted output with color coding.
 *
 * @param actions - All actions taken during initialization
 * @param healthReport - Health check report (may be null)
 * @param nextSteps - Generated next steps for the user
 * @param detectedTool - Primary detected tool (may be null)
 * @param logger - Logger instance for output
 * @param isTTY - Whether output is a TTY (for color support)
 */
export function displaySummary(
	actions: readonly InitAction[],
	healthReport: HealthReport | null,
	nextSteps: readonly NextStep[],
	detectedTool: DetectedTool | null,
	logger: Logger,
	isTTY: boolean,
): void {
	const color = getColorFns(isTTY);

	// Count actions by type
	const counts = countActions(actions);

	// Header
	logger.info("");
	logger.info(
		color.bold("==================================================="),
	);
	logger.info(
		color.bold("           rp1 Initialization Summary              "),
	);
	logger.info(
		color.bold("==================================================="),
	);
	logger.info("");

	// Actions summary
	logger.info(color.dim("Actions:"));
	if (counts.created > 0) {
		logger.info(`  ${color.green("\u2713")} ${counts.created} created`);
	}
	if (counts.updated > 0) {
		logger.info(`  ${color.green("\u2713")} ${counts.updated} updated`);
	}
	if (counts.installed > 0) {
		logger.info(
			`  ${color.green("\u2713")} ${counts.installed} plugins installed`,
		);
	}
	if (counts.failed > 0) {
		logger.info(`  ${color.red("\u2717")} ${counts.failed} failed`);
	}
	// Handle case where no significant actions occurred
	if (
		counts.created === 0 &&
		counts.updated === 0 &&
		counts.installed === 0 &&
		counts.failed === 0
	) {
		logger.info(`  ${color.dim("No changes made")}`);
	}

	// Detected tool
	if (detectedTool) {
		logger.info("");
		logger.info(color.dim("Detected Tool:"));
		const versionStr =
			detectedTool.version === "unknown"
				? "(version unknown)"
				: `v${detectedTool.version}`;
		logger.info(`  ${detectedTool.tool.name} ${versionStr}`);
	}

	// Health status
	if (healthReport) {
		logger.info("");
		logger.info(color.dim("Health Check:"));

		const check = (ok: boolean, label: string) => {
			const icon = ok ? color.green("\u2713") : color.red("\u2717");
			logger.info(`  ${icon} ${label}`);
		};

		check(healthReport.rp1DirExists, ".rp1/ directory");
		check(healthReport.instructionFileValid, "Instruction file");
		check(healthReport.gitignoreConfigured, ".gitignore");
		check(healthReport.pluginsInstalled, "Plugins");
	}

	// Next steps
	if (nextSteps.length > 0) {
		logger.info("");
		logger.info(color.bold("Next Steps:"));
		for (const step of nextSteps) {
			const marker = step.required
				? color.yellow("\u2192")
				: color.dim("\u25CB");
			const cmd = step.command ? color.cyan(` (${step.command})`) : "";
			const requiredTag = step.required ? color.yellow(" [required]") : "";
			logger.info(
				`  ${marker} ${step.order}. ${step.action}${cmd}${requiredTag}`,
			);
		}
	}

	// Documentation link
	logger.info("");
	logger.info(color.dim("Documentation: https://rp1.run"));
	logger.info("");
}
