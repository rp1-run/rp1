import { AlertCircle, ChevronRight, FolderOpen } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { RunCard } from "@/components/v2/RunCard";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useReconnectRecovery } from "@/hooks/useReconnectRecovery";
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
			<div className="animate-pulse py-4">
				<div className="h-4 w-48 rounded bg-surface-void" />
				<div className="mt-2 h-3 w-72 rounded bg-surface-void" />
			</div>
			<div className="divide-y divide-border">
				{["skeleton-run-a", "skeleton-run-b", "skeleton-run-c"].map((key) => (
					<div key={key} className="flex items-center gap-3 py-3 animate-pulse">
						<div className="h-2 w-2 rounded-full bg-fg-ghost" />
						<div className="h-4 w-40 rounded bg-surface-void" />
						<div className="ml-auto h-3 w-16 rounded bg-surface-void" />
					</div>
				))}
			</div>
		</div>
	);
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center px-8 py-16">
			<AlertCircle className="mb-4 h-4 w-4 text-failure" strokeWidth={1.5} />
			<p className="mb-2 type-body text-fg">Failed to load project</p>
			<p className="mb-4 text-center type-secondary text-fg-muted">
				{error.message}
			</p>
			<button
				type="button"
				onClick={onRetry}
				className="type-body text-fg-muted transition-colors duration-150 hover:text-fg"
			>
				Try again
			</button>
		</div>
	);
}

function NotFoundState() {
	return (
		<div className="flex flex-col items-center justify-center px-8 py-16">
			<p className="mb-4 type-body text-fg">Project not found</p>
			<p className="mb-4 text-center type-secondary text-fg-muted">
				The project you are looking for does not exist or has been removed.
			</p>
			<Link
				to="/projects"
				className="type-body text-fg-muted transition-colors duration-150 hover:text-fg"
			>
				Back to projects
			</Link>
		</div>
	);
}

function Breadcrumb({ projectName }: { projectName: string | null }) {
	return (
		<nav aria-label="Breadcrumb" className="type-secondary text-fg-ghost">
			<ol className="flex items-center">
				<li>
					<Link
						to="/projects"
						className="transition-colors duration-150 hover:text-fg"
					>
						Projects
					</Link>
				</li>
				<li className="mx-1" aria-hidden="true">
					/
				</li>
				<li className="text-fg">{projectName ?? "..."}</li>
			</ol>
		</nav>
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
	const { setProject: setBreadcrumbProject } = useBreadcrumbContext();

	useEffect(() => {
		if (project && projectId) {
			setBreadcrumbProject(projectId, project.name);
		}
		return () => setBreadcrumbProject(null, null);
	}, [projectId, project?.name, setBreadcrumbProject, project]);

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

	useReconnectRecovery(fetchData);

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

	if (isLoading) {
		return (
			<div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
				<Breadcrumb projectName={null} />
				<LoadingSkeleton />
			</div>
		);
	}

	if (error) {
		return (
			<div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
				<Breadcrumb projectName={null} />
				<ErrorState error={error} onRetry={fetchData} />
			</div>
		);
	}

	if (notFound || !project) {
		return (
			<div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
				<Breadcrumb projectName={null} />
				<NotFoundState />
			</div>
		);
	}

	const lastActivity = project.lastActivityAt
		? formatRelativeTime(project.lastActivityAt)
		: "No activity";

	return (
		<div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
			<Breadcrumb projectName={project.name} />

			<header className="flex items-center justify-between">
				<div>
					<h1 className="type-title text-fg">{project.name}</h1>
					<p className="mt-1 type-secondary text-fg-muted" title={project.path}>
						{project.path}
					</p>
				</div>

				<Link
					to={`/projects/${projectId}/files`}
					className="text-fg-ghost transition-colors duration-150 hover:text-fg"
					aria-label="Browse files"
				>
					<FolderOpen className="h-4 w-4" strokeWidth={1.5} />
				</Link>
			</header>

			<div className="flex items-center gap-3 type-secondary text-fg-muted">
				<span
					className={cn(
						"type-caption",
						project.available ? "text-fg-ghost" : "text-failure",
					)}
				>
					{project.available ? "Available" : "Unavailable"}
				</span>
				<span className="tabular-nums">
					{project.runCount} run{project.runCount === 1 ? "" : "s"}
				</span>
				<span>{lastActivity}</span>
			</div>

			<div className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="type-body font-medium text-fg">Recent Runs</h2>
					{runs.length > 0 && (
						<Link
							to={`/?projectId=${projectId}`}
							className="flex items-center gap-1 type-secondary text-fg-ghost transition-colors duration-150 hover:text-fg"
						>
							View all runs
							<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
						</Link>
					)}
				</div>

				{runs.length === 0 ? (
					<p className="py-12 text-center text-fg-ghost">
						No runs recorded for this project yet.
					</p>
				) : (
					// biome-ignore lint/a11y/useSemanticElements: div with role="list" used for custom divide-y styling incompatible with ul/li
					<div
						className="divide-y divide-border"
						role="list"
						aria-label="Recent runs"
					>
						{runs.map((run, index) => (
							<RunCard
								key={run.id}
								run={run}
								onClick={() => handleRunClick(run)}
								selected={selectedIndex === index}
								showProject={false}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
