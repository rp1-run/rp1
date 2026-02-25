import { motion } from "framer-motion";
import type React from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cardHover, cardTap } from "@/lib/motion-config";
import { statusBorderColors, statusGlowColors } from "@/lib/status-colors";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run } from "@/types/runs";
import { StatusBadge } from "./StatusBadge";

export interface RunCardProps {
	run: Run;
	onClick?: () => void;
	selected?: boolean;
	showStatus?: boolean;
	className?: string;
}

export function RunCard({
	run,
	onClick,
	selected,
	showStatus = true,
	className,
}: RunCardProps) {
	const reducedMotion = usePrefersReducedMotion();

	const borderColorClass = statusBorderColors[run.status];
	const glowColor = statusGlowColors[run.status];
	const selectedGlowColor = glowColor.replace(/\/ [\d.]+\)$/, "/ 0.6)");

	const hoverWithGlow = reducedMotion
		? undefined
		: {
				...cardHover,
				boxShadow: selected
					? `-4px 0 16px 0px ${selectedGlowColor}`
					: `-4px 0 12px -2px ${glowColor}`,
			};

	const accentStyle: React.CSSProperties | undefined = selected
		? { boxShadow: `-4px 0 16px 0px ${selectedGlowColor}` }
		: undefined;

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (onClick && (event.key === "Enter" || event.key === " ")) {
			event.preventDefault();
			onClick();
		}
	};

	return (
		<motion.div
			role="button"
			tabIndex={onClick ? 0 : undefined}
			onClick={onClick}
			onKeyDown={onClick ? handleKeyDown : undefined}
			whileHover={hoverWithGlow}
			whileTap={reducedMotion ? undefined : cardTap}
			style={accentStyle}
			className={cn(
				"group flex items-center gap-4 py-3 px-3 transition-colors",
				"border-l-[3px]",
				borderColorClass,
				onClick && "cursor-pointer hover:bg-muted/50",
				selected && "bg-muted/30",
				className,
			)}
		>
			{showStatus && (
				<StatusBadge status={run.status} size="sm" showLabel={false} />
			)}

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate font-medium text-foreground">
						{run.projectName}
					</span>
					<span className="text-muted-foreground">/</span>
					<span className="truncate text-muted-foreground">
						{run.featureName}
					</span>
				</div>

				<div className="mt-0.5 flex items-center gap-2 text-sm text-muted-foreground">
					<code className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono">
						{run.command}
					</code>
					{run.currentStep && (
						<>
							<span aria-hidden="true">-</span>
							<span className="truncate">{run.currentStep}</span>
						</>
					)}
				</div>

				{run.status === "failed" && run.error && (
					<p className="mt-1 truncate text-xs text-status-failed">
						{run.error}
					</p>
				)}
			</div>

			<time
				dateTime={run.startedAt}
				className="shrink-0 text-sm text-muted-foreground tabular-nums"
			>
				{formatRelativeTime(run.startedAt)}
			</time>
		</motion.div>
	);
}
