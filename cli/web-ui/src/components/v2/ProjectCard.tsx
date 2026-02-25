import { motion } from "framer-motion";
import { Check, FileText, Play, X } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cardHover, cardTap } from "@/lib/motion-config";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { V2Project } from "@/types/projects";

export interface ProjectCardProps {
	project: V2Project;
	onCardClick: () => void;
	onRunsClick: () => void;
	onArtifactsClick: () => void;
	selected?: boolean;
	className?: string;
}

function truncatePath(path: string, maxLength = 50): string {
	if (path.length <= maxLength) {
		return path;
	}
	const start = path.slice(0, 15);
	const end = path.slice(-(maxLength - 18));
	return `${start}...${end}`;
}

function AvailabilityIndicator({ available }: { available: boolean }) {
	if (available) {
		return (
			// biome-ignore lint/a11y/useSemanticElements: span with role="status" is preferred over output element for inline status badges
			<span
				className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-completed/15 px-2 py-0.5 text-xs font-medium text-status-completed"
				role="status"
				aria-label="Available"
			>
				<Check className="h-3 w-3" aria-hidden="true" />
				<span>Available</span>
			</span>
		);
	}
	return (
		// biome-ignore lint/a11y/useSemanticElements: span with role="status" is preferred over output element for inline status badges
		<span
			className="inline-flex shrink-0 items-center gap-1 rounded-full bg-status-failed/15 px-2 py-0.5 text-xs font-medium text-status-failed"
			role="status"
			aria-label="Unavailable"
		>
			<X className="h-3 w-3" aria-hidden="true" />
			<span>Unavailable</span>
		</span>
	);
}

export function ProjectCard({
	project,
	onCardClick,
	onRunsClick,
	onArtifactsClick,
	selected,
	className,
}: ProjectCardProps) {
	const reducedMotion = usePrefersReducedMotion();

	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onCardClick();
		}
	};

	const handleArtifactsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		onArtifactsClick();
	};

	const handleRunsClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		e.preventDefault();
		onRunsClick();
	};

	const lastActivity = project.lastActivityAt
		? formatRelativeTime(project.lastActivityAt)
		: "No activity";

	const runCountLabel = `${project.runCount} run${project.runCount === 1 ? "" : "s"}`;

	return (
		<motion.div
			role="button"
			tabIndex={0}
			onClick={onCardClick}
			onKeyDown={handleKeyDown}
			data-selected={selected || undefined}
			whileHover={reducedMotion ? undefined : cardHover}
			whileTap={reducedMotion ? undefined : cardTap}
			className={cn(
				"group flex flex-col gap-3 rounded-lg border border-border p-4 transition-colors",
				"cursor-pointer hover:bg-muted/40",
				selected && "ring-2 ring-primary",
				!project.available && "opacity-60",
				className,
			)}
		>
			<div className="flex items-start justify-between gap-2">
				<h3 className="truncate font-medium text-foreground">{project.name}</h3>
				<AvailabilityIndicator available={project.available} />
			</div>

			<p
				className="truncate text-sm text-muted-foreground"
				title={project.path}
			>
				{truncatePath(project.path)}
			</p>

			<div className="flex items-center justify-between gap-2">
				<div className="flex items-center gap-3 text-sm text-muted-foreground">
					<span className="tabular-nums">{runCountLabel}</span>
					<span aria-hidden="true" className="text-border">
						|
					</span>
					<span className="tabular-nums">{lastActivity}</span>
				</div>

				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={handleArtifactsClick}
						className={cn(
							"rounded p-1.5 text-muted-foreground transition-colors",
							"hover:bg-muted hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="View artifacts"
						title="Artifacts"
					>
						<FileText className="h-4 w-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						onClick={handleRunsClick}
						className={cn(
							"rounded p-1.5 text-muted-foreground transition-colors",
							"hover:bg-muted hover:text-foreground",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="View runs"
						title="Runs"
					>
						<Play className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
			</div>
		</motion.div>
	);
}
