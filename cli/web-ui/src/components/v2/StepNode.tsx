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
	MessageCircle,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { StepNodeData } from "@/lib/workflow-converter";
import type { Artifact, ArtifactType, StepStatus } from "@/types/runs";
import { StatusBadge } from "./StatusBadge";

export const AnnotationCountsContext = createContext<
	Readonly<Record<string, number>>
>({});

type StepNodeType = Node<StepNodeData, "stepNode">;

export const statusStyles: Record<
	StepStatus,
	{ border: string; bg: string; animation?: string }
> = {
	not_started: {
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
	waiting: {
		border: "border-solid border-status-waiting",
		bg: "bg-status-waiting/10",
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

const artifactTypeStyles: Record<
	ArtifactType,
	{ bg: string; hover: string; icon: string }
> = {
	markdown: {
		bg: "bg-blue-500/10 dark:bg-blue-400/20",
		hover: "hover:bg-blue-500/20 dark:hover:bg-blue-400/30",
		icon: "text-blue-600 dark:text-blue-400",
	},
	code: {
		bg: "bg-emerald-500/10 dark:bg-emerald-400/20",
		hover: "hover:bg-emerald-500/20 dark:hover:bg-emerald-400/30",
		icon: "text-emerald-600 dark:text-emerald-400",
	},
	diff: {
		bg: "bg-amber-500/10 dark:bg-amber-400/20",
		hover: "hover:bg-amber-500/20 dark:hover:bg-amber-400/30",
		icon: "text-amber-600 dark:text-amber-400",
	},
	report: {
		bg: "bg-violet-500/10 dark:bg-violet-400/20",
		hover: "hover:bg-violet-500/20 dark:hover:bg-violet-400/30",
		icon: "text-violet-600 dark:text-violet-400",
	},
	diagram: {
		bg: "bg-cyan-500/10 dark:bg-cyan-400/20",
		hover: "hover:bg-cyan-500/20 dark:hover:bg-cyan-400/30",
		icon: "text-cyan-600 dark:text-cyan-400",
	},
	other: {
		bg: "bg-muted/50",
		hover: "hover:bg-muted/70",
		icon: "text-muted-foreground",
	},
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
	const annotationCounts = useContext(AnnotationCountsContext);
	const Icon = artifactIconMap[artifact.type] || File;
	const typeStyle =
		artifactTypeStyles[artifact.type] || artifactTypeStyles.other;
	const annotationCount = artifact.docId
		? (annotationCounts[artifact.docId] ?? 0)
		: 0;

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
				"flex min-h-[24px] w-full items-center gap-1.5 rounded-md px-2 py-0.5 text-left text-xs text-muted-foreground transition-colors",
				typeStyle.bg,
				typeStyle.hover,
			)}
			title={artifact.path}
		>
			<Icon
				className={cn("h-3 w-3 shrink-0", typeStyle.icon)}
				aria-hidden="true"
			/>
			<span className="min-w-0 truncate">
				{getArtifactFilename(artifact.path)}
			</span>
			{annotationCount > 0 && (
				<span
					className="ml-auto inline-flex items-center gap-0.5 text-accent-foreground"
					aria-label={`${annotationCount} annotation${annotationCount !== 1 ? "s" : ""}`}
				>
					<MessageCircle className="h-3 w-3" aria-hidden="true" />
					<span className="tabular-nums">{annotationCount}</span>
				</span>
			)}
			{annotationCount === 0 && artifact.isNew && (
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
	const hasArtifacts =
		data.artifacts.length > 0 && data.status !== "not_started";
	const showInlineArtifacts = hasArtifacts && data.artifacts.length <= 5;
	const showArtifactChip = hasArtifacts && data.artifacts.length > 5;

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
				className="!bg-transparent !border-0 !w-px !h-px"
			/>
			<div
				className={cn(
					"h-full w-full rounded-lg border px-4 py-3 transition-colors duration-300",
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
				<div className="flex items-center justify-between gap-2">
					<span className="truncate text-[15px] font-semibold tracking-tight text-foreground capitalize">
						{data.label || data.stepId}
					</span>
					<StatusBadge status={data.status} size="sm" showLabel={false} />
				</div>

				{(showDuration || showTaskProgress) && (
					<div className="mt-2 flex items-center gap-3 text-[13px] text-muted-foreground">
						{showDuration && (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<Clock className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
								{data.startedAt &&
									formatDuration(data.startedAt, data.completedAt)}
							</span>
						)}
						{showTaskProgress && (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<ListChecks
									className="h-3.5 w-3.5 opacity-60"
									aria-hidden="true"
								/>
								{data.completedTaskCount} / {data.taskCount}
							</span>
						)}
						{showArtifactChip && (
							<span className="ml-auto">
								<ArtifactChip artifacts={data.artifacts} runId={runId} />
							</span>
						)}
					</div>
				)}

				{showInlineArtifacts && (
					<div className="mt-2 flex flex-col gap-1">
						{data.artifacts.map((artifact) => (
							<ArtifactBadge
								key={artifact.docId || artifact.path}
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
				className="!bg-transparent !border-0 !w-px !h-px"
			/>
		</>
	);
}
