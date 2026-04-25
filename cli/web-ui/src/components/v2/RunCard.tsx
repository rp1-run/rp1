import { NotebookTabs } from "lucide-react";
import type React from "react";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
import { resolveRunDisplayName } from "@/lib/run-display";
import { getRunStatusLabel, getStatusLabel } from "@/lib/status-labels";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run, RunStatus } from "@/types/runs";
import { HarnessIcon } from "./HarnessIcon";

export interface RunCardProps {
	run: Run;
	onClick?: () => void;
	selected?: boolean;
	showStatus?: boolean;
	showProject?: boolean;
	className?: string;
}

function StatusDot({ status }: { status: RunStatus }) {
	const dotClass = cn(
		"h-2 w-2 shrink-0 rounded-full",
		status === "running" && "bg-accent-amber animate-status-pulse",
		status === "waiting" && "bg-accent-amber",
		status === "completed" && "bg-status-completed",
		status === "failed" && "bg-failure",
		status === "abandoned" && "bg-failure",
		status === "inactive" && "bg-muted-foreground",
		status === "cancelled" && "bg-muted-foreground",
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
	showProject = true,
	className,
}: RunCardProps) {
	const { openWorkspace } = useWorkspaceTabs();
	const displayStatusLabel = getRunStatusLabel(run);
	const statusLabel =
		run.status === "running" && displayStatusLabel === getStatusLabel("running")
			? null
			: displayStatusLabel.toLowerCase();

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
				"flex items-center gap-3 py-2.5 px-3 transition-colors duration-150",
				onClick && "cursor-pointer hover:bg-accent-ghost",
				selected && "bg-accent-ghost",
				run.status === "waiting" && "bg-accent-ghost",
				className,
			)}
		>
			{showStatus && <StatusDot status={run.status} />}

			<span className="w-[5.5em] shrink-0 text-right type-secondary tabular-nums text-fg-ghost">
				{formatRelativeTime(run.startedAt)}
			</span>

			<span className="inline-flex w-[14px] shrink-0 items-center justify-center">
				<HarnessIcon harness={run.harness} size={14} />
			</span>

			<span className="shrink-0 type-body font-medium text-fg">
				{run.command}
			</span>

			<span className="truncate type-secondary text-fg-muted">
				{resolveRunDisplayName(run) || run.command}
			</span>

			{showStatus && statusLabel && (
				<span className="shrink-0 type-caption text-fg-ghost">
					{statusLabel}
				</span>
			)}

			{showProject && (
				// biome-ignore lint/a11y/useSemanticElements: span with role="link" for project navigation within button row
				<span
					role="link"
					tabIndex={0}
					onClick={(e) => {
						e.stopPropagation();
						openWorkspace(`/projects/${run.projectId}`);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") {
							e.stopPropagation();
							openWorkspace(`/projects/${run.projectId}`);
						}
					}}
					className="ml-auto shrink-0 flex items-center gap-1 pl-4 type-secondary italic text-fg-ghost hover:text-fg-muted transition-colors duration-150 cursor-pointer"
					aria-label={`Open project ${run.projectName}`}
				>
					<NotebookTabs className="h-3 w-3" strokeWidth={1.5} />
					{run.projectName}
				</span>
			)}
		</div>
	);
}
