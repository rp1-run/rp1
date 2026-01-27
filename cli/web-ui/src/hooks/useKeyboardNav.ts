import { useCallback, useEffect, useRef, useState } from "react";

export interface VirtualizedListRef {
	scrollToIndex: (
		index: number,
		options?: { align?: "start" | "center" | "end" | "auto" },
	) => void;
}

export interface UseKeyboardNavOptions<T> {
	items: readonly T[];
	onSelect?: (item: T, index: number) => void;
	onEscape?: () => void;
	onDrillIn?: (item: T, index: number) => void;
	onDrillOut?: () => void;
	enabled?: boolean;
	wrap?: boolean;
	listRef?: React.RefObject<VirtualizedListRef | null>;
}

export interface UseKeyboardNavReturn<T> {
	selectedIndex: number | null;
	setSelectedIndex: (index: number | null) => void;
	selectedItem: T | null;
	getItemProps: (index: number) => ItemProps;
	containerProps: ContainerProps;
}

interface ItemProps {
	tabIndex: number;
	"data-selected": boolean;
	"aria-selected": boolean;
	ref: (node: HTMLElement | null) => void;
	onKeyDown: (e: React.KeyboardEvent) => void;
	onClick: () => void;
	onFocus: () => void;
}

interface ContainerProps {
	role: "listbox";
	"aria-activedescendant": string | undefined;
	tabIndex: number;
	onKeyDown: (e: React.KeyboardEvent) => void;
}

function isTextInputElement(element: Element | null): boolean {
	if (!element) return false;

	const tagName = element.tagName.toLowerCase();
	if (tagName === "input") {
		const inputType = (element as HTMLInputElement).type?.toLowerCase();
		const textInputTypes = [
			"text",
			"password",
			"email",
			"search",
			"tel",
			"url",
			"number",
		];
		return textInputTypes.includes(inputType);
	}

	if (tagName === "textarea") return true;
	if ((element as HTMLElement).isContentEditable) return true;

	return false;
}

export function useKeyboardNav<T>({
	items,
	onSelect,
	onEscape,
	onDrillIn,
	onDrillOut,
	enabled = true,
	wrap = true,
	listRef,
}: UseKeyboardNavOptions<T>): UseKeyboardNavReturn<T> {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const itemRefs = useRef<Map<number, HTMLElement>>(new Map());
	const lastSelectedIndexRef = useRef<number | null>(null);

	const getItemRef = useCallback(
		(index: number) => (node: HTMLElement | null) => {
			if (node) {
				itemRefs.current.set(index, node);
			} else {
				itemRefs.current.delete(index);
			}
		},
		[],
	);

	const focusItem = useCallback((index: number) => {
		const element = itemRefs.current.get(index);
		if (element) {
			element.focus();
		}
	}, []);

	const selectAndFocus = useCallback(
		(index: number | null) => {
			setSelectedIndex(index);
			if (index !== null) {
				focusItem(index);
			}
		},
		[focusItem],
	);

	const navigateUp = useCallback(() => {
		if (!enabled || items.length === 0) return;

		setSelectedIndex((prev) => {
			let newIndex: number;
			if (prev === null) {
				newIndex = items.length - 1;
			} else if (prev === 0) {
				newIndex = wrap ? items.length - 1 : 0;
			} else {
				newIndex = prev - 1;
			}
			return newIndex;
		});
	}, [enabled, items.length, wrap]);

	const navigateDown = useCallback(() => {
		if (!enabled || items.length === 0) return;

		setSelectedIndex((prev) => {
			let newIndex: number;
			if (prev === null) {
				newIndex = 0;
			} else if (prev === items.length - 1) {
				newIndex = wrap ? 0 : items.length - 1;
			} else {
				newIndex = prev + 1;
			}
			return newIndex;
		});
	}, [enabled, items.length, wrap]);

	const navigateToFirst = useCallback(() => {
		if (!enabled || items.length === 0) return;
		selectAndFocus(0);
	}, [enabled, items.length, selectAndFocus]);

	const navigateToLast = useCallback(() => {
		if (!enabled || items.length === 0) return;
		selectAndFocus(items.length - 1);
	}, [enabled, items.length, selectAndFocus]);

	const selectCurrent = useCallback(() => {
		if (!enabled || selectedIndex === null) return;
		const item = items[selectedIndex];
		if (item !== undefined) {
			onSelect?.(item, selectedIndex);
		}
	}, [enabled, selectedIndex, items, onSelect]);

	const clearSelection = useCallback(() => {
		if (!enabled) return;
		setSelectedIndex(null);
		onEscape?.();
	}, [enabled, onEscape]);

	const drillIn = useCallback(() => {
		if (!enabled || selectedIndex === null) return;
		const item = items[selectedIndex];
		if (item !== undefined) {
			onDrillIn?.(item, selectedIndex);
		}
	}, [enabled, selectedIndex, items, onDrillIn]);

	const drillOut = useCallback(() => {
		if (!enabled) return;
		onDrillOut?.();
	}, [enabled, onDrillOut]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!enabled) return;

			const isVimKey = ["j", "k", "h", "l"].includes(e.key);
			if (isVimKey && isTextInputElement(document.activeElement)) {
				return;
			}

			switch (e.key) {
				case "ArrowUp":
				case "k":
					e.preventDefault();
					navigateUp();
					break;
				case "ArrowDown":
				case "j":
					e.preventDefault();
					navigateDown();
					break;
				case "ArrowLeft":
				case "h":
					e.preventDefault();
					drillOut();
					break;
				case "ArrowRight":
				case "l":
					e.preventDefault();
					drillIn();
					break;
				case "Home":
					e.preventDefault();
					navigateToFirst();
					break;
				case "End":
					e.preventDefault();
					navigateToLast();
					break;
				case "Enter":
					e.preventDefault();
					selectCurrent();
					break;
				case "Escape":
					e.preventDefault();
					clearSelection();
					break;
			}
		},
		[
			enabled,
			navigateUp,
			navigateDown,
			navigateToFirst,
			navigateToLast,
			selectCurrent,
			clearSelection,
			drillIn,
			drillOut,
		],
	);

	useEffect(() => {
		if (selectedIndex !== null) {
			focusItem(selectedIndex);
		}
	}, [selectedIndex, focusItem]);

	useEffect(() => {
		if (selectedIndex !== null && selectedIndex >= items.length) {
			setSelectedIndex(items.length > 0 ? items.length - 1 : null);
		}
	}, [items.length, selectedIndex]);

	useEffect(() => {
		if (
			selectedIndex !== null &&
			selectedIndex !== lastSelectedIndexRef.current &&
			listRef?.current
		) {
			listRef.current.scrollToIndex(selectedIndex, { align: "auto" });
		}
		lastSelectedIndexRef.current = selectedIndex;
	}, [selectedIndex, listRef]);

	const getItemProps = useCallback(
		(index: number): ItemProps => {
			const isSelected = selectedIndex === index;
			return {
				tabIndex: isSelected ? 0 : -1,
				"data-selected": isSelected,
				"aria-selected": isSelected,
				ref: getItemRef(index),
				onKeyDown: handleKeyDown,
				onClick: () => {
					setSelectedIndex(index);
					const item = items[index];
					if (item !== undefined) {
						onSelect?.(item, index);
					}
				},
				onFocus: () => {
					setSelectedIndex(index);
				},
			};
		},
		[selectedIndex, getItemRef, handleKeyDown, items, onSelect],
	);

	const containerProps: ContainerProps = {
		role: "listbox",
		"aria-activedescendant":
			selectedIndex !== null ? `listbox-item-${selectedIndex}` : undefined,
		tabIndex: selectedIndex === null ? 0 : -1,
		onKeyDown: handleKeyDown,
	};

	return {
		selectedIndex,
		setSelectedIndex: selectAndFocus,
		selectedItem:
			selectedIndex !== null ? (items[selectedIndex] ?? null) : null,
		getItemProps,
		containerProps,
	};
}
