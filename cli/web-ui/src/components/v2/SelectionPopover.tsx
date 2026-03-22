import { Send, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useDismiss } from "@/hooks/useDismiss";
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
	const [isPositioned, setIsPositioned] = useState(false);
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		x: position.anchorRect.left - 280 - 8,
		y: position.anchorRect.top,
		side: "left",
	});

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const popoverRef = useRef<HTMLDivElement>(null);
	const { createAnnotation, docId } = useAnnotationContext();

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

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

	useDismiss({
		ref: popoverRef,
		onDismiss: onClose,
		dismissOnScroll: true,
	});

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || isSubmitting) return;

		setIsSubmitting(true);
		try {
			await createAnnotation({
				docId: docId ?? "",
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
		docId,
		isSubmitting,
		onAnnotationCreated,
		onClose,
	]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
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
				"fixed z-50 w-[280px] rounded border border-border bg-surface",
				isPositioned ? "animate-in fade-in-0 duration-150" : "opacity-0",
				className,
			)}
			style={{
				left: `${popoverPosition.x}px`,
				top: `${popoverPosition.y}px`,
			}}
			role="dialog"
			aria-label="Add annotation"
		>
			<div className="px-3 pt-3 pb-2">
				<div className="flex items-start justify-between gap-2 mb-2">
					<p className="type-secondary text-fg-ghost italic line-clamp-2">
						&ldquo;
						{anchor.selectedText.length > 100
							? `${anchor.selectedText.slice(0, 100)}…`
							: anchor.selectedText}
						&rdquo;
					</p>
					<button
						type="button"
						onClick={onClose}
						className="shrink-0 text-fg-ghost transition-colors duration-150 hover:text-fg"
						aria-label="Cancel"
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>

				<div className="flex gap-2">
					<textarea
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Add comment..."
						rows={1}
						className={cn(
							"flex-1 resize-none rounded bg-surface-void px-3 py-1.5 type-body text-fg",
							"placeholder:text-fg-ghost",
							"focus-visible:outline-none",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
						disabled={isSubmitting}
					/>
					<button
						type="button"
						onClick={handleSubmit}
						disabled={!canSubmit}
						className={cn(
							"shrink-0 rounded p-1.5 transition-colors duration-150",
							canSubmit
								? "text-fg-muted hover:text-fg"
								: "text-fg-ghost opacity-50",
						)}
						aria-label="Add comment"
						title="Cmd/Ctrl+Enter"
					>
						<Send className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>

				<p className="mt-1 type-secondary text-fg-ghost">
					Enter to send · Shift+Enter for new line
				</p>
			</div>
		</div>
	);
}
