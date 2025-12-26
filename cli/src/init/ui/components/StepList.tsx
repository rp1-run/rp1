/**
 * StepList component for rendering wizard steps.
 * Maps steps array to StepItem components with proper layout.
 *
 * @see design.md#2.1-component-diagram
 */

import figures from "figures";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type React from "react";
import type { StepStatus, WizardStep } from "../../models.js";
import { colors, spacing } from "../styles/theme.js";
import { ActivityLog } from "./ActivityLog.js";

/**
 * Props for the StepList component.
 */
interface StepListProps {
	/** Array of wizard steps to display */
	readonly steps: readonly WizardStep[];
	/** Index of the currently active step */
	readonly currentIndex: number;
}

/**
 * Props for individual StepItem rendering.
 */
interface StepItemProps {
	/** The step to render */
	readonly step: WizardStep;
	/** Whether this is the currently active step */
	readonly isCurrent: boolean;
	/** Whether to show activities for this step */
	readonly showActivities: boolean;
}

/**
 * Get the appropriate icon for a step's status.
 */
const getStatusIcon = (status: StepStatus, isCurrent: boolean): string => {
	if (isCurrent && status === "running") {
		// Spinner will be rendered separately
		return "";
	}
	switch (status) {
		case "completed":
			return figures.tick;
		case "failed":
			return figures.cross;
		case "skipped":
			return figures.line;
		case "running":
			return figures.pointer;
		default:
			return figures.circle;
	}
};

/**
 * Get the color for a step's status.
 */
const getStatusColor = (status: StepStatus, isCurrent: boolean): string => {
	if (isCurrent && status === "running") {
		return colors.info;
	}
	switch (status) {
		case "completed":
			return colors.success;
		case "failed":
			return colors.error;
		case "skipped":
			return colors.dim;
		case "running":
			return colors.info;
		default:
			return colors.dim;
	}
};

/**
 * Renders a single step with its status icon and optional activities.
 */
const StepItem: React.FC<StepItemProps> = ({
	step,
	isCurrent,
	showActivities,
}) => {
	const color = getStatusColor(step.status, isCurrent);
	const icon = getStatusIcon(step.status, isCurrent);
	const showSpinner = isCurrent && step.status === "running";

	return (
		<Box flexDirection="column">
			<Box>
				{showSpinner ? (
					<Text color={color}>
						<Spinner type="dots" />
					</Text>
				) : (
					<Text color={color}>{icon}</Text>
				)}
				<Text> </Text>
				<Text color={isCurrent ? undefined : colors.dim}>
					{step.description}
				</Text>
			</Box>
			{showActivities && step.activities.length > 0 && (
				<ActivityLog activities={step.activities} />
			)}
		</Box>
	);
};

/**
 * Renders the list of wizard steps.
 * Shows activities only for current and completed steps to reduce clutter.
 */
export const StepList: React.FC<StepListProps> = ({ steps, currentIndex }) => {
	return (
		<Box flexDirection="column" paddingY={spacing.small}>
			{steps.map((step, index) => {
				const isCurrent = index === currentIndex;
				// Show activities for current step and completed/failed steps
				const showActivities =
					isCurrent ||
					step.status === "completed" ||
					step.status === "failed" ||
					step.status === "skipped";

				return (
					<StepItem
						key={step.id}
						step={step}
						isCurrent={isCurrent}
						showActivities={showActivities}
					/>
				);
			})}
		</Box>
	);
};
