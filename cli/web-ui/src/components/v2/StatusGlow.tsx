import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type GlowColor = "red" | "amber" | "blue" | "green" | "purple";

export interface StatusGlowProps {
	color: GlowColor;
	enabled?: boolean;
	pulse?: boolean;
	children: ReactNode;
	className?: string;
}

const glowClassMap: Record<GlowColor, string> = {
	red: "glow-red",
	amber: "glow-amber",
	blue: "glow-blue",
	green: "glow-green",
	purple: "glow-purple",
};

export function StatusGlow({
	color,
	enabled = true,
	pulse = false,
	children,
	className,
}: StatusGlowProps) {
	if (!enabled) {
		return <div className={className}>{children}</div>;
	}

	return (
		<div
			className={cn(
				"rounded-lg",
				glowClassMap[color],
				"status-glow",
				pulse && "status-glow-pulse",
				className,
			)}
		>
			{children}
		</div>
	);
}
