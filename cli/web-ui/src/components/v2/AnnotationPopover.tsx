import { Check, CornerDownRight, Send, Trash2, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import { formatRelativeTime } from "@/lib/time";
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
		return `${lines.slice(0, TRUNCATION_LINES).join("\n")}…`;
	}
	if (content.length > TRUNCATION_CHARS) {
		return `${content.slice(0, TRUNCATION_CHARS)}…`;
	}
	return content;
}

export interface AnnotationPopoverProps {
	annotation: Annotation;
	position: SelectionPosition;
	onClose: () => void;
	className?: string;
}

function ReplyItem({
	reply,
	isExpanded,
	onToggleExpand,
}: {
	readonly reply: AnnotationReply;
	readonly isExpanded: boolean;
	readonly onToggleExpand: () => void;
}) {
	const showTruncation = needsTruncation(reply.content);
	const displayContent = isExpanded
		? reply.content
		: truncateContent(reply.content);

	return (
		<div className="flex gap-2 py-2">
			<CornerDownRight
				className="mt-0.5 h-3 w-3 shrink-0 text-fg-ghost"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2 type-secondary text-fg-ghost">
					<span className="text-fg">{reply.author}</span>
					<span>{formatRelativeTime(reply.createdAt)}</span>
				</div>
				<p className="mt-1 type-body whitespace-pre-wrap text-fg">
					{displayContent}
				</p>
				{showTruncation && (
					<button
						type="button"
						onClick={onToggleExpand}
						className="type-secondary text-fg-ghost hover:text-fg transition-colors duration-150 mt-1"
					>
						{isExpanded ? "Show less" : "Show more"}
					</button>
				)}
			</div>
		</div>
	);
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
	const [isPositioned, setIsPositioned] = useState(false);
	const [popoverPosition, setPopoverPosition] = useState<PopoverPosition>({
		x: position.anchorRect.left - 280 - 8,
		y: position.anchorRect.top,
		side: "left",
	});

	const popoverRef = useRef<HTMLDivElement>(null);
	const textareaRef = useRef<HTMLTextAreaElement>(null);

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

		const timeoutId = setTimeout(() => {
			document.addEventListener("mousedown", handleClickOutside);
			document.addEventListener("keydown", handleEscape, true);
		}, 100);

		return () => {
			clearTimeout(timeoutId);
			document.removeEventListener("mousedown", handleClickOutside);
			document.removeEventListener("keydown", handleEscape, true);
		};
	}, [onClose]);

	useEffect(() => {
		const handleScroll = (e: Event) => {
			if (popoverRef.current?.contains(e.target as Node)) return;
			onClose();
		};

		window.addEventListener("scroll", handleScroll, true);
		return () => window.removeEventListener("scroll", handleScroll, true);
	}, [onClose]);

	const isResolved = annotation.status === "resolved";

	const handleResolveClick = useCallback(() => {
		if (confirmAction !== "resolve") {
			setConfirmAction("resolve");
			return;
		}
		resolveAnnotation(annotation.id).catch(() => {});
		setConfirmAction(null);
	}, [annotation.id, confirmAction, resolveAnnotation]);

	const handleReopenClick = useCallback(() => {
		if (confirmAction !== "reopen") {
			setConfirmAction("reopen");
			return;
		}
		reopenAnnotation(annotation.id).catch(() => {});
		setConfirmAction(null);
	}, [annotation.id, confirmAction, reopenAnnotation]);

	const handleDeleteClick = useCallback(() => {
		if (confirmAction !== "delete") {
			setConfirmAction("delete");
			return;
		}
		deleteAnnotation(annotation.id)
			.then(() => onClose())
			.catch(() => {});
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
		} catch {
			// silent
		} finally {
			setIsSubmitting(false);
		}
	}, [annotation.id, replyText, isSubmitting, addReply]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (e.key === "Enter" && !e.shiftKey) {
				e.preventDefault();
				handleSubmitReply();
			}
		},
		[handleSubmitReply],
	);

	const canReply = replyText.trim().length > 0 && !isSubmitting;

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
			aria-label="Annotation details"
		>
			{/* Header with actions */}
			<div className="flex items-center justify-between px-3 pt-2 pb-1">
				<div className="flex items-center gap-2 type-secondary text-fg-ghost">
					<span className="text-fg">{annotation.author}</span>
					<span>{formatRelativeTime(annotation.createdAt)}</span>
				</div>
				<div className="flex items-center gap-0.5">
					<button
						type="button"
						onClick={isResolved ? handleReopenClick : handleResolveClick}
						className="text-fg-ghost transition-colors duration-150 hover:text-fg p-1"
						aria-label={isResolved ? "Reopen" : "Resolve"}
						title={isResolved ? "Reopen" : "Resolve"}
					>
						<Check className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={handleDeleteClick}
						className="text-fg-ghost transition-colors duration-150 hover:text-failure p-1"
						aria-label="Delete"
						title="Delete"
					>
						<Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-fg-ghost transition-colors duration-150 hover:text-fg p-1"
						aria-label="Close"
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>
			</div>

			{/* Confirm action bar */}
			{confirmAction && (
				<div className="mx-3 mb-2 rounded bg-surface-void px-3 py-2">
					<p className="type-secondary text-fg-ghost mb-2">
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
								"flex-1 rounded px-2 py-1 type-secondary transition-colors duration-150",
								confirmAction === "delete"
									? "text-failure hover:bg-failure/10"
									: "text-fg hover:bg-surface",
							)}
						>
							{confirmAction === "resolve" && "Resolve"}
							{confirmAction === "reopen" && "Reopen"}
							{confirmAction === "delete" && "Delete"}
						</button>
						<button
							type="button"
							onClick={handleCancelAction}
							className="flex-1 rounded px-2 py-1 type-secondary text-fg-ghost hover:text-fg transition-colors duration-150"
						>
							Cancel
						</button>
					</div>
				</div>
			)}

			{/* Content */}
			<div className="max-h-60 overflow-y-auto px-3 pb-2">
				<p className="whitespace-pre-wrap type-body text-fg">
					{expandedComments.has(annotation.id)
						? annotation.content
						: truncateContent(annotation.content)}
				</p>
				{needsTruncation(annotation.content) && (
					<button
						type="button"
						onClick={() => toggleExpanded(annotation.id)}
						className="type-secondary text-fg-ghost hover:text-fg transition-colors duration-150 mt-1"
					>
						{expandedComments.has(annotation.id) ? "Show less" : "Show more"}
					</button>
				)}

				{annotation.replies.length > 0 && (
					<div className="mt-2 border-t border-border pt-1">
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

			{/* Reply */}
			<div className="border-t border-border px-3 py-2">
				<div className="flex gap-2">
					<textarea
						ref={textareaRef}
						value={replyText}
						onChange={(e) => setReplyText(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder="Reply..."
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
						onClick={handleSubmitReply}
						disabled={!canReply}
						className={cn(
							"shrink-0 rounded p-1.5 transition-colors duration-150",
							canReply
								? "text-fg-muted hover:text-fg"
								: "text-fg-ghost opacity-50",
						)}
						aria-label="Send reply"
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
