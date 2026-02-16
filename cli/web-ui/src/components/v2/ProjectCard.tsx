import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { V2Project } from "@/types/projects";

export interface ProjectCardProps {
	project: V2Project;
	onClick: () => void;
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
			<span
				className="inline-flex items-center gap-1 rounded-full bg-status-completed/15 px-2 py-0.5 text-xs font-medium text-status-completed"
				role="status"
				aria-label="Available"
			>
				<Check className="h-3 w-3" aria-hidden="true" />
				<span>Available</span>
			</span>
		);
	}
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full bg-status-failed/15 px-2 py-0.5 text-xs font-medium text-status-failed"
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
	onClick,
	selected,
	className,
}: ProjectCardProps) {
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (event.key === "Enter" || event.key === " ") {
			event.preventDefault();
			onClick();
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: conditionally interactive card
		<div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={handleKeyDown}
			className={cn(
				"group flex items-center justify-between gap-4 py-3 px-3 transition-colors",
				"cursor-pointer hover:bg-muted/40",
				selected && "bg-primary/5 border-l-2 border-l-primary",
				className,
			)}
		>
			<div className="min-w-0 flex-1">
				<h3 className="truncate font-medium text-foreground">{project.name}</h3>
				<p
					className="mt-0.5 truncate text-sm text-muted-foreground"
					title={project.path}
				>
					{truncatePath(project.path)}
				</p>
			</div>

			<AvailabilityIndicator available={project.available} />
		</div>
	);
}
