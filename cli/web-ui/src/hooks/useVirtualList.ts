import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { type RefObject, useCallback, useRef } from "react";

export interface UseVirtualListOptions {
	readonly count: number;
	readonly estimateSize: number;
	readonly overscan?: number;
	readonly getScrollElement: () => HTMLElement | null;
}

export interface UseVirtualListReturn {
	readonly virtualItems: readonly VirtualItem[];
	readonly totalSize: number;
	readonly scrollToIndex: (
		index: number,
		options?: { align?: "start" | "center" | "end" | "auto" },
	) => void;
	readonly measureElement: (node: HTMLElement | null) => void;
	readonly isScrolling: boolean;
}

export function useVirtualList({
	count,
	estimateSize,
	overscan = 5,
	getScrollElement,
}: UseVirtualListOptions): UseVirtualListReturn {
	const virtualizer = useVirtualizer({
		count,
		getScrollElement,
		estimateSize: () => estimateSize,
		overscan,
	});

	const scrollToIndex = useCallback(
		(
			index: number,
			options?: { align?: "start" | "center" | "end" | "auto" },
		) => {
			virtualizer.scrollToIndex(index, {
				align: options?.align ?? "auto",
				behavior: "auto",
			});
		},
		[virtualizer],
	);

	return {
		virtualItems: virtualizer.getVirtualItems(),
		totalSize: virtualizer.getTotalSize(),
		scrollToIndex,
		measureElement: virtualizer.measureElement,
		isScrolling: virtualizer.isScrolling,
	};
}

export interface UseVirtualListRef {
	scrollToIndex: (
		index: number,
		options?: { align?: "start" | "center" | "end" | "auto" },
	) => void;
}

export function useVirtualListRef(): RefObject<UseVirtualListRef | null> {
	return useRef<UseVirtualListRef | null>(null);
}
