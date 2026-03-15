import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import {
	BarChart3,
	Clock,
	Code,
	File,
	FileText,
	GitCompare,
	Image,
	ListChecks,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { StepNodeData } from "@/lib/workflow-converter";
import type { Artifact, ArtifactType, StepStatus } from "@/types/runs";
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

const artifactIconMap: Record<ArtifactType, typeof FileText> = {
	markdown: FileText,
	code: Code,
	diff: GitCompare,
	report: BarChart3,
	diagram: Image,
	other: File,
};

const artifactBorderColor: Record<ArtifactType, string> = {
	markdown: "border-l-blue-400",
	code: "border-l-green-400",
	diff: "border-l-orange-400",
	report: "border-l-purple-400",
	diagram: "border-l-cyan-400",
	other: "border-l-muted-foreground",
};

function getArtifactFilename(path: string): string {
	const segments = path.split("/");
	return segments[segments.length - 1] || path;
}

export function ArtifactBadge({
	artifact,
	runId,
}: {
	readonly artifact: Artifact;
	readonly runId: string | undefined;
}) {
	const navigate = useNavigate();
	const Icon = artifactIconMap[artifact.type] || File;
	const borderClass =
		artifactBorderColor[artifact.type] || "border-l-muted-foreground";

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (runId) {
			navigate(`/runs/${runId}/artifacts/${artifact.path}`);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className={cn(
				"flex min-h-[32px] w-full items-center gap-1.5 rounded border-l-2 bg-muted/40 px-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:bg-muted/70",
				borderClass,
			)}
			title={artifact.path}
		>
			<Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
			<span className="min-w-0 truncate">
				{getArtifactFilename(artifact.path)}
			</span>
			{artifact.isNew && (
				<span
					className="ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-status-running"
					role="img"
					aria-label="New artifact"
				/>
			)}
		</button>
	);
}

function ArtifactChip({
	artifacts,
	runId,
}: {
	readonly artifacts: readonly Artifact[];
	readonly runId: string | undefined;
}) {
	const navigate = useNavigate();
	const hasNew = artifacts.some((a) => a.isNew);
	const primary = artifacts[0];
	const Icon = artifactIconMap[primary.type] || File;

	const handleClick = (e: React.MouseEvent) => {
		e.stopPropagation();
		if (runId) {
			navigate(`/runs/${runId}/artifacts/${primary.path}`);
		}
	};

	return (
		<button
			type="button"
			onClick={handleClick}
			className="inline-flex items-center gap-1 rounded-full bg-muted/50 px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-muted/80"
			title={artifacts.map((a) => getArtifactFilename(a.path)).join(", ")}
		>
			<Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
			<span className="text-[11px] tabular-nums">{artifacts.length}</span>
			{hasNew && (
				<span
					className="h-1.5 w-1.5 shrink-0 rounded-full bg-status-running"
					role="img"
					aria-label="New artifact"
				/>
			)}
		</button>
	);
}

export function StepNode({
	data,
	sourcePosition,
	targetPosition,
}: NodeProps<StepNodeType>) {
	const { runId } = useParams();
	const style = statusStyles[data.status];
	const showDuration = data.startedAt !== null;
	const showTaskProgress =
		data.taskCount !== null && data.completedTaskCount !== null;
	const hasArtifacts = data.artifacts.length > 0;

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
					"min-h-[60px] w-[200px] rounded-[var(--radius)] border px-3 py-2.5 transition-colors duration-300",
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

				{(showDuration || showTaskProgress || hasArtifacts) && (
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
						{hasArtifacts && (
							<span className="ml-auto">
								<ArtifactChip artifacts={data.artifacts} runId={runId} />
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
