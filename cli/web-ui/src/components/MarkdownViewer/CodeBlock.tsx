import { Check, Code, Copy } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import {
	getHighlighter,
	getLanguageDisplayName,
	normalizeLanguage,
} from "@/lib/shiki";
import { cn } from "@/lib/utils";

interface CodeBlockProps {
	code: string;
	language?: string;
	className?: string;
}

export function CodeBlock({ code, language, className }: CodeBlockProps) {
	const [highlightedHtml, setHighlightedHtml] = useState<string>("");
	const [isLoading, setIsLoading] = useState(true);
	const [copied, setCopied] = useState(false);
	const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

	const normalizedLang = normalizeLanguage(language);
	const displayName = getLanguageDisplayName(language);

	// Count actual lines - handle trailing newline
	const lineCount = code.endsWith("\n")
		? code.split("\n").length - 1
		: code.split("\n").length;

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
						className="flex-shrink-0 select-none border-r bg-muted/30 px-3 py-3 text-right text-muted-foreground"
						aria-hidden="true"
					>
						{Array.from({ length: lineCount }, (_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: line numbers are static, never reorder
							<div key={i} className="h-6 leading-6">
								{i + 1}
							</div>
						))}
					</div>

					<div className="flex-1 overflow-x-auto p-3">
						{isLoading ? (
							<pre className="m-0 p-0">
								<code className="block leading-6">{code}</code>
							</pre>
						) : (
							<div
								className="shiki-container"
								// biome-ignore lint/security/noDangerouslySetInnerHtml: trusted Shiki output
								dangerouslySetInnerHTML={{ __html: highlightedHtml }}
							/>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
