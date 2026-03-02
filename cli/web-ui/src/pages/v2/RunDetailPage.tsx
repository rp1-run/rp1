import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactList } from "@/components/v2/ArtifactList";
import { EventStream } from "@/components/v2/EventStream";
import { DETAIL_HINTS, KeyHints } from "@/components/v2/KeyHints";
import { StatusBadge } from "@/components/v2/StatusBadge";
import { WorkflowDiagram } from "@/components/v2/WorkflowDiagram";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { useRunDetail } from "@/hooks/useRunDetail";
import {
	commandToWorkflowName,
	useWorkflowSteps,
} from "@/hooks/useWorkflowSteps";
import type { Artifact, Step } from "@/types/runs";

function formatDuration(startedAt: string, completedAt: string | null): string {
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

function formatStartTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const isToday = date.toDateString() === now.toDateString();

	if (isToday) {
		return `Today at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
	}

	return date.toLocaleDateString([], {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Humanize a kebab-case step ID to Title Case.
 */
function humanizeStepLabel(id: string): string {
	return id
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Merge workflow ordered steps with run step data.
 * Uses the workflow definition as the authoritative step list, filling in
 * status and timestamps from the run's step records. Steps not yet seen
 * in the run are marked as pending.
 *
 * Handles branching workflows (e.g., verify->build retry loop) correctly
 * because the workflow's orderedSteps are derived via BFS which produces
 * a linear ordering with cycles handled via visited-set.
 */
function mergeWorkflowSteps(
	workflowOrderedSteps: readonly { id: string; label: string; index: number }[],
	runSteps: readonly Step[],
): readonly Step[] {
	const runStepMap = new Map<string, Step>();
	for (const step of runSteps) {
		runStepMap.set(step.id, step);
	}

	return workflowOrderedSteps.map(({ id, label }) => {
		const runStep = runStepMap.get(id);
		if (runStep) {
			return runStep;
		}

		return {
			id,
			name: humanizeStepLabel(label),
			status: "pending" as const,
			startedAt: null,
			completedAt: null,
			taskCount: null,
			completedTaskCount: null,
		};
	});
}

export function RunDetailPage() {
	const { runId } = useParams();
	const navigate = useNavigate();
	const { run, isLoading, error, refetch } = useRunDetail(runId);
	const [selectedArtifactIndex, setSelectedArtifactIndex] = useState<
		number | null
	>(null);

	const workflowName = useMemo(
		() => (run ? commandToWorkflowName(run.command) : null),
		[run],
	);
	const { workflow } = useWorkflowSteps(workflowName);

	const displaySteps = useMemo<readonly Step[]>(() => {
		if (!run) return [];
		if (workflow && workflow.orderedSteps.length > 0) {
			return mergeWorkflowSteps(workflow.orderedSteps, run.steps);
		}
		return run.steps;
	}, [run, workflow]);

	const artifactsSectionRef = useRef<HTMLElement>(null);
	const eventStreamSectionRef = useRef<HTMLElement>(null);
	const diagramSectionRef = useRef<HTMLElement>(null);

	const handleArtifactClick = useCallback(
		(artifact: Artifact) => {
			navigate(`/runs/${runId}/artifacts/${artifact.path}`);
		},
		[navigate, runId],
	);

	useEffect(() => {
		if (!run) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.body.dataset.chordPending) return;

			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			const artifacts = run.artifacts;

			switch (event.key) {
				case "h":
				case "ArrowLeft":
					event.preventDefault();
					navigate("/runs");
					break;
				case "j":
				case "ArrowDown":
					if (artifacts.length > 0) {
						event.preventDefault();
						setSelectedArtifactIndex((prev) =>
							prev === null ? 0 : Math.min(prev + 1, artifacts.length - 1),
						);
					}
					break;
				case "k":
				case "ArrowUp":
					if (artifacts.length > 0) {
						event.preventDefault();
						setSelectedArtifactIndex((prev) =>
							prev === null ? artifacts.length - 1 : Math.max(prev - 1, 0),
						);
					}
					break;
				case "ArrowRight":
				case "Enter":
					if (
						selectedArtifactIndex !== null &&
						artifacts[selectedArtifactIndex]
					) {
						event.preventDefault();
						handleArtifactClick(artifacts[selectedArtifactIndex]);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [run, navigate, selectedArtifactIndex, handleArtifactClick]);

	useContextualShortcuts({
		viewId: "run-detail",
		viewLabel: "Run Detail",
		shortcuts: [
			{
				key: "a",
				label: "Artifacts",
				description: "Focus artifacts panel",
				action: () => {
					artifactsSectionRef.current?.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
					const firstArtifact =
						artifactsSectionRef.current?.querySelector<HTMLElement>(
							"[role='button'], a, button",
						);
					firstArtifact?.focus();
				},
			},
			{
				key: "l",
				label: "Logs",
				description: "Show logs and events",
				action: () => {
					eventStreamSectionRef.current?.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
					const trigger =
						eventStreamSectionRef.current?.querySelector<HTMLElement>(
							'button[aria-expanded="false"]',
						);
					trigger?.click();
				},
			},
			...(workflow
				? [
						{
							key: "d",
							label: "Workflow State",
							description: "Focus workflow state panel",
							action: () => {
								diagramSectionRef.current?.scrollIntoView({
									behavior: "smooth",
									block: "start",
								});
								diagramSectionRef.current?.focus();
							},
						},
					]
				: []),
		],
		enabled: !!run,
	});

	if (isLoading) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-5 w-48 rounded bg-muted" />
				<div className="h-24 rounded-lg bg-muted" />
				<div className="flex flex-col lg:grid lg:grid-cols-5 gap-6">
					<div className="lg:col-span-3 h-80 rounded-lg bg-muted" />
					<div className="lg:col-span-2 space-y-6">
						<div className="h-48 rounded-lg bg-muted" />
						<div className="h-48 rounded-lg bg-muted" />
					</div>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12">
				<p className="text-status-failed">{error.message}</p>
				<div className="flex gap-2">
					<button
						type="button"
						onClick={() => navigate("/runs")}
						className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
					>
						<ArrowLeft className="h-4 w-4" />
						Back to Runs
					</button>
					<button
						type="button"
						onClick={refetch}
						className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
					>
						<RefreshCw className="h-4 w-4" />
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!run) {
		return (
			<div className="flex flex-col items-center justify-center gap-4 py-12">
				<p className="text-muted-foreground">Run not found</p>
				<button
					type="button"
					onClick={() => navigate("/runs")}
					className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted/50 transition-colors"
				>
					<ArrowLeft className="h-4 w-4" />
					Back to Runs
				</button>
			</div>
		);
	}

	const isActive = run.status === "running" || run.status === "waiting-input";

	return (
		<div className="space-y-6">
			<nav className="flex items-center gap-2 text-sm text-muted-foreground">
				<Link
					to="/projects"
					className="hover:text-foreground transition-colors"
				>
					{run.projectName}
				</Link>
				<ChevronRight className="h-4 w-4" aria-hidden="true" />
				<span className="text-foreground">{run.featureName}</span>
				<ChevronRight className="h-4 w-4" aria-hidden="true" />
				<span className="text-foreground">Run</span>
			</nav>

			<header className="rounded-lg border border-border bg-card p-6">
				<div className="flex items-start gap-4">
					<StatusBadge status={run.status} size="lg" />

					<div>
						<h1 className="text-xl font-semibold text-foreground">
							{run.featureName}
						</h1>

						<div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
							<code className="rounded bg-muted px-2 py-0.5">
								{run.command}
							</code>
							<span aria-hidden="true">-</span>
							<span>{formatStartTime(run.startedAt)}</span>
							<span aria-hidden="true">-</span>
							<span>
								{isActive ? "Elapsed: " : "Duration: "}
								{formatDuration(run.startedAt, run.completedAt)}
							</span>
						</div>

						{run.error && (
							<p className="mt-2 text-sm text-status-failed">{run.error}</p>
						)}
					</div>
				</div>
			</header>

			{workflow ? (
				<div className="flex flex-col lg:grid lg:grid-cols-5 gap-6">
					<section
						ref={diagramSectionRef}
						className="lg:col-span-3"
						tabIndex={-1}
					>
						<WorkflowDiagram workflow={workflow} steps={displaySteps} />
					</section>

					<div className="lg:col-span-2 space-y-6">
						<section
							ref={artifactsSectionRef}
							className="rounded-lg border border-border bg-card p-4"
						>
							<h2 className="mb-4 pb-3 border-b border-border font-medium text-foreground">
								Artifacts
							</h2>
							<ArtifactList
								artifacts={run.artifacts}
								onArtifactClick={handleArtifactClick}
								selectedIndex={selectedArtifactIndex}
							/>
						</section>

						<section ref={eventStreamSectionRef}>
							<EventStream events={run.events} defaultExpanded />
						</section>
					</div>
				</div>
			) : (
				<div className="space-y-6">
					<section
						ref={artifactsSectionRef}
						className="rounded-lg border border-border bg-card p-4"
					>
						<h2 className="mb-4 pb-3 border-b border-border font-medium text-foreground">
							Artifacts
						</h2>
						<ArtifactList
							artifacts={run.artifacts}
							onArtifactClick={handleArtifactClick}
							selectedIndex={selectedArtifactIndex}
						/>
					</section>

					<section ref={eventStreamSectionRef}>
						<EventStream events={run.events} defaultExpanded />
					</section>
				</div>
			)}

			<KeyHints hints={DETAIL_HINTS} />
		</div>
	);
}
