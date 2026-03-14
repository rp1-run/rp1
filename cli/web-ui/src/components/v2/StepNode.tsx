import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { Clock, ListChecks } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import type { StepNodeData } from "@/lib/workflow-converter";
import type { StepStatus } from "@/types/runs";
import { StatusBadge } from "./StatusBadge";

type StepNodeType = Node<StepNodeData, "stepNode">;

export const statusStyles: Record<
	StepStatus,
	{ border: string; bg: string; animation?: string }
> = {
	pending: {
		border: "border-dashed border-border",
		bg: "bg-card",
	},
	running: {
		border: "border-solid border-status-running",
		bg: "bg-status-running/10",
		animation: "animate-glow-pulse",
	},
	completed: {
		border: "border-solid border-status-completed",
		bg: "bg-status-completed/10",
	},
	failed: {
		border: "border-solid border-status-failed",
		bg: "bg-status-failed/10",
	},
	"waiting-input": {
		border: "border-solid border-status-waiting",
		bg: "bg-status-waiting/10",
	},
	"needs-review": {
		border: "border-solid border-status-needs-review",
		bg: "bg-status-needs-review/10",
	},
	skipped: {
		border: "border-dashed border-muted-foreground/40",
		bg: "bg-muted/30",
	},
};

export function formatDuration(
	startedAt: string,
	completedAt: string | null,
): string {
	const start = new Date(startedAt);
	const end = completedAt ? new Date(completedAt) : new Date();
	const diffMs = end.getTime() - start.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);

	if (diffHours > 0) {
		const mins = diffMinutes % 60;
		return `${diffHours}h ${mins}m`;
	}
	if (diffMinutes > 0) {
		const secs = diffSeconds % 60;
		return `${diffMinutes}m ${secs}s`;
	}
	return `${diffSeconds}s`;
}

export function StepNode({
	data,
	sourcePosition,
	targetPosition,
}: NodeProps<StepNodeType>) {
	const style = statusStyles[data.status];
	const showDuration = data.startedAt !== null;
	const showTaskProgress =
		data.taskCount !== null && data.completedTaskCount !== null;

	const resolvedSourcePosition = sourcePosition ?? Position.Right;
	const resolvedTargetPosition = targetPosition ?? Position.Left;

	const prevStatusRef = useRef<StepStatus>(data.status);
	const [isTransitioning, setIsTransitioning] = useState(false);
	const isMountedRef = useRef(false);

	useEffect(() => {
		if (!isMountedRef.current) {
			isMountedRef.current = true;
			prevStatusRef.current = data.status;
			return;
		}

		if (prevStatusRef.current !== data.status) {
			setIsTransitioning(true);
			prevStatusRef.current = data.status;
			const timer = setTimeout(() => setIsTransitioning(false), 500);
			return () => clearTimeout(timer);
		}
	}, [data.status]);

	return (
		<>
			<Handle
				type="target"
				position={resolvedTargetPosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<div
				className={cn(
					"h-[60px] w-[200px] rounded-[var(--radius)] border px-3 py-2.5 transition-colors duration-300",
					style.border,
					style.bg,
					style.animation,
					isTransitioning && "animate-step-transition",
				)}
				style={
					style.animation
						? ({
								"--glow-color": `hsl(var(--status-running) / 0.5)`,
							} as React.CSSProperties)
						: undefined
				}
			>
				<div className="flex items-center justify-between gap-1.5">
					<span className="truncate text-sm font-medium text-foreground">
						{data.label || data.stepId}
					</span>
					<StatusBadge status={data.status} size="sm" showLabel={false} />
				</div>

				{(showDuration || showTaskProgress) && (
					<div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
						{showDuration && (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<Clock className="h-3 w-3" aria-hidden="true" />
								{data.startedAt &&
									formatDuration(data.startedAt, data.completedAt)}
							</span>
						)}
						{showTaskProgress && (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<ListChecks className="h-3 w-3" aria-hidden="true" />
								{data.completedTaskCount} / {data.taskCount}
							</span>
						)}
					</div>
				)}
			</div>
			<Handle
				type="source"
				position={resolvedSourcePosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
		</>
	);
}
