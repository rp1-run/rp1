/**
 * ActivityLog component for displaying step activities.
 * Shows activity messages with tree-style indentation and color coding.
 *
 * @see design.md#3.2.3-activitylog-component
 */

import { Box, Text } from "ink";
import type React from "react";
import type { Activity, ActivityType } from "../../models.js";
import { colors } from "../styles/theme.js";

/**
 * Props for the ActivityLog component.
 */
interface ActivityLogProps {
	/** Activities to display */
	readonly activities: readonly Activity[];
	/** Maximum number of activities to show (default: 3) */
	readonly maxVisible?: number;
}

/**
 * Maps activity type to theme color.
 */
const getActivityColor = (type: ActivityType): string => {
	switch (type) {
		case "success":
			return colors.success;
		case "error":
			return colors.error;
		case "warning":
			return colors.warning;
		default:
			return colors.info;
	}
};

/**
 * Renders activity log for a wizard step.
 * Displays most recent activities with tree-style indent using box-drawing characters.
 * Limited to maxVisible entries to prevent UI clutter (REQ-003).
 */
export const ActivityLog: React.FC<ActivityLogProps> = ({
	activities,
	maxVisible = 3,
}) => {
	// Show only the most recent activities
	const visibleActivities = activities.slice(-maxVisible);

	if (visibleActivities.length === 0) {
		return null;
	}

	return (
		<Box flexDirection="column" marginLeft={2}>
			{visibleActivities.map((activity, index) => {
				const isLast = index === visibleActivities.length - 1;
				const prefix = isLast ? "\u2514\u2500 " : "\u251C\u2500 ";

				return (
					<Box key={activity.id}>
						<Text color={colors.dim}>{prefix}</Text>
						<Text color={getActivityColor(activity.type)}>
							{activity.message}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
};
