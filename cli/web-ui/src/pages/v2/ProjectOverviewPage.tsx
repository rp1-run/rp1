import {
	AlertCircle,
	ChevronRight,
	FolderOpen,
	Play,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { KeyHints, NAV_HINTS } from "@/components/v2/KeyHints";
import { RunCard } from "@/components/v2/RunCard";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { V2Project } from "@/types/projects";
import type { Run } from "@/types/runs";

interface ProjectDetailResponse extends V2Project {}

interface RunsResponse {
	runs: Run[];
	total: number;
}

function LoadingSkeleton() {
	return (
		<div className="space-y-6">
			<div className="animate-pulse rounded-lg border border-border p-6">
				<div className="h-6 w-48 rounded bg-muted" />
				<div className="mt-2 h-4 w-72 rounded bg-muted" />
			</div>
			<div className="space-y-3">
				{["skeleton-run-a", "skeleton-run-b", "skeleton-run-c"].map((key) => (
					<div
						key={key}
						className="animate-pulse rounded-lg border border-border py-3 px-3"
					>
						<div className="flex items-center gap-3">
							<div className="h-5 w-5 rounded-full bg-muted" />
							<div className="h-5 w-40 rounded bg-muted" />
							<div className="ml-auto h-5 w-16 rounded bg-muted" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-status-failed/30 bg-status-failed/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-status-failed/20 p-4">
				<AlertCircle className="h-8 w-8 text-status-failed" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				Failed to load project
			</h2>
			<p className="mb-4 text-center text-sm text-muted-foreground">
				{error.message}
			</p>
			<button
				type="button"
				onClick={onRetry}
				className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
			>
				<RefreshCw className="h-4 w-4" />
				Try again
			</button>
		</div>
	);
}

function NotFoundState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-muted/50 p-4">
				<AlertCircle className="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				Project not found
			</h2>
			<p className="mb-4 text-center text-sm text-muted-foreground">
				The project you are looking for does not exist or has been removed.
			</p>
			<Link
				to="/projects"
				className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
			>
				Back to projects
			</Link>
		</div>
	);
}

export function ProjectOverviewPage() {
	const { projectId } = useParams<{ projectId: string }>();
	const navigate = useNavigate();

	const [project, setProject] = useState<V2Project | null>(null);
	const [runs, setRuns] = useState<Run[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const fetchData = useCallback(async () => {
		if (!projectId) return;

		try {
			setIsLoading(true);
			setError(null);
			setNotFound(false);

			const [projectRes, runsRes] = await Promise.all([
				fetch(`/api/v2/projects/${projectId}`),
				fetch(`/api/v2/runs?projectId=${projectId}&limit=5`),
			]);

			if (projectRes.status === 404) {
				setNotFound(true);
				return;
			}

			if (!projectRes.ok) {
				throw new Error(`Failed to fetch project: ${projectRes.statusText}`);
			}

			const projectData = (await projectRes.json()) as ProjectDetailResponse;
			setProject(projectData);

			if (runsRes.ok) {
				const runsData = (await runsRes.json()) as RunsResponse;
				setRuns(runsData.runs);
			}
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchData();
	}, [fetchData]);

	const handleRunClick = useCallback(
		(run: Run) => {
			navigate(`/runs/${run.id}`);
		},
		[navigate],
	);

	const handleDrillOut = useCallback(() => {
		navigate("/projects");
	}, [navigate]);

	useEffect(() => {
		if (runs.length === 0) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.body.dataset.chordPending) return;

			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			switch (event.key) {
				case "j":
				case "ArrowDown":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? 0 : Math.min(prev + 1, runs.length - 1),
					);
					break;
				case "k":
				case "ArrowUp":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? runs.length - 1 : Math.max(prev - 1, 0),
					);
					break;
				case "l":
				case "ArrowRight":
				case "Enter":
					if (selectedIndex !== null && runs[selectedIndex]) {
						event.preventDefault();
						handleRunClick(runs[selectedIndex]);
					}
					break;
				case "h":
				case "ArrowLeft":
					event.preventDefault();
					handleDrillOut();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [runs, selectedIndex, handleRunClick, handleDrillOut]);

	const refetch = useCallback(() => {
		fetchData();
	}, [fetchData]);

	if (isLoading) {
		return (
			<div className="space-y-6">
				<Breadcrumb projectName={null} />
				<LoadingSkeleton />
			</div>
		);
	}

	if (error) {
		return (
			<div className="space-y-6">
				<Breadcrumb projectName={null} />
				<ErrorState error={error} onRetry={refetch} />
			</div>
		);
	}

	if (notFound || !project) {
		return (
			<div className="space-y-6">
				<Breadcrumb projectName={null} />
				<NotFoundState />
			</div>
		);
	}

	const lastActivity = project.lastActivityAt
		? formatRelativeTime(project.lastActivityAt)
		: "No activity";

	return (
		<div className="space-y-6">
			<Breadcrumb projectName={project.name} />

			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">
						{project.name}
					</h1>
					<p
						className="mt-1 text-sm text-muted-foreground"
						title={project.path}
					>
						{project.path}
					</p>
				</div>

				<div className="flex items-center gap-2">
					<Link
						to={`/projects/${projectId}/files`}
						className={cn(
							"inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
					>
						<FolderOpen className="h-4 w-4" aria-hidden="true" />
						<span className="sr-only sm:not-sr-only">Browse Files</span>
					</Link>
					<button
						type="button"
						onClick={refetch}
						disabled={isLoading}
						className={cn(
							"inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2 font-mono text-sm transition-colors",
							"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							"disabled:cursor-not-allowed disabled:opacity-50",
						)}
						aria-label="Refresh project"
					>
						<span className="text-terminal-green" aria-hidden="true">
							$
						</span>
						<span>refresh</span>
						{isLoading && (
							<RefreshCw
								className="h-3.5 w-3.5 animate-spin"
								aria-hidden="true"
							/>
						)}
					</button>
				</div>
			</header>

			<div className="flex items-center gap-3 text-sm text-muted-foreground">
				<span
					className={cn(
						"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
						project.available
							? "bg-status-completed/15 text-status-completed"
							: "bg-status-failed/15 text-status-failed",
					)}
				>
					{project.available ? "Available" : "Unavailable"}
				</span>
				<span>
					{project.runCount} run{project.runCount === 1 ? "" : "s"}
				</span>
				<span aria-hidden="true" className="text-border">
					|
				</span>
				<span>{lastActivity}</span>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-medium text-foreground">Recent Runs</h2>
					{runs.length > 0 && (
						<Link
							to={`/projects/${projectId}/runs`}
							className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
						>
							View all runs
							<ChevronRight className="h-4 w-4" />
						</Link>
					)}
				</div>

				{runs.length === 0 ? (
					<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/10 px-8 py-12">
						<div className="mb-3 rounded-full bg-muted/50 p-3">
							<Play className="h-6 w-6 text-muted-foreground" />
						</div>
						<p className="text-sm text-muted-foreground">
							No runs recorded for this project yet.
						</p>
					</div>
				) : (
					// biome-ignore lint/a11y/useSemanticElements: div with role="list" used for custom divide-y styling incompatible with ul/li
					<div
						className="rounded-lg border border-border divide-y divide-border/50"
						role="list"
						aria-label="Recent runs"
					>
						{runs.map((run, index) => (
							<RunCard
								key={run.id}
								run={run}
								onClick={() => handleRunClick(run)}
								selected={selectedIndex === index}
							/>
						))}
					</div>
				)}
			</div>

			<KeyHints hints={NAV_HINTS} />
		</div>
	);
}

function Breadcrumb({ projectName }: { projectName: string | null }) {
	return (
		<nav aria-label="Breadcrumb" className="text-sm text-muted-foreground">
			<ol className="flex items-center gap-1.5">
				<li>
					<Link
						to="/projects"
						className="transition-colors hover:text-foreground"
					>
						Projects
					</Link>
				</li>
				<li aria-hidden="true">
					<ChevronRight className="h-3.5 w-3.5" />
				</li>
				<li className="text-foreground font-medium">{projectName ?? "..."}</li>
			</ol>
		</nav>
	);
}
