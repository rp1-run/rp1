import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { TaskNodeData } from "@/lib/workflow-converter";
import type { StepStatus } from "@/types/runs";
import { statusStyles } from "./StepNode";

type TaskNodeType = Node<TaskNodeData, "taskNode">;

const taskStatusDot: Record<string, string> = {
	pending: "bg-muted-foreground/40",
	running: "bg-status-running animate-pulse",
	completed: "bg-status-completed",
	failed: "bg-status-failed",
	skipped: "bg-muted-foreground/40",
	"waiting-input": "bg-status-waiting",
	"needs-review": "bg-status-needs-review",
};

export function TaskNode({
	data,
	sourcePosition,
	targetPosition,
}: NodeProps<TaskNodeType>) {
	const status = data.status as StepStatus;
	const style = statusStyles[status] ?? statusStyles.pending;

	const resolvedSourcePosition = sourcePosition ?? Position.Right;
	const resolvedTargetPosition = targetPosition ?? Position.Left;

	const dotClass = taskStatusDot[data.status] ?? taskStatusDot.pending;

	return (
		<>
			<Handle
				type="target"
				position={resolvedTargetPosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<div
				className={cn(
					"flex h-[40px] w-[140px] items-center gap-2 rounded-[var(--radius)] border px-2.5 py-1.5 transition-colors duration-300",
					style.border,
					style.bg,
					style.animation,
				)}
				style={
					style.animation
						? ({
								"--glow-color": "hsl(var(--status-running) / 0.5)",
							} as React.CSSProperties)
						: undefined
				}
			>
				<span
					className={cn("h-2 w-2 shrink-0 rounded-full", dotClass)}
					aria-label={data.status}
					role="img"
				/>
				<span className="min-w-0 truncate text-xs font-medium text-foreground">
					{data.label || data.taskId}
				</span>
			</div>
			<Handle
				type="source"
				position={resolvedSourcePosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
		</>
	);
}
