import {
	Check,
	CornerDownRight,
	GripHorizontal,
	Send,
	Trash2,
	X,
} from "lucide-react";
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
import type { Annotation, AnnotationReply } from "@/types/annotations";

const TRUNCATION_LINES = 3;
const TRUNCATION_CHARS = 200;

function needsTruncation(content: string): boolean {
	const lineCount = content.split("\n").length;
	return lineCount > TRUNCATION_LINES || content.length > TRUNCATION_CHARS;
}

function truncateContent(content: string): string {
	const lines = content.split("\n");
	if (lines.length > TRUNCATION_LINES) {
		return `${lines.slice(0, TRUNCATION_LINES).join("\n")}...`;
	}
	if (content.length > TRUNCATION_CHARS) {
		return `${content.slice(0, TRUNCATION_CHARS)}...`;
	}
	return content;
}

export interface AnnotationPopoverProps {
	annotation: Annotation;
	position: SelectionPosition;
	onClose: () => void;
	className?: string;
}

interface ReplyItemProps {
	reply: AnnotationReply;
	isExpanded: boolean;
	onToggleExpand: () => void;
}

function ReplyItem({ reply, isExpanded, onToggleExpand }: ReplyItemProps) {
	const showTruncation = needsTruncation(reply.content);
	const displayContent = isExpanded
		? reply.content
		: truncateContent(reply.content);

	return (
		<div className="flex gap-2 py-2">
			<CornerDownRight
				className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium text-foreground">{reply.author}</span>
					<span>{formatRelativeTime(reply.createdAt)}</span>
				</div>
				<p className="mt-1 text-sm whitespace-pre-wrap">{displayContent}</p>
				{showTruncation && (
					<button
						type="button"
						onClick={onToggleExpand}
						className="text-xs text-primary hover:underline mt-1"
					>
						{isExpanded ? "Show less" : "Show more"}
					</button>
				)}
			</div>
		</div>
	);
}

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString();
}

export function AnnotationPopover({
	annotation,
	position,
	onClose,
	className,
}: AnnotationPopoverProps) {
	const [replyText, setReplyText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [confirmAction, setConfirmAction] = useState<
		"resolve" | "reopen" | "delete" | null
	>(null);
	const [expandedComments, setExpandedComments] = useState<Set<string>>(
		new Set(),
	);
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

	const popoverRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const isDraggingRef = useRef(false);
	const dragOffsetRef = useRef<{
		x: number;
		y: number;
		lastX?: number;
		lastY?: number;
	}>({ x: 0, y: 0 });
	const rafRef = useRef<number | null>(null);

	const { resolveAnnotation, reopenAnnotation, deleteAnnotation, addReply } =
		useAnnotationContext();

	const toggleExpanded = useCallback((id: string) => {
		setExpandedComments((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
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

	// Close on scroll (but not when scrolling within the popover itself)
	useEffect(() => {
		const handleScroll = (e: Event) => {
			// Don't close if scrolling within the popover content
			if (popoverRef.current?.contains(e.target as Node)) {
				return;
			}
			onClose();
		};

		// Listen for scroll on window and capture phase to catch scrolling containers
		window.addEventListener("scroll", handleScroll, true);

		return () => {
			window.removeEventListener("scroll", handleScroll, true);
		};
	}, [onClose]);

	const isResolved = annotation.status === "resolved";

	const handleResolveClick = useCallback(() => {
		if (confirmAction !== "resolve") {
			setConfirmAction("resolve");
			return;
		}
		resolveAnnotation(annotation.id).catch((error) => {
			console.error("Failed to resolve annotation:", error);
		});
		setConfirmAction(null);
	}, [annotation.id, confirmAction, resolveAnnotation]);

	const handleReopenClick = useCallback(() => {
		if (confirmAction !== "reopen") {
			setConfirmAction("reopen");
			return;
		}
		reopenAnnotation(annotation.id).catch((error) => {
			console.error("Failed to reopen annotation:", error);
		});
		setConfirmAction(null);
	}, [annotation.id, confirmAction, reopenAnnotation]);

	const handleDeleteClick = useCallback(() => {
		if (confirmAction !== "delete") {
			setConfirmAction("delete");
			return;
		}
		deleteAnnotation(annotation.id)
			.then(() => onClose())
			.catch((error) => {
				console.error("Failed to delete annotation:", error);
			});
	}, [annotation.id, confirmAction, deleteAnnotation, onClose]);

	const handleCancelAction = useCallback(() => {
		setConfirmAction(null);
	}, []);

	const handleSubmitReply = useCallback(async () => {
		const trimmedText = replyText.trim();
		if (!trimmedText || isSubmitting) return;

		setIsSubmitting(true);
		try {
			await addReply(annotation.id, trimmedText);
			setReplyText("");
			textareaRef.current?.focus();
		} catch (error) {
			console.error("Failed to add reply:", error);
		} finally {
			setIsSubmitting(false);
		}
	}, [annotation.id, replyText, isSubmitting, addReply]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				handleSubmitReply();
			}
		},
		[handleSubmitReply],
	);

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
			aria-label="Annotation details"
		>
			{/* Top bar with drag handle and actions */}
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
					{/* Resolve/Reopen toggle */}
					<button
						type="button"
						onClick={isResolved ? handleReopenClick : handleResolveClick}
						className={cn(
							"rounded p-1 transition-colors",
							isResolved
								? "text-terminal-green hover:bg-terminal-green/10"
								: "text-muted-foreground hover:bg-muted hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label={isResolved ? "Reopen annotation" : "Resolve annotation"}
						title={isResolved ? "Reopen" : "Resolve"}
					>
						<Check className="h-4 w-4" aria-hidden="true" />
					</button>
					{/* Delete button */}
					<button
						type="button"
						onClick={handleDeleteClick}
						className={cn(
							"rounded p-1 transition-colors",
							"text-muted-foreground hover:bg-muted hover:text-destructive",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Delete annotation"
						title="Delete"
					>
						<Trash2 className="h-4 w-4" aria-hidden="true" />
					</button>
					{/* Close button */}
					<button
						type="button"
						onClick={onClose}
						className={cn(
							"rounded p-1 transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Close"
					>
						<X className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
			</header>

			{/* Confirmation dialog */}
			{confirmAction && (
				<div className="border-b border-border bg-muted/30 px-3 py-2">
					<p className="mb-2 text-xs text-muted-foreground">
						{confirmAction === "resolve" && "Mark as resolved?"}
						{confirmAction === "reopen" && "Reopen this annotation?"}
						{confirmAction === "delete" && "Delete this annotation?"}
					</p>
					<div className="flex gap-2">
						<button
							type="button"
							onClick={
								confirmAction === "resolve"
									? handleResolveClick
									: confirmAction === "reopen"
										? handleReopenClick
										: handleDeleteClick
							}
							className={cn(
								"flex-1 rounded px-2 py-1.5 text-xs font-medium transition-colors",
								confirmAction === "delete"
									? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
									: "bg-primary text-primary-foreground hover:bg-primary/90",
							)}
						>
							{confirmAction === "resolve" && "Resolve"}
							{confirmAction === "reopen" && "Reopen"}
							{confirmAction === "delete" && "Delete"}
						</button>
						<button
							type="button"
							onClick={handleCancelAction}
							className="flex-1 rounded border border-border bg-background px-2 py-1.5 text-xs font-medium transition-colors hover:bg-muted"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			<div className="max-h-80 overflow-y-auto p-3">
				{/* Author and time metadata */}
				<div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
					<span className="font-medium text-foreground">
						{annotation.author}
					</span>
					<span>{formatRelativeTime(annotation.createdAt)}</span>
					{annotation.orphaned && (
						<span className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
							Orphaned
						</span>
					)}
				</div>
				<p className="whitespace-pre-wrap text-sm">
					{expandedComments.has(annotation.id)
						? annotation.content
						: truncateContent(annotation.content)}
				</p>
				{needsTruncation(annotation.content) && (
					<button
						type="button"
						onClick={() => toggleExpanded(annotation.id)}
						className="text-xs text-primary hover:underline mt-1"
					>
						{expandedComments.has(annotation.id) ? "Show less" : "Show more"}
					</button>
				)}

				{annotation.replies.length > 0 && (
					<div className="mt-3 border-t border-border pt-2">
						{annotation.replies.map((reply) => (
							<ReplyItem
								key={reply.id}
								reply={reply}
								isExpanded={expandedComments.has(reply.id)}
								onToggleExpand={() => toggleExpanded(reply.id)}
							/>
						))}
					</div>
				)}
			</div>

			<footer className="border-t border-border p-3">
				<div className="flex gap-2">
					<textarea
						ref={textareaRef}
						value={replyText}
						onChange={(e) => setReplyText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Reply..."
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
						onClick={handleSubmitReply}
						disabled={!replyText.trim() || isSubmitting}
						className={cn(
							"rounded-md p-2 transition-colors",
							"bg-primary text-primary-foreground",
							"hover:bg-primary/90",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:pointer-events-none disabled:opacity-50",
						)}
						aria-label="Send reply"
						title="Send reply (Cmd/Ctrl+Enter)"
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
