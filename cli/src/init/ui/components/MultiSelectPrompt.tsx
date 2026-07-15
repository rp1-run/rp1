import figures from "figures";
import { Box, Text, useInput } from "ink";
import type React from "react";
import { useCallback, useRef, useState } from "react";
import { colors, spacing } from "../styles/theme.js";

/**
 * A single item in the multi-select list.
 */
export interface MultiSelectItem<T extends string = string> {
	/** The value returned when this item is selected */
	readonly value: T;
	/** Display label for the item */
	readonly label: string;
	/** Optional description shown below the label when focused */
	readonly description?: string;
}

/**
 * Props for the MultiSelectPrompt component.
 */
interface MultiSelectPromptProps<T extends string = string> {
	/** The prompt message to display */
	readonly message: string;
	/** Available items to choose from */
	readonly items: readonly MultiSelectItem<T>[];
	/** Values that should be checked by default */
	readonly defaultSelected?: readonly T[];
	/** Callback when the user submits their selection */
	readonly onSubmit: (selected: T[]) => void;
}

/**
 * Renders an interactive multi-select prompt with checkbox-style toggling.
 * Supports arrow keys for navigation, space to toggle, and enter to confirm.
 *
 * The input handler uses a ref-stable callback pattern to prevent Ink's
 * useInput useEffect from tearing down and re-registering the stdin event
 * listener on every re-render, which causes an event loop freeze under Bun.
 */
export function MultiSelectPrompt<T extends string = string>({
	message,
	items,
	defaultSelected = [],
	onSubmit,
}: MultiSelectPromptProps<T>): React.ReactElement {
	const [focusIndex, setFocusIndex] = useState(0);
	const [selected, setSelected] = useState<ReadonlySet<T>>(
		() => new Set(defaultSelected),
	);

	const itemsRef = useRef(items);
	itemsRef.current = items;
	const selectedRef = useRef(selected);
	selectedRef.current = selected;
	const focusIndexRef = useRef(focusIndex);
	focusIndexRef.current = focusIndex;
	const onSubmitRef = useRef(onSubmit);
	onSubmitRef.current = onSubmit;

	const handleInput = useCallback(
		(
			input: string,
			key: { upArrow: boolean; downArrow: boolean; return: boolean },
		) => {
			if (key.upArrow) {
				setFocusIndex((prev) =>
					prev > 0 ? prev - 1 : itemsRef.current.length - 1,
				);
			} else if (key.downArrow) {
				setFocusIndex((prev) =>
					prev < itemsRef.current.length - 1 ? prev + 1 : 0,
				);
			} else if (input === " ") {
				const item = itemsRef.current[focusIndexRef.current];
				if (item) {
					setSelected((prev) => {
						const next = new Set(prev);
						if (next.has(item.value)) {
							next.delete(item.value);
						} else {
							next.add(item.value);
						}
						return next;
					});
				}
			} else if (key.return) {
				const currentSelected = selectedRef.current;
				onSubmitRef.current(
					itemsRef.current
						.filter((item) => currentSelected.has(item.value))
						.map((item) => item.value),
				);
			}
		},
		[],
	);

	useInput(handleInput);

	return (
		<Box flexDirection="column" marginTop={spacing.small}>
			<Box marginBottom={spacing.small}>
				<Text color={colors.info}>{figures.questionMarkPrefix} </Text>
				<Text bold>{message}</Text>
			</Box>
			<Box flexDirection="column" marginLeft={spacing.medium}>
				{items.map((item, index) => {
					const isFocused = index === focusIndex;
					const isChecked = selected.has(item.value);
					const pointer = isFocused ? figures.pointer : " ";
					const checkbox = isChecked ? figures.checkboxOn : figures.checkboxOff;

					return (
						<Box key={item.value} flexDirection="column">
							<Box>
								<Text color={isFocused ? colors.accent : colors.dim}>
									{pointer} {checkbox}{" "}
								</Text>
								<Text
									bold={isFocused}
									color={isFocused ? undefined : colors.dim}
								>
									{item.label}
								</Text>
							</Box>
							{item.description && isFocused && (
								<Box marginLeft={4}>
									<Text color={colors.dim}>{item.description}</Text>
								</Box>
							)}
						</Box>
					);
				})}
			</Box>
			<Box marginTop={spacing.small} marginLeft={spacing.medium}>
				<Text color={colors.dim}>
					Use {figures.arrowUp}/{figures.arrowDown} to navigate, Space to
					toggle, Enter to confirm
				</Text>
			</Box>
		</Box>
	);
}
