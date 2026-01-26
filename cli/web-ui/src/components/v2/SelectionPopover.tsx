import { GitCompare, MessageSquare, Send, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { SuggestionEdit, TextSelectionAnchor } from "@/types/annotations";

export interface SelectionPopoverProps {
	anchor: TextSelectionAnchor;
	artifactPath: string;
	position: { x: number; y: number };
	onClose: () => void;
	onAnnotationCreated?: () => void;
	className?: string;
}

type Mode = "comment" | "suggestion";

export function SelectionPopover({
	anchor,
	artifactPath,
	position,
	onClose,
	onAnnotationCreated,
	className,
}: SelectionPopoverProps) {
	const [mode, setMode] = useState<Mode>("comment");
	const [content, setContent] = useState("");
	const [suggestionText, setSuggestionText] = useState(anchor.selectedText);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { createAnnotation } = useAnnotationContext();

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	useEffect(() => {
		setSuggestionText(anchor.selectedText);
	}, [anchor.selectedText]);

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || isSubmitting) return;

		setIsSubmitting(true);
		try {
			const suggestion: SuggestionEdit | undefined =
				mode === "suggestion"
					? {
							originalText: anchor.selectedText,
							suggestedText: suggestionText,
						}
					: undefined;

			await createAnnotation({
				artifactPath,
				anchor,
				annotationType: mode,
				content: trimmedContent,
				suggestion,
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
		mode,
		onAnnotationCreated,
		onClose,
		suggestionText,
	]);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
				e.preventDefault();
				handleSubmit();
			}
			if (e.key === "Escape") {
				e.preventDefault();
				onClose();
			}
		},
		[handleSubmit, onClose],
	);

	const handleModeChange = useCallback((newMode: Mode) => {
		setMode(newMode);
	}, []);

	const canSubmit =
		content.trim().length > 0 &&
		!isSubmitting &&
		(mode === "comment" || suggestionText !== anchor.selectedText);

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
			aria-label="Add annotation"
		>
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<div
					className="flex rounded-md border border-border bg-muted/30 p-0.5"
					role="tablist"
					aria-label="Annotation type"
				>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "comment"}
						onClick={() => handleModeChange("comment")}
						className={cn(
							"inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							mode === "comment"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<MessageSquare className="h-3 w-3" aria-hidden="true" />
						Comment
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === "suggestion"}
						onClick={() => handleModeChange("suggestion")}
						className={cn(
							"inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							mode === "suggestion"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						<GitCompare className="h-3 w-3" aria-hidden="true" />
						Suggest Edit
					</button>
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

				{mode === "suggestion" && (
					<div className="mb-3">
						<label
							htmlFor="suggestion-text"
							className="mb-1 block text-xs font-medium text-muted-foreground"
						>
							Suggested replacement:
						</label>
						<textarea
							id="suggestion-text"
							value={suggestionText}
							onChange={(e) => setSuggestionText(e.target.value)}
							rows={3}
							className={cn(
								"w-full resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm",
								"placeholder:text-muted-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
								"disabled:cursor-not-allowed disabled:opacity-50",
							)}
							disabled={isSubmitting}
						/>
						{suggestionText === anchor.selectedText && (
							<p className="mt-1 text-xs text-status-warning">
								Modify the text to create a suggestion
							</p>
						)}
					</div>
				)}

				<div>
					<label
						htmlFor="annotation-content"
						className="mb-1 block text-xs font-medium text-muted-foreground"
					>
						{mode === "comment" ? "Comment:" : "Explanation (optional):"}
					</label>
					<textarea
						id="annotation-content"
						ref={textareaRef}
						value={content}
						onChange={(e) => setContent(e.target.value)}
						onKeyDown={handleKeyDown}
						placeholder={
							mode === "comment"
								? "Add your comment..."
								: "Explain why this change is needed..."
						}
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
					{mode === "comment" ? "Add Comment" : "Suggest Edit"}
				</button>
			</footer>
		</div>
	);
}
