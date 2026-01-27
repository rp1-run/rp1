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

const VIEWPORT_PADDING = 16;
const ANCHOR_GAP = 8;

export function calculatePopoverPosition(
	anchorRect: AnchorRect,
	popoverWidth: number,
	popoverHeight: number,
): PopoverPosition {
	const viewportWidth = window.innerWidth;
	const viewportHeight = window.innerHeight;

	let x = anchorRect.right + ANCHOR_GAP;
	let y = anchorRect.top;
	let side: "right" | "left" = "right";

	if (x + popoverWidth + VIEWPORT_PADDING > viewportWidth) {
		x = anchorRect.left - popoverWidth - ANCHOR_GAP;
		side = "left";
	}

	if (y + popoverHeight + VIEWPORT_PADDING > viewportHeight) {
		y = viewportHeight - popoverHeight - VIEWPORT_PADDING;
	}

	if (y < VIEWPORT_PADDING) {
		y = VIEWPORT_PADDING;
	}

	return { x, y, side };
}
