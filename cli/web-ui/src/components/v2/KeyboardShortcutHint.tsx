import { cn } from "@/lib/utils";

export interface KeyboardShortcutHintProps {
	keys: string;
	className?: string;
}

export function KeyboardShortcutHint({
	keys,
	className,
}: KeyboardShortcutHintProps) {
	const parts = keys.split(/(\+| )/);
	return (
		<span className={cn("inline-flex items-center gap-0.5", className)}>
			{parts.map((part, i) => {
				const key = `${part}-${i}`;
				if (part === "+" || part === " ") {
					return (
						<span key={key} className="text-xs text-muted-foreground">
							{part === " " ? " " : "+"}
						</span>
					);
				}
				return (
					<kbd
						key={key}
						className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-muted/70 px-1.5 py-0.5 font-mono text-xs text-muted-foreground"
					>
						{part}
					</kbd>
				);
			})}
		</span>
	);
}
