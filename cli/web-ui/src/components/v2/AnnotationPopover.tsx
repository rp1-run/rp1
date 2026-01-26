import {
	Check,
	CornerDownRight,
	MoreHorizontal,
	RefreshCw,
	Send,
	Trash2,
	X,
} from "lucide-react";
import { type KeyboardEvent, useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { Annotation, AnnotationReply } from "@/types/annotations";
import { SuggestionDiff } from "./SuggestionDiff";

export interface AnnotationPopoverProps {
	annotation: Annotation;
	position: { x: number; y: number };
	onClose: () => void;
	onAcceptSuggestion?: (annotation: Annotation) => void;
	className?: string;
}

interface ReplyItemProps {
	reply: AnnotationReply;
}

function ReplyItem({ reply }: ReplyItemProps) {
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
				<p className="mt-1 text-sm whitespace-pre-wrap">{reply.content}</p>
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
	onAcceptSuggestion,
	className,
}: AnnotationPopoverProps) {
	const [replyText, setReplyText] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showMenu, setShowMenu] = useState(false);
	const [confirmDelete, setConfirmDelete] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const { resolveAnnotation, reopenAnnotation, deleteAnnotation, addReply } =
		useAnnotationContext();

	const isResolved = annotation.status === "resolved";
	const hasSuggestion =
		annotation.annotationType === "suggestion" && annotation.suggestion;

	const handleResolve = useCallback(async () => {
		try {
			await resolveAnnotation(annotation.id);
		} catch (error) {
			console.error("Failed to resolve annotation:", error);
		}
	}, [annotation.id, resolveAnnotation]);

	const handleReopen = useCallback(async () => {
		try {
			await reopenAnnotation(annotation.id);
		} catch (error) {
			console.error("Failed to reopen annotation:", error);
		}
	}, [annotation.id, reopenAnnotation]);

	const handleDelete = useCallback(async () => {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}

		try {
			await deleteAnnotation(annotation.id);
			onClose();
		} catch (error) {
			console.error("Failed to delete annotation:", error);
		}
	}, [annotation.id, confirmDelete, deleteAnnotation, onClose]);

	const handleCancelDelete = useCallback(() => {
		setConfirmDelete(false);
		setShowMenu(false);
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

	const handleAcceptSuggestion = useCallback(() => {
		if (onAcceptSuggestion) {
			onAcceptSuggestion(annotation);
		}
	}, [annotation, onAcceptSuggestion]);

	return (
		<div
			className={cn(
				"fixed z-50 w-80 overflow-hidden rounded-lg border border-border bg-background shadow-xl",
				"animate-in fade-in-0 zoom-in-95 duration-150",
				className,
			)}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				transform: "translate(-50%, 8px)",
			}}
			role="dialog"
			aria-label="Annotation details"
		>
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-2 text-xs">
					<span className="font-medium">{annotation.author}</span>
					<span className="text-muted-foreground">
						{formatRelativeTime(annotation.createdAt)}
					</span>
					{isResolved && (
						<span className="rounded bg-terminal-green/10 px-1.5 py-0.5 text-[10px] font-medium text-terminal-green">
							Resolved
						</span>
					)}
					{annotation.orphaned && (
						<span className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning">
							Orphaned
						</span>
					)}
				</div>
				<div className="flex items-center gap-1">
					<div className="relative">
						<button
							type="button"
							onClick={() => setShowMenu(!showMenu)}
							className={cn(
								"rounded p-1 transition-colors",
								"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
							aria-label="More options"
							aria-expanded={showMenu}
						>
							<MoreHorizontal className="h-4 w-4" aria-hidden="true" />
						</button>

						{showMenu && (
							<>
								{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click handler */}
								<div
									className="fixed inset-0 z-40"
									onClick={() => {
										setShowMenu(false);
										setConfirmDelete(false);
									}}
									onKeyDown={(e) => {
										if (e.key === "Escape") {
											setShowMenu(false);
											setConfirmDelete(false);
										}
									}}
									role="presentation"
								/>
								<div className="absolute right-0 top-full z-50 mt-1 w-36 overflow-hidden rounded-md border border-border bg-background shadow-lg">
									{confirmDelete ? (
										<div className="p-2">
											<p className="mb-2 text-xs text-muted-foreground">
												Delete this annotation?
											</p>
											<div className="flex gap-1">
												<button
													type="button"
													onClick={handleDelete}
													className="flex-1 rounded bg-destructive px-2 py-1 text-xs font-medium text-destructive-foreground hover:bg-destructive/90"
												>
													Delete
												</button>
												<button
													type="button"
													onClick={handleCancelDelete}
													className="flex-1 rounded bg-muted px-2 py-1 text-xs font-medium hover:bg-muted/80"
												>
													Cancel
												</button>
											</div>
										</div>
									) : (
										<button
											type="button"
											onClick={handleDelete}
											className="flex w-full items-center gap-2 px-3 py-2 text-xs text-destructive transition-colors hover:bg-muted"
										>
											<Trash2 className="h-3 w-3" aria-hidden="true" />
											Delete
										</button>
									)}
								</div>
							</>
						)}
					</div>
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

			<div className="max-h-80 overflow-y-auto p-3">
				{hasSuggestion && annotation.suggestion ? (
					<SuggestionDiff
						original={annotation.suggestion.originalText}
						suggested={annotation.suggestion.suggestedText}
						onAccept={onAcceptSuggestion ? handleAcceptSuggestion : undefined}
						className="mb-3"
					/>
				) : null}

				<p className="whitespace-pre-wrap text-sm">{annotation.content}</p>

				{annotation.replies.length > 0 && (
					<div className="mt-3 border-t border-border pt-2">
						{annotation.replies.map((reply) => (
							<ReplyItem key={reply.id} reply={reply} />
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

				<div className="mt-2 flex items-center justify-between">
					<span className="text-xs text-muted-foreground">
						Cmd/Ctrl+Enter to send
					</span>
					<button
						type="button"
						onClick={isResolved ? handleReopen : handleResolve}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors",
							isResolved
								? "bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground"
								: "bg-terminal-green/10 text-terminal-green hover:bg-terminal-green/20",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						{isResolved ? (
							<>
								<RefreshCw className="h-3 w-3" aria-hidden="true" />
								Reopen
							</>
						) : (
							<>
								<Check className="h-3 w-3" aria-hidden="true" />
								Resolve
							</>
						)}
					</button>
				</div>
			</footer>
		</div>
	);
}
