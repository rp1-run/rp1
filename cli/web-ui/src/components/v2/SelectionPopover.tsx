import { GripHorizontal, Send, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import {
	calculatePopoverPosition,
	cn,
	type PopoverPosition,
} from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { TextSelectionAnchor } from "@/types/annotations";

export interface SelectionPopoverProps {
	anchor: TextSelectionAnchor;
	artifactPath: string;
	position: SelectionPosition;
	onClose: () => void;
	onAnnotationCreated?: () => void;
	className?: string;
}

export function SelectionPopover({
	anchor,
	artifactPath,
	position,
	onClose,
	onAnnotationCreated,
	className,
}: SelectionPopoverProps) {
	const [content, setContent] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	// Start hidden until position is calculated to avoid janky movement
	const [isPositioned, setIsPositioned] = useState(false);
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		// Initial position at left of anchor (since we prefer left side)
		x: position.anchorRect.left - 320 - 8, // w-80 = 320px
		y: position.anchorRect.top,
		side: "left",
	});
	const [hasBeenDragged, setHasBeenDragged] = useState(false);
	const [draggedPosition, setDraggedPosition] = useState({ x: 0, y: 0 });

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const isDraggingRef = useRef(false);
	const dragOffsetRef = useRef<{
		x: number;
		y: number;
		lastX?: number;
		lastY?: number;
	}>({ x: 0, y: 0 });
	const rafRef = useRef<number | null>(null);
	const { createAnnotation } = useAnnotationContext();

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	// Drag handlers for repositioning popover - using refs for smooth performance
	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const currentX = hasBeenDragged ? draggedPosition.x : popoverPosition.x;
			const currentY = hasBeenDragged ? draggedPosition.y : popoverPosition.y;
			isDraggingRef.current = true;
			dragOffsetRef.current = {
				x: e.clientX - currentX,
				y: e.clientY - currentY,
			};

			const handleDrag = (moveEvent: MouseEvent) => {
				if (!isDraggingRef.current) return;

				// Cancel any pending animation frame
				if (rafRef.current) {
					cancelAnimationFrame(rafRef.current);
				}

				// Use requestAnimationFrame for smooth updates
				rafRef.current = requestAnimationFrame(() => {
					const newX = moveEvent.clientX - dragOffsetRef.current.x;
					const newY = moveEvent.clientY - dragOffsetRef.current.y;

					// Directly update the DOM for smoothness during drag
					if (popoverRef.current) {
						popoverRef.current.style.left = `${newX}px`;
						popoverRef.current.style.top = `${newY}px`;
					}

					// Store position for when drag ends
					dragOffsetRef.current.lastX = newX;
					dragOffsetRef.current.lastY = newY;
				});
			};

			const handleDragEnd = () => {
				isDraggingRef.current = false;

				if (rafRef.current) {
					cancelAnimationFrame(rafRef.current);
					rafRef.current = null;
				}

				// Commit final position to state
				const finalX =
					dragOffsetRef.current.lastX ?? e.clientX - dragOffsetRef.current.x;
				const finalY =
					dragOffsetRef.current.lastY ?? e.clientY - dragOffsetRef.current.y;
				setDraggedPosition({ x: finalX, y: finalY });
				setHasBeenDragged(true);

				document.removeEventListener("mousemove", handleDrag);
				document.removeEventListener("mouseup", handleDragEnd);
			};

			document.addEventListener("mousemove", handleDrag);
			document.addEventListener("mouseup", handleDragEnd);
		},
		[
			hasBeenDragged,
			draggedPosition.x,
			draggedPosition.y,
			popoverPosition.x,
			popoverPosition.y,
		],
	);

	// Cleanup RAF on unmount
	useEffect(() => {
		return () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		};
	}, []);

	// Calculate viewport-aware position
	useEffect(() => {
		if (!popoverRef.current) return;

		const rect = popoverRef.current.getBoundingClientRect();
		const newPosition = calculatePopoverPosition(
			position.anchorRect,
			rect.width,
			rect.height,
		);

		setPopoverPosition(newPosition);
		setIsPositioned(true);
	}, [position.anchorRect]);

	// Click outside handler
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				popoverRef.current &&
				!popoverRef.current.contains(e.target as Node)
			) {
				onClose();
			}
		};

		const handleEscape = (e: globalThis.KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopImmediatePropagation();
				onClose();
			}
		};

		// Add slight delay to avoid immediate close from the same click that opened it
		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			// Use capture phase so this fires before page-level escape handler
			document.addEventListener("keydown", handleEscape, true);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [onClose]);

	// Close on scroll
	useEffect(() => {
		const handleScroll = () => {
			onClose();
		};

		// Listen for scroll on window and capture phase to catch scrolling containers
		window.addEventListener("scroll", handleScroll, true);

		return () => {
			window.removeEventListener("scroll", handleScroll, true);
		};
	}, [onClose]);

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || isSubmitting) return;

		setIsSubmitting(true);
		try {
			await createAnnotation({
				docId: "",
				artifactPath,
				anchor,
				content: trimmedContent,
			});

			onAnnotationCreated?.();
			onClose();
		} catch (error) {
			console.error("Failed to create annotation:", error);
		} finally {
			setIsSubmitting(false);
		}
	}, [
		anchor,
		artifactPath,
		content,
		createAnnotation,
		isSubmitting,
		onAnnotationCreated,
		onClose,
	]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				handleSubmit();
			}
		},
		[handleSubmit],
	);

	const canSubmit = content.trim().length > 0 && !isSubmitting;

	// Use dragged position if user has dragged, otherwise use calculated position
	const displayX = hasBeenDragged ? draggedPosition.x : popoverPosition.x;
	const displayY = hasBeenDragged ? draggedPosition.y : popoverPosition.y;

	return (
		<div
			ref={popoverRef}
			className={cn(
				"fixed z-50 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-xl",
				isPositioned
					? "animate-in fade-in-0 zoom-in-95 duration-150"
					: "opacity-0",
				className,
			)}
			style={{
				left: `${displayX}px`,
				top: `${displayY}px`,
			}}
			role="dialog"
			aria-label="Add annotation"
		>
			{/* Top bar with drag handle - matches AnnotationPopover style */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions: drag handle for mouse-based repositioning */}
			<header
				onMouseDown={handleDragStart}
				className={cn(
					"flex h-7 cursor-move items-center justify-between border-b border-border bg-muted/50 px-2",
					"hover:bg-muted transition-colors select-none",
				)}
				title="Drag to reposition"
			>
				<GripHorizontal
					className="h-3 w-3 text-muted-foreground"
					aria-hidden="true"
				/>
				{/* biome-ignore lint/a11y/noStaticElementInteractions: prevents drag when clicking buttons */}
				<div
					className="flex items-center gap-0.5"
					onMouseDown={(e) => e.stopPropagation()}
				>
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded p-1 transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Cancel"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
			</header>

			<div className="p-3">
				{/* Selected text preview */}
				<p className="mb-1 text-xs text-muted-foreground line-clamp-2 italic">
					"
					{anchor.selectedText.length > 100
						? `${anchor.selectedText.slice(0, 100)}...`
						: anchor.selectedText}
					"
				</p>
			</div>

			<footer className="border-t border-border p-3">
				<div className="flex gap-2">
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Add comment..."
						rows={1}
						className={cn(
							"flex-1 resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm",
							"placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!canSubmit}
						className={cn(
							"rounded-md p-2 transition-colors",
							"bg-primary text-primary-foreground",
							"hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:pointer-events-none disabled:opacity-50",
						)}
						aria-label="Add comment"
						title="Add comment (Cmd/Ctrl+Enter)"
					>
						<Send className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
				<span className="mt-1 text-xs text-muted-foreground">
					Cmd/Ctrl+Enter to send
				</span>
			</footer>
		</div>
	);
}
