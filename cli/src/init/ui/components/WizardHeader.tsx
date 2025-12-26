/**
 * WizardHeader component for the init wizard.
 * Displays the wizard title and current step progress.
 *
 * @see design.md#3.2-component-specifications
 */

import { Box, Text } from "ink";
import type React from "react";
import { colors, spacing } from "../styles/theme.js";

/**
 * Props for the WizardHeader component.
 */
interface WizardHeaderProps {
	/** Current step number (1-indexed for display) */
	readonly currentStep: number;
	/** Total number of steps in the wizard */
	readonly totalSteps: number;
}

/**
 * Renders the wizard header with title and step progress indicator.
 * Displays "rp1 init" on the left and "Step X of Y" on the right.
 */
export const WizardHeader: React.FC<WizardHeaderProps> = ({
	currentStep,
	totalSteps,
}) => {
	return (
		<Box
			flexDirection="row"
			justifyContent="space-between"
			paddingBottom={spacing.small}
			borderStyle="single"
			borderColor={colors.dim}
			paddingX={spacing.medium}
		>
			<Text bold color={colors.accent}>
				rp1 init
			</Text>
			<Text color={colors.dim}>
				Step {currentStep} of {totalSteps}
			</Text>
		</Box>
	);
};
