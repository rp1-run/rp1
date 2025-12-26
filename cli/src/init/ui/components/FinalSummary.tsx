/**
 * FinalSummary component for displaying the wizard completion screen.
 * Shows success/failure status, detected tools, setup status, and next steps.
 *
 * @see design.md#3.2.4-finalsummary-component
 */

import figures from "figures";
import { Box, Text } from "ink";
import type React from "react";
import type { HealthReport, NextStep } from "../../models.js";
import type { DetectedTool } from "../../tool-detector.js";
import type { WizardState } from "../hooks/useWizardState.js";
import { borders, colors, spacing } from "../styles/theme.js";

/**
 * Props for the FinalSummary component.
 */
export interface FinalSummaryProps {
	/** Complete wizard state containing all summary data */
	readonly state: WizardState;
}

/**
 * Props for the DetectedToolsList component.
 */
interface DetectedToolsListProps {
	/** Array of detected AI tools */
	readonly tools: readonly DetectedTool[];
}

/**
 * Props for the SetupStatusList component.
 */
interface SetupStatusListProps {
	/** Health report containing setup status */
	readonly report: HealthReport;
}

/**
 * Props for the NextStepsList component.
 */
interface NextStepsListProps {
	/** Array of next steps to display */
	readonly steps: readonly NextStep[];
}

/**
 * Displays a list of detected AI tools with their versions.
 */
const DetectedToolsList: React.FC<DetectedToolsListProps> = ({ tools }) => {
	if (tools.length === 0) {
		return (
			<Box flexDirection="column">
				<Text bold>Detected Tools:</Text>
				<Box marginLeft={spacing.small}>
					<Text color={colors.warning}>{figures.warning} </Text>
					<Text color={colors.dim}>No AI tools detected</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column">
			<Text bold>Detected Tools:</Text>
			{tools.map((tool) => {
				const versionText =
					tool.version === "unknown" ? "" : ` v${tool.version}`;
				const statusColor = tool.meetsMinVersion
					? colors.success
					: colors.warning;
				const statusIcon = tool.meetsMinVersion
					? figures.tick
					: figures.warning;
				const versionWarning =
					!tool.meetsMinVersion && tool.version !== "unknown"
						? ` (requires >= ${tool.tool.min_version})`
						: "";

				return (
					<Box key={tool.tool.id} marginLeft={spacing.small}>
						<Text color={statusColor}>{statusIcon} </Text>
						<Text>
							{tool.tool.name}
							{versionText}
						</Text>
						{versionWarning && (
							<Text color={colors.warning}>{versionWarning}</Text>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

/**
 * Displays setup status checklist from health report.
 */
const SetupStatusList: React.FC<SetupStatusListProps> = ({ report }) => {
	const statusItems = [
		{
			label: ".rp1/ directory",
			status: report.rp1DirExists,
			required: true,
		},
		{
			label: "Instruction file configured",
			status: report.instructionFileValid,
			required: true,
		},
		{
			label: ".gitignore configured",
			status: report.gitignoreConfigured,
			required: false,
		},
		{
			label: "Plugins installed",
			status: report.pluginsInstalled,
			required: true,
		},
		{
			label: "Knowledge base",
			status: report.kbExists,
			required: false,
			notBuiltText: "(not built)",
		},
		{
			label: "Project charter",
			status: report.charterExists,
			required: false,
			notBuiltText: "(not created)",
		},
	];

	return (
		<Box flexDirection="column">
			<Text bold>Setup Status:</Text>
			{statusItems.map((item) => {
				let icon: string;
				let iconColor: string;

				if (item.status) {
					icon = figures.tick;
					iconColor = colors.success;
				} else if (item.required) {
					icon = figures.cross;
					iconColor = colors.error;
				} else {
					icon = figures.circle;
					iconColor = colors.dim;
				}

				return (
					<Box key={item.label} marginLeft={spacing.small}>
						<Text color={iconColor}>{icon} </Text>
						<Text>{item.label}</Text>
						{!item.status && item.notBuiltText && (
							<Text color={colors.dim}> {item.notBuiltText}</Text>
						)}
					</Box>
				);
			})}
		</Box>
	);
};

/**
 * Displays prioritized next steps for the user.
 * Shows numbered steps with required/optional distinction, commands, and explanations.
 */
const NextStepsList: React.FC<NextStepsListProps> = ({ steps }) => {
	if (steps.length === 0) {
		return (
			<Box
				flexDirection="column"
				paddingX={spacing.medium}
				paddingY={spacing.small}
			>
				<Text bold>Next Steps:</Text>
				<Box marginTop={spacing.small} marginLeft={spacing.small}>
					<Text color={colors.success}>{figures.tick} </Text>
					<Text color={colors.dim}>
						All set! Start using rp1 commands in your AI tool.
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box
			flexDirection="column"
			paddingX={spacing.medium}
			paddingY={spacing.small}
		>
			<Text bold>Next Steps:</Text>
			<Box marginTop={spacing.small} flexDirection="column">
				{steps.map((step) => {
					const isRequired = step.required;
					const orderIcon = isRequired ? figures.arrowRight : figures.circle;
					const orderColor = isRequired ? colors.warning : colors.dim;

					return (
						<Box
							key={step.order}
							flexDirection="column"
							marginBottom={spacing.small}
						>
							<Box>
								<Text color={orderColor}>{orderIcon} </Text>
								<Text bold={isRequired}>
									{step.order}. {step.action}
								</Text>
								{isRequired && <Text color={colors.warning}> [required]</Text>}
							</Box>
							{step.command && (
								<Box marginLeft={spacing.large}>
									<Text color={colors.dim}>Run: </Text>
									<Text color={colors.accent}>{step.command}</Text>
								</Box>
							)}
							{step.blurb && (
								<Box marginLeft={spacing.large}>
									<Text color={colors.dim}>{step.blurb}</Text>
								</Box>
							)}
						</Box>
					);
				})}
			</Box>
		</Box>
	);
};

/**
 * Generate prioritized next steps based on healthReport and detected tools.
 *
 * Priority order:
 * 1. Required actions (tool restart, fix critical issues)
 * 2. Setup completion actions (build KB, create charter)
 * 3. Getting started actions
 *
 * Handles edge cases:
 * - No tools detected: Prompts user to install an AI tool
 * - No KB: Suggests building knowledge base
 * - No charter: Suggests creating project charter
 * - Plugin issues: Provides troubleshooting guidance
 */
const generateNextSteps = (
	healthReport: HealthReport | null,
	detectedTools: readonly DetectedTool[],
): readonly NextStep[] => {
	const steps: NextStep[] = [];
	let order = 1;

	// Edge case: No AI tools detected
	if (detectedTools.length === 0) {
		steps.push({
			order: order++,
			action: "Install an AI coding tool",
			required: true,
			blurb:
				"rp1 requires Claude Code or OpenCode. Install one and run init again.",
			docsUrl: "https://rp1.run/getting-started",
		});
		// Return early - no other steps make sense without a tool
		return steps;
	}

	// Get all detected tool names for messaging
	const toolNames = detectedTools.map((t) => t.tool.name);
	const toolNameList =
		toolNames.length === 1
			? toolNames[0]
			: toolNames.length === 2
				? `${toolNames[0]} and ${toolNames[1]}`
				: `${toolNames.slice(0, -1).join(", ")}, and ${toolNames[toolNames.length - 1]}`;

	// Required: Restart AI tools to load plugins
	// This is always required after plugin installation
	steps.push({
		order: order++,
		action: `Restart ${toolNameList} to load plugins`,
		required: true,
		blurb: "New plugins require a restart to become available",
	});

	// Check for plugin installation issues from healthReport
	if (healthReport && !healthReport.pluginsInstalled) {
		const missingPlugins = healthReport.plugins
			.filter((p) => !p.installed)
			.map((p) => p.name);

		if (missingPlugins.length > 0) {
			steps.push({
				order: order++,
				action: "Manually install missing plugins",
				command: `rp1 install ${missingPlugins.join(" ")}`,
				required: true,
				blurb: `Plugins failed to install: ${missingPlugins.join(", ")}`,
			});
		}
	}

	// Check for instruction file issues
	if (healthReport && !healthReport.instructionFileValid) {
		steps.push({
			order: order++,
			action: "Fix instruction file configuration",
			command: "rp1 init",
			required: true,
			blurb: "Instruction file (CLAUDE.md/AGENTS.md) missing rp1 content",
		});
	}

	// Optional: Build knowledge base if not exists
	if (!healthReport?.kbExists) {
		steps.push({
			order: order++,
			action: "Build knowledge base",
			command: "/knowledge-build",
			required: false,
			blurb: "Analyzes your codebase for AI context awareness",
		});
	}

	// Optional: Create project charter if not exists
	if (!healthReport?.charterExists) {
		steps.push({
			order: order++,
			action: "Create project charter",
			command: "/blueprint",
			required: false,
			blurb: "Captures project vision to guide feature development",
		});
	}

	// If everything is set up, suggest next actions
	if (
		healthReport?.kbExists &&
		healthReport?.charterExists &&
		healthReport?.pluginsInstalled
	) {
		steps.push({
			order: order++,
			action: "Start your first feature",
			command: "/feature-requirements <feature-name>",
			required: false,
			blurb: "Begin the feature development workflow",
		});
	}

	return steps;
};

/**
 * Determine if the wizard completed successfully.
 * Success means no critical errors in required setup items.
 */
const isSuccessful = (state: WizardState): boolean => {
	// Check if any step failed
	const hasFailedSteps = state.steps.some((step) => step.status === "failed");
	if (hasFailedSteps) {
		return false;
	}

	// Check health report for critical issues
	if (state.healthReport) {
		const { rp1DirExists, instructionFileValid } = state.healthReport;
		// These are critical - without them rp1 won't work
		if (!rp1DirExists || !instructionFileValid) {
			return false;
		}
	}

	return true;
};

/**
 * Renders the final summary screen with:
 * - Success/failure status with visual distinction
 * - Detected tools list with versions
 * - Setup status checklist from health report
 * - Prioritized next steps
 * - Documentation link
 */
export const FinalSummary: React.FC<FinalSummaryProps> = ({ state }) => {
	const success = isSuccessful(state);
	const nextSteps = generateNextSteps(state.healthReport, state.detectedTools);

	const borderColor = success ? colors.success : colors.error;
	const statusEmoji = success ? "\u2728" : "\u274C"; // Sparkles or X
	const statusText = success
		? "rp1 initialized successfully!"
		: "rp1 initialization completed with issues";

	return (
		<Box flexDirection="column" paddingY={spacing.small}>
			{/* Status Header */}
			<Box
				borderStyle={borders.standard}
				borderColor={borderColor}
				paddingX={spacing.medium}
				paddingY={spacing.small}
			>
				<Text bold color={borderColor}>
					{statusEmoji} {statusText}
				</Text>
			</Box>

			{/* Detected Tools */}
			<Box marginTop={spacing.small}>
				<DetectedToolsList tools={state.detectedTools} />
			</Box>

			{/* Setup Status */}
			{state.healthReport && (
				<Box marginTop={spacing.small}>
					<SetupStatusList report={state.healthReport} />
				</Box>
			)}

			{/* Next Steps */}
			{nextSteps.length > 0 && (
				<Box
					marginTop={spacing.small}
					borderStyle={borders.section}
					borderColor={colors.dim}
					flexDirection="column"
				>
					<NextStepsList steps={nextSteps} />
				</Box>
			)}

			{/* Documentation Link */}
			<Box marginTop={spacing.small}>
				<Text color={colors.dim}>Documentation: https://rp1.run</Text>
			</Box>
		</Box>
	);
};

export default FinalSummary;
