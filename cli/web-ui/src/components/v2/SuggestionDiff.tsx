import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SuggestionDiffProps {
	original: string;
	suggested: string;
	onAccept?: () => void;
	className?: string;
}

/**
 * Renders a GitHub-style diff block showing original text (deletion)
 * and suggested replacement text (addition).
 */
export function SuggestionDiff({
	original,
	suggested,
	onAccept,
	className,
}: SuggestionDiffProps) {
	return (
		<fieldset
			className={cn(
				"overflow-hidden rounded-md border border-border font-mono text-sm",
				className,
			)}
			aria-label="Suggested text change"
		>
			<legend className="sr-only">Suggested text change</legend>

			<del className="flex items-start gap-2 bg-terminal-red/15 px-3 py-2 text-foreground no-underline">
				<span
					className="select-none font-bold text-terminal-red"
					aria-hidden="true"
				>
					-
				</span>
				<span className="flex-1 whitespace-pre-wrap break-words line-through text-terminal-red/90">
					{original}
				</span>
			</del>

			<ins className="flex items-start gap-2 bg-terminal-green/15 px-3 py-2 text-foreground no-underline">
				<span
					className="select-none font-bold text-terminal-green"
					aria-hidden="true"
				>
					+
				</span>
				<span className="flex-1 whitespace-pre-wrap break-words text-terminal-green">
					{suggested}
				</span>
			</ins>

			{onAccept && (
				<div className="flex justify-end border-t border-border bg-muted/30 px-3 py-2">
					<button
						type="button"
						onClick={onAccept}
						className={cn(
							"inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
							"bg-terminal-green/20 text-terminal-green",
							"hover:bg-terminal-green/30",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Accept suggested change"
					>
						<Check className="h-4 w-4" aria-hidden="true" />
						Accept
					</button>
				</div>
			)}
		</fieldset>
	);
}
