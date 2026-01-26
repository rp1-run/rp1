import { Check, Code, Copy, MessageSquare, Plus, Send, X } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { AnnotationPopover } from "@/components/v2/AnnotationPopover";
import { useAnnotations } from "@/hooks/useAnnotations";
import {
	getHighlighter,
	getLanguageDisplayName,
	normalizeLanguage,
} from "@/lib/shiki";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { Annotation, LineAnchor } from "@/types/annotations";

interface CodeBlockProps {
	code: string;
	language?: string;
	className?: string;
	artifactPath?: string;
	enableAnnotations?: boolean;
}

interface LineAnnotationFormProps {
	lineNumber: number;
	lineContent: string;
	artifactPath: string;
	position: { x: number; y: number };
	onClose: () => void;
	onAnnotationCreated?: () => void;
}

function LineAnnotationForm({
	lineNumber,
	lineContent,
	artifactPath,
	position,
	onClose,
	onAnnotationCreated,
}: LineAnnotationFormProps) {
	const [content, setContent] = useState("");
	const [isSubmitting, setIsSubmitting] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const { createAnnotation } = useAnnotationContext();

	useEffect(() => {
		textareaRef.current?.focus();
	}, []);

	const handleSubmit = useCallback(async () => {
		const trimmedContent = content.trim();
		if (!trimmedContent || isSubmitting) return;

		setIsSubmitting(true);
		try {
			const anchor: LineAnchor = {
				type: "line",
				lineNumber,
				lineContent,
			};

			await createAnnotation({
				artifactPath,
				anchor,
				annotationType: "comment",
				content: trimmedContent,
			});

			onAnnotationCreated?.();
			onClose();
		} catch (error) {
			console.error("Failed to create line annotation:", error);
		} finally {
			setIsSubmitting(false);
		}
	}, [
		artifactPath,
		content,
		createAnnotation,
		isSubmitting,
		lineContent,
		lineNumber,
		onAnnotationCreated,
		onClose,
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

	return (
		<div
			className={cn(
				"fixed z-50 w-72 overflow-hidden rounded-lg border border-border bg-background shadow-xl",
				"animate-in fade-in-0 zoom-in-95 duration-150",
			)}
			style={{
				left: `${position.x}px`,
				top: `${position.y}px`,
				transform: "translateY(4px)",
			}}
			role="dialog"
			aria-label="Add line annotation"
		>
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-1.5 text-xs font-medium">
					<MessageSquare className="h-3 w-3" aria-hidden="true" />
					<span>Line {lineNumber}</span>
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
				<textarea
					ref={textareaRef}
					value={content}
					onChange={(e) => setContent(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Add a comment on this line..."
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

			<footer className="flex items-center justify-between border-t border-border px-3 py-2">
				<span className="text-xs text-muted-foreground">
					Cmd/Ctrl+Enter to submit
				</span>
				<button
					type="button"
					onClick={handleSubmit}
					disabled={!content.trim() || isSubmitting}
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
						"bg-primary text-primary-foreground",
						"hover:bg-primary/90",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:pointer-events-none disabled:opacity-50",
					)}
				>
					<Send className="h-3 w-3" aria-hidden="true" />
					Comment
				</button>
			</footer>
		</div>
	);
}

interface LineGutterProps {
	lineNumber: number;
	annotationCount: number;
	hasAnnotations: boolean;
	enableAnnotations: boolean;
	onGutterClick: (lineNumber: number, rect: DOMRect) => void;
	onIndicatorClick: (lineNumber: number, rect: DOMRect) => void;
}

function LineGutter({
	lineNumber,
	annotationCount,
	hasAnnotations,
	enableAnnotations,
	onGutterClick,
	onIndicatorClick,
}: LineGutterProps) {
	const gutterRef = useRef<HTMLButtonElement>(null);
	const [isHovered, setIsHovered] = useState(false);

	const handleClick = useCallback(() => {
		if (!gutterRef.current) return;

		const rect = gutterRef.current.getBoundingClientRect();

		if (hasAnnotations) {
			onIndicatorClick(lineNumber, rect);
		} else {
			onGutterClick(lineNumber, rect);
		}
	}, [hasAnnotations, lineNumber, onGutterClick, onIndicatorClick]);

	if (!enableAnnotations) {
		return (
			<div className="h-6 leading-6 relative">
				<span>{lineNumber}</span>
			</div>
		);
	}

	return (
		<button
			ref={gutterRef}
			type="button"
			className={cn(
				"h-6 leading-6 relative cursor-pointer w-full bg-transparent border-none p-0 text-inherit font-inherit",
				!hasAnnotations && "group/line",
			)}
			onMouseEnter={() => setIsHovered(true)}
			onMouseLeave={() => setIsHovered(false)}
			onClick={handleClick}
			aria-label={
				hasAnnotations
					? `View ${annotationCount} annotation${annotationCount !== 1 ? "s" : ""} on line ${lineNumber}`
					: `Add annotation on line ${lineNumber}`
			}
		>
			{hasAnnotations ? (
				<div
					className={cn(
						"absolute inset-0 flex items-center justify-center",
						"text-primary",
					)}
				>
					<div className="relative">
						<MessageSquare
							className="h-3.5 w-3.5"
							aria-hidden="true"
							fill="currentColor"
						/>
						{annotationCount > 1 && (
							<span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-[0.875rem] items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium text-primary-foreground">
								{annotationCount}
							</span>
						)}
					</div>
				</div>
			) : isHovered ? (
				<div className="absolute inset-0 flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
					<Plus className="h-3.5 w-3.5" aria-hidden="true" />
				</div>
			) : (
				<span>{lineNumber}</span>
			)}
		</button>
	);
}

export function CodeBlock({
	code,
	language,
	className,
	artifactPath,
	enableAnnotations = false,
}: CodeBlockProps) {
	const [highlightedHtml, setHighlightedHtml] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

	const [activeLineForm, setActiveLineForm] = useState<{
		lineNumber: number;
		position: { x: number; y: number };
	} | null>(null);

	const [activePopover, setActivePopover] = useState<{
		annotation: Annotation;
		position: { x: number; y: number };
	} | null>(null);

	const normalizedLang = normalizeLanguage(language);
	const displayName = getLanguageDisplayName(language);

	const lines = useMemo(() => {
		const codeLines = code.endsWith("\n")
			? code.split("\n").slice(0, -1)
			: code.split("\n");
		return codeLines;
	}, [code]);

	const lineCount = lines.length;

	const { getAnnotationsAtPosition } = useAnnotations({
		artifactPath: artifactPath ?? "",
	});

	const lineAnnotationsMap = useMemo(() => {
		if (!enableAnnotations || !artifactPath) {
			return new Map<number, Annotation[]>();
		}

		const map = new Map<number, Annotation[]>();
		for (let i = 1; i <= lineCount; i++) {
			const anchor: LineAnchor = {
				type: "line",
				lineNumber: i,
				lineContent: lines[i - 1] ?? "",
			};
			const annotations = getAnnotationsAtPosition(anchor);
			if (annotations.length > 0) {
				map.set(i, [...annotations]);
			}
		}
		return map;
	}, [
		enableAnnotations,
		artifactPath,
		lineCount,
		lines,
		getAnnotationsAtPosition,
	]);

	useEffect(() => {
		let cancelled = false;

		async function highlight() {
			try {
				const highlighter = await getHighlighter();
				if (cancelled) return;

				const html = highlighter.codeToHtml(code, {
					lang: normalizedLang,
					themes: {
						light: "catppuccin-latte",
						dark: "catppuccin-mocha",
					},
					defaultColor: false,
				});

				setHighlightedHtml(html);
			} catch (error) {
				console.error("Failed to highlight code:", error);
				setHighlightedHtml("");
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		}

		highlight();

		return () => {
			cancelled = true;
		};
	}, [code, normalizedLang]);

	const handleCopy = useCallback(async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);

			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}

			copyTimeoutRef.current = setTimeout(() => {
				setCopied(false);
			}, 2000);
		} catch (error) {
			console.error("Failed to copy code:", error);
		}
	}, [code]);

	useEffect(() => {
		return () => {
			if (copyTimeoutRef.current) {
				clearTimeout(copyTimeoutRef.current);
			}
		};
	}, []);

	const handleGutterClick = useCallback((lineNumber: number, rect: DOMRect) => {
		setActivePopover(null);
		setActiveLineForm({
			lineNumber,
			position: {
				x: rect.right + 8,
				y: rect.top,
			},
		});
	}, []);

	const handleIndicatorClick = useCallback(
		(lineNumber: number, rect: DOMRect) => {
			setActiveLineForm(null);
			const annotations = lineAnnotationsMap.get(lineNumber);
			if (annotations && annotations.length > 0) {
				setActivePopover({
					annotation: annotations[0],
					position: {
						x: rect.right + 8,
						y: rect.top + rect.height / 2,
					},
				});
			}
		},
		[lineAnnotationsMap],
	);

	const handleCloseForm = useCallback(() => {
		setActiveLineForm(null);
	}, []);

	const handleClosePopover = useCallback(() => {
		setActivePopover(null);
	}, []);

	return (
		<div
			className={cn(
				"group relative my-4 rounded-lg border bg-muted/50 overflow-hidden",
				className,
			)}
		>
			<div className="flex items-center justify-between border-b bg-muted/80 px-4 py-2">
				<div className="flex items-center gap-2 text-xs text-muted-foreground">
					<Code className="h-3.5 w-3.5" />
					<span>{displayName}</span>
				</div>
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
								onClick={handleCopy}
								aria-label={copied ? "Copied!" : "Copy code"}
							>
								{copied ? (
									<Check className="h-3.5 w-3.5 text-terminal-green" />
								) : (
									<Copy className="h-3.5 w-3.5" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent side="left">
							{copied ? "Copied!" : "Copy code"}
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			</div>

			<div className="overflow-x-auto">
				<div className="flex min-w-full text-sm">
					<div
						className={cn(
							"flex-shrink-0 select-none border-r bg-muted/30 px-3 py-3 text-right text-muted-foreground",
							enableAnnotations && "min-w-[3rem]",
						)}
						aria-hidden={!enableAnnotations}
					>
						{Array.from({ length: lineCount }, (_, i) => {
							const lineNumber = i + 1;
							const lineAnnotations = lineAnnotationsMap.get(lineNumber);
							const hasAnnotations =
								lineAnnotations !== undefined && lineAnnotations.length > 0;
							const annotationCount = lineAnnotations?.length ?? 0;

							return (
								<LineGutter
									key={lineNumber}
									lineNumber={lineNumber}
									annotationCount={annotationCount}
									hasAnnotations={hasAnnotations}
									enableAnnotations={enableAnnotations && !!artifactPath}
									onGutterClick={handleGutterClick}
									onIndicatorClick={handleIndicatorClick}
								/>
							);
						})}
					</div>

					<div className="flex-1 overflow-x-auto p-3">
						{isLoading ? (
							<pre className="m-0 p-0">
								<code className="block leading-6">{code}</code>
							</pre>
						) : (
							<div className="relative">
								{enableAnnotations && (
									<div
										className="absolute left-0 top-0 w-full pointer-events-none"
										aria-hidden="true"
									>
										{Array.from({ length: lineCount }, (_, i) => {
											const lineNumber = i + 1;
											const lineAnnotations =
												lineAnnotationsMap.get(lineNumber);
											const hasAnnotations =
												lineAnnotations !== undefined &&
												lineAnnotations.length > 0;

											return (
												<div
													key={lineNumber}
													className={cn(
														"h-6",
														hasAnnotations && "bg-primary/10",
													)}
												/>
											);
										})}
									</div>
								)}
								<div
									className="shiki-container relative leading-6 [&_pre]:m-0 [&_pre]:p-0 [&_pre]:bg-transparent [&_pre_code]:leading-6 [&_.line]:leading-6 [&_.line]:h-6"
									// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
									dangerouslySetInnerHTML={{ __html: highlightedHtml }}
								/>
							</div>
						)}
					</div>
				</div>
			</div>

			{activeLineForm && artifactPath && (
				<LineAnnotationForm
					lineNumber={activeLineForm.lineNumber}
					lineContent={lines[activeLineForm.lineNumber - 1] ?? ""}
					artifactPath={artifactPath}
					position={activeLineForm.position}
					onClose={handleCloseForm}
					onAnnotationCreated={handleCloseForm}
				/>
			)}

			{activePopover && (
				<AnnotationPopover
					annotation={activePopover.annotation}
					position={activePopover.position}
					onClose={handleClosePopover}
				/>
			)}
		</div>
	);
}
