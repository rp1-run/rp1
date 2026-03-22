import type React from "react";
import { getStatusLabel } from "@/lib/status-labels";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run, RunStatus } from "@/types/runs";

export interface RunCardProps {
	run: Run;
	onClick?: () => void;
	selected?: boolean;
	showStatus?: boolean;
	className?: string;
}

function StatusDot({ status }: { status: RunStatus }) {
	const dotClass = cn(
		"h-2 w-2 shrink-0 rounded-full",
		status === "running" && "bg-accent-amber animate-status-pulse",
		status === "completed" && "bg-fg-ghost",
		status === "failed" && "bg-failure",
		status === "waiting" && "bg-accent-amber",
		status === "not_started" && "bg-fg-ghost",
		status === "skipped" && "bg-fg-ghost",
	);

	return <span className={dotClass} aria-hidden="true" />;
}

export function RunCard({
	run,
	onClick,
	selected,
	showStatus = true,
	className,
}: RunCardProps) {
	const handleKeyDown = (event: React.KeyboardEvent) => {
		if (onClick && (event.key === "Enter" || event.key === " ")) {
			event.preventDefault();
			onClick();
		}
	};

	return (
		// biome-ignore lint/a11y/useSemanticElements: div with role="button" used for custom run card styling
		<div
			role="button"
			tabIndex={onClick ? 0 : undefined}
			onClick={onClick}
			onKeyDown={onClick ? handleKeyDown : undefined}
			className={cn(
				"group flex items-center gap-3 py-3 px-3 transition-colors duration-150",
				onClick && "cursor-pointer hover:bg-accent-ghost",
				selected && "bg-accent-ghost",
				run.status === "waiting" && "bg-accent-ghost",
				className,
			)}
		>
			{showStatus && <StatusDot status={run.status} />}

			<div className="min-w-0 flex-1">
				<div className="flex items-center gap-2">
					<span className="truncate type-body font-medium text-fg">
						{run.projectName}
					</span>
					<span className="text-fg-ghost">/</span>
					<span className="truncate type-body text-fg-muted">
						{run.featureName}
					</span>
				</div>

				<div className="mt-0.5 flex items-center gap-2 type-secondary text-fg-muted">
					<span>{run.command}</span>
					{run.currentStep && (
						<>
							<span aria-hidden="true">-</span>
							<span className="truncate">{run.currentStep}</span>
						</>
					)}
				</div>

				{run.status === "failed" && run.error && (
					<p className="mt-1 truncate type-secondary text-failure">
						{run.error}
					</p>
				)}
			</div>

			<div className="flex shrink-0 flex-col items-end gap-1">
				<time
					dateTime={run.startedAt}
					className="type-secondary text-fg-ghost tabular-nums"
				>
					{formatRelativeTime(run.startedAt)}
				</time>
				{showStatus && (
					// biome-ignore lint/a11y/useSemanticElements: span with role="status" for inline status text
					<span
						role="status"
						className={cn(
							"type-caption",
							run.status === "running" && "text-fg",
							run.status === "completed" && "text-fg-ghost",
							run.status === "failed" && "text-failure",
							run.status === "waiting" && "text-accent-amber",
							(run.status === "not_started" || run.status === "skipped") &&
								"text-fg-ghost",
						)}
					>
						{getStatusLabel(run.status)}
					</span>
				)}
			</div>
		</div>
	);
}
