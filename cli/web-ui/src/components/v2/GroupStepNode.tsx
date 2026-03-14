import { Handle, type Node, type NodeProps, Position } from "@xyflow/react";
import {
	BarChart3,
	ChevronDown,
	ChevronRight,
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
import { formatDuration, statusStyles } from "./StepNode";

type GroupStepNodeType = Node<StepNodeData, "groupStepNode">;

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

function GroupArtifactBadge({
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

export interface GroupStepNodeProps {
	readonly onToggleExpand?: (stepId: string) => void;
}

export function GroupStepNode({
	data,
	sourcePosition,
	targetPosition,
}: NodeProps<GroupStepNodeType>) {
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

	const handleToggle = (e: React.MouseEvent) => {
		e.stopPropagation();
		const event = new CustomEvent("stepnode:toggle-expand", {
			detail: { stepId: data.stepId },
			bubbles: true,
		});
		(e.target as HTMLElement).dispatchEvent(event);
	};

	if (!data.isExpanded) {
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
									"--glow-color": "hsl(var(--status-running) / 0.5)",
								} as React.CSSProperties)
							: undefined
					}
				>
					<div className="flex items-center justify-between gap-1.5">
						<button
							type="button"
							onClick={handleToggle}
							className="flex items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
							aria-label="Expand sub-flow"
						>
							<ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
						</button>
						<span className="min-w-0 truncate text-sm font-medium text-foreground">
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

					{hasArtifacts && (
						<div className="mt-2 flex flex-col gap-1">
							{data.artifacts.map((artifact) => (
								<GroupArtifactBadge
									key={artifact.path}
									artifact={artifact}
									runId={runId}
								/>
							))}
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

	return (
		<>
			<Handle
				type="target"
				position={resolvedTargetPosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
			<div
				className={cn(
					"rounded-[var(--radius)] border transition-colors duration-300",
					style.border,
					style.bg,
					style.animation,
					isTransitioning && "animate-step-transition",
				)}
				style={{
					width: "100%",
					height: "100%",
					...(style.animation
						? ({
								"--glow-color": "hsl(var(--status-running) / 0.5)",
							} as React.CSSProperties)
						: {}),
				}}
			>
				<div className="px-3 py-2.5">
					<div className="flex items-center justify-between gap-1.5">
						<button
							type="button"
							onClick={handleToggle}
							className="flex items-center gap-1 rounded p-0.5 text-muted-foreground transition-colors hover:text-foreground"
							aria-label="Collapse sub-flow"
						>
							<ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
						</button>
						<span className="min-w-0 truncate text-sm font-medium text-foreground">
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

					{hasArtifacts && (
						<div className="mt-2 flex flex-col gap-1">
							{data.artifacts.map((artifact) => (
								<GroupArtifactBadge
									key={artifact.path}
									artifact={artifact}
									runId={runId}
								/>
							))}
						</div>
					)}
				</div>
			</div>
			<Handle
				type="source"
				position={resolvedSourcePosition}
				className="!bg-transparent !border-0 !w-0 !h-0"
			/>
		</>
	);
}
