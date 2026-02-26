import { cn } from "@/lib/utils";

export interface TerminalTypingAnimationProps {
	text: string;
	durationMs?: number;
	className?: string;
}

export function TerminalTypingAnimation({
	text,
	durationMs = 1500,
	className,
}: TerminalTypingAnimationProps) {
	return (
		<span
			className={cn("terminal-typing inline-block font-mono", className)}
			style={
				{
					"--char-count": text.length,
					"--typing-duration": `${durationMs}ms`,
				} as React.CSSProperties
			}
		>
			<span className="text-terminal-green">$</span> {text}
			<span className="terminal-typing-cursor animate-blink text-terminal-green">
				_
			</span>
		</span>
	);
}
