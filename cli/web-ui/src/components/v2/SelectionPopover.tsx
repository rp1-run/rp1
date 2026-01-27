import { MessageSquare, Send, X } from "lucide-react";
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
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		x: position.anchorRect.right + 8,
		y: position.anchorRect.top,
		side: "right",
	});

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const { createAnnotation } = useAnnotationContext();

	useEffect(() => {
		textareaRef.current?.focus();
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

	return (
		<div
			ref={popoverRef}
			className={cn(
				"fixed z-50 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-xl",
				"animate-in fade-in-0 zoom-in-95 duration-150",
				className,
			)}
			style={{
				left: `${popoverPosition.x}px`,
				top: `${popoverPosition.y}px`,
			}}
			role="dialog"
			aria-label="Add annotation"
		>
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-1.5 text-xs font-medium">
					<MessageSquare className="h-3 w-3" aria-hidden="true" />
					<span>Add Comment</span>
				</div>
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
			</header>

			<div className="p-3">
				<div className="mb-3 rounded-md bg-muted/50 p-2">
					<p className="text-xs text-muted-foreground">Selected text:</p>
					<p className="mt-1 line-clamp-3 text-sm">
						{anchor.selectedText.length > 150
							? `${anchor.selectedText.slice(0, 150)}...`
							: anchor.selectedText}
					</p>
				</div>

				<div>
					<label
						htmlFor="annotation-content"
						className="mb-1 block text-xs font-medium text-muted-foreground"
					>
						Comment:
					</label>
					<textarea
						id="annotation-content"
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Add your comment..."
						rows={3}
						className={cn(
							"w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm",
							"placeholder:text-muted-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
						disabled={isSubmitting}
					/>
				</div>
			</div>

			<footer className="flex items-center justify-between border-t border-border px-3 py-2">
				<span className="text-xs text-muted-foreground">
					Cmd/Ctrl+Enter to submit
				</span>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!canSubmit}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
						"bg-primary text-primary-foreground",
						"hover:bg-primary/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
				>
					<Send className="h-3 w-3" aria-hidden="true" />
					Add Comment
				</button>
			</footer>
		</div>
	);
}
