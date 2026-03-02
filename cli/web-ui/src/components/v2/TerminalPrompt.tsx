import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TerminalPromptProps {
	children: ReactNode;
	className?: string;
}

export function TerminalPrompt({ children, className }: TerminalPromptProps) {
	return (
		<span className={cn("font-mono", className)}>
			<span className="text-terminal-green">$</span> {children}
		</span>
	);
}
