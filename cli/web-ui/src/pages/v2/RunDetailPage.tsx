import {
	ArrowLeft,
	Calendar,
	ChevronRight,
	Clock,
	RefreshCw,
	Terminal,
} from "lucide-react";
import { useMemo, useRef } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { DETAIL_HINTS, KeyHints } from "@/components/v2/KeyHints";
import { StatusBadge } from "@/components/v2/StatusBadge";
import { WorkflowCanvas } from "@/components/v2/WorkflowCanvas";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { useRunDetail } from "@/hooks/useRunDetail";
import {
	commandToWorkflowName,
	useWorkflowSteps,
} from "@/hooks/useWorkflowSteps";
import type { Step } from "@/types/runs";

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

	const workflowName = useMemo(
		() => (run ? commandToWorkflowName(run.command) : null),
		[run],
	);
	const { workflow } = useWorkflowSteps(workflowName);

	const displaySteps = useMemo<readonly Step[]>(() => {
		return run ? run.steps : [];
	}, [run]);

	const canvasSectionRef = useRef<HTMLElement>(null);

	useContextualShortcuts({
		viewId: "run-detail",
		viewLabel: "Run Detail",
		shortcuts: [
			{
				key: "d",
				label: "Workflow State",
				description: "Focus workflow canvas",
				action: () => {
					canvasSectionRef.current?.scrollIntoView({
						behavior: "smooth",
						block: "start",
					});
					canvasSectionRef.current?.focus();
				},
			},
		],
		enabled: !!run,
	});

	if (isLoading) {
		return (
			<div className="space-y-6 animate-pulse">
				<div className="h-5 w-48 rounded bg-muted" />
				<div className="h-24 rounded-lg bg-muted" />
				<div className="h-[600px] rounded-lg bg-muted" />
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
		<div className="flex h-full flex-col gap-6 p-6">
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
				<div className="flex items-center gap-3">
					<h1 className="text-xl font-semibold text-foreground">
						{run.featureName}
					</h1>
					<StatusBadge status={run.status} size="md" />
				</div>

				<div className="mt-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
					<span className="inline-flex items-center gap-1.5">
						<Terminal className="h-3.5 w-3.5" aria-hidden="true" />
						<code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
							{run.command}
						</code>
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Calendar className="h-3.5 w-3.5" aria-hidden="true" />
						{formatStartTime(run.startedAt)}
					</span>
					<span className="inline-flex items-center gap-1.5">
						<Clock className="h-3.5 w-3.5" aria-hidden="true" />
						{isActive ? "Elapsed " : "Duration "}
						{formatDuration(run.startedAt, run.completedAt)}
					</span>
				</div>

				{run.error && (
					<p className="mt-3 text-sm text-status-failed">{run.error}</p>
				)}
			</header>

			<section
				ref={canvasSectionRef}
				className="min-h-[160px] max-h-[280px] flex-1 rounded-lg border border-border bg-card"
				tabIndex={-1}
			>
				<WorkflowCanvas
					workflow={workflow ?? null}
					steps={displaySteps}
					artifacts={run?.artifacts}
					agentSteps={run?.agentSteps}
					className="h-full w-full"
				/>
			</section>

			<KeyHints hints={DETAIL_HINTS} />
		</div>
	);
}
