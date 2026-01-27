import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export interface AnchorRect {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

export interface PopoverPosition {
	readonly x: number;
	readonly y: number;
	readonly side: "right" | "left";
}

export interface ContainerBounds {
	readonly left: number;
	readonly right: number;
	readonly top: number;
	readonly bottom: number;
}

const VIEWPORT_PADDING = 16;
const ANCHOR_GAP = 8;

export function calculatePopoverPosition(
	anchorRect: AnchorRect,
	popoverWidth: number,
	popoverHeight: number,
	containerBounds?: ContainerBounds,
): PopoverPosition {
	// Use container bounds if provided, otherwise fall back to viewport
	const bounds = containerBounds ?? {
		left: 0,
		right: window.innerWidth,
		top: 0,
		bottom: window.innerHeight,
	};

	let x: number;
	let y = anchorRect.top;
	let side: "right" | "left";

	// Calculate available space on each side within bounds
	const spaceOnRight = bounds.right - anchorRect.right - ANCHOR_GAP;
	const spaceOnLeft = anchorRect.left - bounds.left - ANCHOR_GAP;

	// Prefer left side if there's enough space, as right side often has sidebars
	if (spaceOnLeft >= popoverWidth + VIEWPORT_PADDING) {
		x = anchorRect.left - popoverWidth - ANCHOR_GAP;
		side = "left";
	} else if (spaceOnRight >= popoverWidth + VIEWPORT_PADDING) {
		x = anchorRect.right + ANCHOR_GAP;
		side = "right";
	} else {
		// Not enough space on either side - position to left of anchor, may overlap
		x = anchorRect.left - popoverWidth - ANCHOR_GAP;
		side = "left";
		// If that would go off screen, position at left edge
		if (x < bounds.left + VIEWPORT_PADDING) {
			x = bounds.left + VIEWPORT_PADDING;
		}
	}

	// Vertical positioning
	if (y + popoverHeight + VIEWPORT_PADDING > bounds.bottom) {
		y = bounds.bottom - popoverHeight - VIEWPORT_PADDING;
	}

	if (y < bounds.top + VIEWPORT_PADDING) {
		y = bounds.top + VIEWPORT_PADDING;
	}

	return { x, y, side };
}
