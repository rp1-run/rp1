import { ArrowLeft, ChevronRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArtifactList } from "@/components/v2/ArtifactList";
import { EventStream } from "@/components/v2/EventStream";
import { StatusBadge } from "@/components/v2/StatusBadge";
import { StepTimeline } from "@/components/v2/StepTimeline";
import { useRunDetail } from "@/hooks/useRunDetail";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/runs";

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

export function RunDetailPage() {
	const { runId } = useParams();
	const navigate = useNavigate();
	const { run, isLoading, error, refetch } = useRunDetail(runId);

	const handleKeyDown = useCallback(
		(event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (!isTextInput && (event.key === "h" || event.key === "ArrowLeft")) {
				event.preventDefault();
				navigate("/v2/runs");
			}
		},
		[navigate],
	);

	useEffect(() => {
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [handleKeyDown]);

	const handleArtifactClick = (artifact: Artifact) => {
		navigate(`/v2/runs/${runId}/artifacts/${artifact.path}`);
	};

	if (isLoading) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-8 w-48 rounded bg-muted" />
				<div className="h-24 rounded-lg bg-muted" />
				<div className="h-16 rounded-lg bg-muted" />
				<div className="grid grid-cols-2 gap-6">
					<div className="h-64 rounded-lg bg-muted" />
					<div className="h-64 rounded-lg bg-muted" />
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
						onClick={() => navigate("/v2/runs")}
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
					onClick={() => navigate("/v2/runs")}
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
					to="/v2/projects"
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
				<div className="flex flex-wrap items-start justify-between gap-4">
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

					<button
						type="button"
						onClick={refetch}
						className={cn(
							"inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-muted/50 transition-colors",
							isActive && "text-muted-foreground",
						)}
						title="Refresh"
					>
						<RefreshCw className={cn("h-4 w-4", isActive && "animate-spin")} />
						{isActive ? "Live" : "Refresh"}
					</button>
				</div>
			</header>

			{run.steps.length > 0 && (
				<section className="rounded-lg border border-border bg-card p-6">
					<h2 className="sr-only">Workflow Progress</h2>
					<StepTimeline steps={run.steps} orientation="horizontal" />
				</section>
			)}

			<div className="grid gap-6 lg:grid-cols-2">
				<section className="rounded-lg border border-border bg-card p-4">
					<h2 className="mb-4 font-medium text-foreground">Artifacts</h2>
					<ArtifactList
						artifacts={run.artifacts}
						onArtifactClick={handleArtifactClick}
					/>
				</section>

				<section>
					<EventStream events={run.events} defaultExpanded={false} />
				</section>
			</div>

			<p className="text-xs text-muted-foreground">
				Press <kbd className="rounded bg-muted px-1.5 py-0.5">h</kbd> or{" "}
				<kbd className="rounded bg-muted px-1.5 py-0.5">←</kbd> to return to
				runs list
			</p>
		</div>
	);
}
