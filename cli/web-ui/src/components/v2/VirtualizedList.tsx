import {
	forwardRef,
	type ReactNode,
	useCallback,
	useImperativeHandle,
	useRef,
} from "react";
import { useVirtualList } from "@/hooks/useVirtualList";
import { cn } from "@/lib/utils";

export interface VirtualizedListProps<T> {
	readonly items: readonly T[];
	readonly estimateSize: number;
	readonly overscan?: number;
	readonly renderItem: (
		item: T,
		index: number,
		isSelected: boolean,
	) => ReactNode;
	readonly getItemKey: (item: T, index: number) => string;
	readonly onSelect?: (item: T, index: number) => void;
	readonly selectedIndex?: number | null;
	readonly className?: string;
	readonly itemClassName?: string;
	readonly "aria-label"?: string;
}

export interface VirtualizedListRef {
	scrollToIndex: (
		index: number,
		options?: { align?: "start" | "center" | "end" | "auto" },
	) => void;
}

function VirtualizedListInner<T>(
	{
		items,
		estimateSize,
		overscan = 5,
		renderItem,
		getItemKey,
		onSelect,
		selectedIndex = null,
		className,
		itemClassName,
		"aria-label": ariaLabel,
	}: VirtualizedListProps<T>,
	ref: React.ForwardedRef<VirtualizedListRef>,
) {
	const scrollContainerRef = useRef<HTMLDivElement>(null);

	const getScrollElement = useCallback(() => scrollContainerRef.current, []);

	const { virtualItems, totalSize, scrollToIndex, measureElement } =
		useVirtualList({
			count: items.length,
			estimateSize,
			overscan,
			getScrollElement,
		});

	useImperativeHandle(
		ref,
		() => ({
			scrollToIndex: (
				index: number,
				options?: { align?: "start" | "center" | "end" | "auto" },
			) => {
				scrollToIndex(index, options);
			},
		}),
		[scrollToIndex],
	);

	const handleItemClick = useCallback(
		(item: T, index: number) => {
			onSelect?.(item, index);
		},
		[onSelect],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent, item: T, index: number) => {
			if (e.key === "Enter" || e.key === " ") {
				e.preventDefault();
				onSelect?.(item, index);
			}
		},
		[onSelect],
	);

	if (items.length === 0) {
		return (
			<div
				className={cn(
					"flex items-center justify-center p-4 text-sm text-muted-foreground",
					className,
				)}
				role="listbox"
				aria-label={ariaLabel}
			>
				No items
			</div>
		);
	}

	return (
		<div
			ref={scrollContainerRef}
			className={cn("overflow-auto", className)}
			role="listbox"
			aria-label={ariaLabel}
		>
			<div
				style={{
					height: `${totalSize}px`,
					width: "100%",
					position: "relative",
				}}
			>
				{virtualItems.map((virtualItem) => {
					const item = items[virtualItem.index];
					if (item === undefined) return null;

					const isSelected = selectedIndex === virtualItem.index;
					const key = getItemKey(item, virtualItem.index);

					return (
						<div
							key={key}
							ref={measureElement}
							data-index={virtualItem.index}
							role="option"
							aria-selected={isSelected}
							tabIndex={isSelected ? 0 : -1}
							onClick={() => handleItemClick(item, virtualItem.index)}
							onKeyDown={(e) => handleKeyDown(e, item, virtualItem.index)}
							className={cn(
								"absolute left-0 top-0 w-full cursor-pointer border-b border-border/50",
								itemClassName,
							)}
							style={{
								transform: `translateY(${virtualItem.start}px)`,
							}}
						>
							{renderItem(item, virtualItem.index, isSelected)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

export const VirtualizedList = forwardRef(VirtualizedListInner) as <T>(
	props: VirtualizedListProps<T> & { ref?: React.Ref<VirtualizedListRef> },
) => ReactNode;
