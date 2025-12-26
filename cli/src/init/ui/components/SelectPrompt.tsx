/**
 * SelectPrompt component for user choices in the wizard.
 * Provides keyboard-navigable option selection with visual feedback.
 *
 * @see design.md#3.2-component-specifications
 */

import figures from "figures";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useState } from "react";
import { colors, spacing } from "../styles/theme.js";

/**
 * A single option in the select list.
 */
export interface SelectOption<T extends string = string> {
	/** The value returned when this option is selected */
	readonly value: T;
	/** Display label for the option */
	readonly label: string;
	/** Optional description shown below the label */
	readonly description?: string;
}

/**
 * Props for the SelectPrompt component.
 */
interface SelectPromptProps<T extends string = string> {
	/** The prompt message to display */
	readonly message: string;
	/** Available options to choose from */
	readonly options: readonly SelectOption<T>[];
	/** Callback when an option is selected */
	readonly onSelect: (value: T) => void;
	/** Default selected index (defaults to 0) */
	readonly defaultIndex?: number;
}

/**
 * Renders an interactive select prompt with keyboard navigation.
 * Supports arrow keys for navigation and enter for selection.
 * Highlights the currently focused option with a visual indicator.
 */
export function SelectPrompt<T extends string = string>({
	message,
	options,
	onSelect,
	defaultIndex = 0,
}: SelectPromptProps<T>): React.ReactElement {
	const [selectedIndex, setSelectedIndex] = useState(defaultIndex);

	useInput((_input, key) => {
		if (key.upArrow) {
			setSelectedIndex((prev) => (prev > 0 ? prev - 1 : options.length - 1));
		} else if (key.downArrow) {
			setSelectedIndex((prev) => (prev < options.length - 1 ? prev + 1 : 0));
		} else if (key.return) {
			const selected = options[selectedIndex];
			if (selected) {
				onSelect(selected.value);
			}
		}
	});

	return (
		<Box flexDirection="column" marginTop={spacing.small}>
			<Box marginBottom={spacing.small}>
				<Text color={colors.info}>{figures.questionMarkPrefix} </Text>
				<Text bold>{message}</Text>
			</Box>
			<Box flexDirection="column" marginLeft={spacing.medium}>
				{options.map((option, index) => {
					const isSelected = index === selectedIndex;
					const pointer = isSelected ? figures.pointer : " ";
					const indicator = isSelected ? figures.radioOn : figures.radioOff;

					return (
						<Box key={option.value} flexDirection="column">
							<Box>
								<Text color={isSelected ? colors.accent : colors.dim}>
									{pointer} {indicator}{" "}
								</Text>
								<Text
									bold={isSelected}
									color={isSelected ? undefined : colors.dim}
								>
									{option.label}
								</Text>
							</Box>
							{option.description && isSelected && (
								<Box marginLeft={4}>
									<Text color={colors.dim}>{option.description}</Text>
								</Box>
							)}
						</Box>
					);
				})}
			</Box>
			<Box marginTop={spacing.small} marginLeft={spacing.medium}>
				<Text color={colors.dim}>
					Use {figures.arrowUp}/{figures.arrowDown} to navigate, Enter to select
				</Text>
			</Box>
		</Box>
	);
}

/**
 * Options for git root directory choice.
 * Used when running init from a subdirectory of a git repository.
 */
export const gitRootOptions: readonly SelectOption<
	"continue" | "switch" | "cancel"
>[] = [
	{
		value: "continue",
		label: "Continue here",
		description: "Initialize rp1 in the current directory",
	},
	{
		value: "switch",
		label: "Switch to git root",
		description: "Initialize rp1 at the repository root instead",
	},
	{
		value: "cancel",
		label: "Cancel",
		description: "Exit without making changes",
	},
];

/**
 * Options for re-initialization behavior.
 * Used when rp1 is already configured in the project.
 */
export const reinitOptions: readonly SelectOption<
	"update" | "skip" | "reinitialize"
>[] = [
	{
		value: "update",
		label: "Update configuration",
		description: "Refresh settings without removing existing KB or work data",
	},
	{
		value: "skip",
		label: "Skip initialization",
		description: "Exit without making any changes",
	},
	{
		value: "reinitialize",
		label: "Reinitialize completely",
		description: "Start fresh (preserves KB and work data)",
	},
];

/**
 * Options for gitignore preset selection.
 * Determines what rp1 files are tracked in version control.
 */
export const gitignorePresetOptions: readonly SelectOption<
	"recommended" | "track_all" | "ignore_all"
>[] = [
	{
		value: "recommended",
		label: "Recommended (track context, ignore work)",
		description: "Track knowledge base in git, ignore work files",
	},
	{
		value: "track_all",
		label: "Track all",
		description: "Track all rp1 files in git (except meta.json)",
	},
	{
		value: "ignore_all",
		label: "Ignore all",
		description: "Do not track any rp1 files in git",
	},
];
