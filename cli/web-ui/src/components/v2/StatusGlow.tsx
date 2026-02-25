import type { CSSProperties, HTMLAttributes, ReactNode } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { statusGlowColors } from "@/lib/status-colors";
import { cn } from "@/lib/utils";
import type { RunStatus } from "@/types/runs";

type GlowIntensity = "subtle" | "normal" | "strong";

interface GlowCSSProperties extends CSSProperties {
	"--glow-color"?: string;
}

const intensitySpreads: Record<GlowIntensity, string> = {
	subtle: "0 0 8px 1px",
	normal: "0 0 16px 2px",
	strong: "0 0 24px 4px",
};

export interface StatusGlowProps
	extends Omit<HTMLAttributes<HTMLDivElement>, "style"> {
	status: RunStatus;
	pulse?: boolean;
	intensity?: GlowIntensity;
	className?: string;
	children: ReactNode;
	style?: CSSProperties;
}

export function StatusGlow({
	status,
	pulse = false,
	intensity = "normal",
	className,
	children,
	style,
	...rest
}: StatusGlowProps) {
	const reducedMotion = usePrefersReducedMotion();
	const glowColor = statusGlowColors[status];
	const showPulseAnimation = pulse && !reducedMotion;
	const effectiveIntensity = pulse && reducedMotion ? "strong" : intensity;
	const spread = intensitySpreads[effectiveIntensity];

	const glowStyle: GlowCSSProperties = showPulseAnimation
		? { "--glow-color": glowColor, ...style }
		: { boxShadow: `${spread} ${glowColor}`, ...style };

	return (
		<div
			className={cn(showPulseAnimation && "animate-glow-pulse", className)}
			style={glowStyle}
			{...rest}
		>
			{children}
		</div>
	);
}
