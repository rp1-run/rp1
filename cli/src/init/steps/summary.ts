/**
 * Summary display step for the rp1 init command.
 * Generates contextual next steps and displays comprehensive summary.
 */

import type { Logger } from "../../../shared/logger.js";
import { getColorFns } from "../../lib/colors.js";
import type {
	HealthReport,
	InitAction,
	NextStep,
	ProjectContext,
	StepCallbacks,
} from "../models.js";
import type { DetectedTool } from "../tool-detector.js";

/**
 * Generate next steps based on init result.
 * Produces contextual NextStep array based on health report and detected tool.
 * Required steps are ordered before optional steps.
 *
 * @param healthReport - Health check report (may be null)
 * @param detectedTool - Primary detected tool (may be null)
 * @param hasKBContent - Whether KB content exists (.rp1/context/index.md)
 * @param hasCharterContent - Whether charter content exists (.rp1/context/charter.md)
 * @param projectContext - Project context (greenfield or brownfield)
 * @returns Array of next steps ordered by priority (required first, then optional)
 */
export function generateNextSteps(
	healthReport: HealthReport | null,
	detectedTool: DetectedTool | null,
	hasKBContent: boolean,
	hasCharterContent: boolean,
	projectContext?: ProjectContext,
): NextStep[] {
	const requiredSteps: Omit<NextStep, "order">[] = [];
	const optionalSteps: Omit<NextStep, "order">[] = [];

	// Required: If plugins were just installed, restart AI tool
	if (healthReport?.pluginsInstalled) {
		requiredSteps.push({
			action: `Restart ${detectedTool?.tool.name ?? "your AI tool"} to load plugins`,
			required: true,
		});
	}

	// Required: If no AI tool detected, suggest installing one
	if (!detectedTool) {
		requiredSteps.push({
			action: "Install an AI coding tool (Claude Code or OpenCode)",
			required: true,
			docsUrl: "https://rp1.run/installation",
		});
	}

	// Greenfield: Suggest /bootstrap as first optional step
	if (projectContext === "greenfield") {
		optionalSteps.push({
			action: "Bootstrap a new project",
			command: "/bootstrap",
			required: false,
			docsUrl: "https://rp1.run/guides/bootstrap",
			blurb:
				"Creates a complete project with charter, tech stack, and runnable code",
		});
	}

	// Optional: If no KB content, suggest building (brownfield behavior)
	if (!hasKBContent) {
		optionalSteps.push({
			action: "Build knowledge base",
			command: "/knowledge-build",
			required: false,
			docsUrl: "https://rp1.run/guides/knowledge-base",
			blurb: "Analyzes your codebase for AI context awareness",
		});
	}

	// Optional: If no charter content, suggest creating
	if (!hasCharterContent) {
		optionalSteps.push({
			action: "Create project charter",
			command: "/blueprint",
			required: false,
			docsUrl: "https://rp1.run/guides/blueprint",
			blurb: "Captures project vision to guide feature development",
		});
	}

	// Combine required first, then optional, with sequential order numbers
	const allSteps = [...requiredSteps, ...optionalSteps];
	return allSteps.map((step, index) => ({
		...step,
		order: index + 1,
	}));
}

/**
 * Counts of actions by category.
 */
export interface ActionCounts {
	readonly created: number;
	readonly updated: number;
	readonly installed: number;
	readonly failed: number;
}

/**
 * Data structure for summary display.
 * Used by UI components to render the final summary.
 */
export interface SummaryData {
	readonly actionCounts: ActionCounts;
	readonly detectedTools: readonly DetectedTool[];
	readonly healthReport: HealthReport | null;
	readonly nextSteps: readonly NextStep[];
	readonly hasFailures: boolean;
}

/**
 * Count actions by type category.
 *
 * @param actions - Array of init actions
 * @returns Object with counts for each category
 */
export function countActions(actions: readonly InitAction[]): ActionCounts {
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
 * Prepare summary data for UI rendering.
 * Extracts and computes all data needed for the summary display.
 * UI components can use this data to render the summary.
 *
 * @param actions - All actions taken during initialization
 * @param healthReport - Health check report (may be null)
 * @param detectedTools - All detected tools (may be empty array)
 * @param callbacks - Optional callbacks for reporting progress to UI
 * @param projectContext - Project context (greenfield or brownfield)
 * @returns SummaryData object for UI consumption
 */
export function prepareSummaryData(
	actions: readonly InitAction[],
	healthReport: HealthReport | null,
	detectedTools: readonly DetectedTool[],
	callbacks?: StepCallbacks,
	projectContext?: ProjectContext,
): SummaryData {
	callbacks?.onActivity("Preparing summary", "info");

	const actionCounts = countActions(actions);
	const hasKBContent = healthReport?.kbExists ?? false;
	const hasCharterContent = healthReport?.charterExists ?? false;
	const primaryTool = detectedTools[0] ?? null;

	const nextSteps = generateNextSteps(
		healthReport,
		primaryTool,
		hasKBContent,
		hasCharterContent,
		projectContext,
	);

	const hasFailures = actionCounts.failed > 0;

	callbacks?.onActivity(
		hasFailures ? "Summary ready (with warnings)" : "Summary ready",
		hasFailures ? "warning" : "success",
	);

	return {
		actionCounts,
		detectedTools,
		healthReport,
		nextSteps,
		hasFailures,
	};
}

/**
 * Display comprehensive summary of initialization.
 * Renders formatted output with color coding.
 * Uses console.log directly for clean output without log prefixes.
 *
 * @param actions - All actions taken during initialization
 * @param healthReport - Health check report (may be null)
 * @param nextSteps - Generated next steps for the user
 * @param detectedTools - All detected tools (may be empty array)
 * @param _logger - Logger instance (unused, kept for API compatibility)
 * @param isTTY - Whether output is a TTY (for color support)
 */
export function displaySummary(
	actions: readonly InitAction[],
	healthReport: HealthReport | null,
	nextSteps: readonly NextStep[],
	detectedTools: readonly DetectedTool[],
	_logger: Logger,
	isTTY: boolean,
): void {
	const color = getColorFns(isTTY);
	const log = (msg: string) => console.log(msg);

	// Count actions by type
	const counts = countActions(actions);

	// Header
	log("");
	log(color.bold("==================================================="));
	log(color.bold("           rp1 Initialization Summary              "));
	log(color.bold("==================================================="));
	log("");

	// Actions summary
	log(color.dim("Actions:"));
	if (counts.created > 0) {
		log(`  ${color.green("\u2713")} ${counts.created} created`);
	}
	if (counts.updated > 0) {
		log(`  ${color.green("\u2713")} ${counts.updated} updated`);
	}
	if (counts.installed > 0) {
		log(`  ${color.green("\u2713")} ${counts.installed} plugins installed`);
	}
	if (counts.failed > 0) {
		log(`  ${color.red("\u2717")} ${counts.failed} failed`);
	}
	// Handle case where no significant actions occurred
	if (
		counts.created === 0 &&
		counts.updated === 0 &&
		counts.installed === 0 &&
		counts.failed === 0
	) {
		log(`  ${color.dim("No changes made")}`);
	}

	// Detected tools
	if (detectedTools.length > 0) {
		log("");
		const label =
			detectedTools.length === 1 ? "Detected Tool:" : "Detected Tools:";
		log(color.dim(label));
		for (const tool of detectedTools) {
			const versionStr =
				tool.version === "unknown" ? "(version unknown)" : `v${tool.version}`;
			log(`  ${color.green("\u2713")} ${tool.tool.name} ${versionStr}`);
		}
	}

	// Setup status
	if (healthReport) {
		log("");
		log(color.dim("Setup Status:"));

		const check = (ok: boolean, label: string) => {
			const icon = ok ? color.green("\u2713") : color.red("\u2717");
			log(`  ${icon} ${label}`);
		};

		check(healthReport.rp1DirExists, ".rp1/ directory");
		check(healthReport.instructionFileValid, "Instruction file");
		check(healthReport.gitignoreConfigured, ".gitignore");
		check(healthReport.pluginsInstalled, "Plugins");
		check(healthReport.kbExists, "Knowledge base");
		check(healthReport.charterExists, "Charter");
	}

	// Next steps
	if (nextSteps.length > 0) {
		log("");
		log(color.bold("Next Steps:"));
		for (const step of nextSteps) {
			const marker = step.required
				? color.yellow("\u2192")
				: color.dim("\u25CB");
			const cmd = step.command ? color.cyan(` (${step.command})`) : "";
			const requiredTag = step.required ? color.yellow(" [required]") : "";
			log(`  ${marker} ${step.order}. ${step.action}${cmd}${requiredTag}`);
			// Render blurb indented below command
			if (step.blurb) {
				log(`       ${color.dim(step.blurb)}`);
			}
			// Render docs URL indented below blurb
			if (step.docsUrl) {
				log(`       ${color.dim("Docs:")} ${color.cyan(step.docsUrl)}`);
			}
			// Add blank line between steps if there are blurb or docsUrl
			if (step.blurb || step.docsUrl) {
				log("");
			}
		}
	}

	// Documentation link
	log("");
	log(color.dim("Documentation: https://rp1.run"));
	log("");
}
