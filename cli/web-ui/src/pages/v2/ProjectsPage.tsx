import { AlertCircle, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProjectCard } from "@/components/v2/ProjectCard";
import { useProjects, type V2Project } from "@/hooks/useProjects";
import { cn } from "@/lib/utils";

function LoadingSkeleton() {
	return (
		<div className="rounded-lg border border-border divide-y divide-border">
			{Array.from({ length: 5 }, (_, i) => (
				<div
					key={`skeleton-${i}`}
					className="animate-pulse bg-muted/20 py-3 px-3"
				>
					<div className="flex items-center justify-between gap-4">
						<div className="flex-1 space-y-2">
							<div className="h-5 w-40 rounded bg-muted" />
							<div className="h-4 w-64 rounded bg-muted" />
						</div>
						<div className="h-6 w-20 rounded-full bg-muted" />
					</div>
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-muted/50 p-4">
				<FolderOpen className="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				No projects registered
			</h2>
			<p className="text-center text-sm text-muted-foreground">
				Run <code className="rounded bg-muted px-1.5 py-0.5">rp1 view</code> in
				a project directory to register it.
			</p>
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
				Failed to load projects
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

function KeyboardHints() {
	return (
		<p className="text-center text-xs text-muted-foreground">
			<kbd className="rounded bg-muted px-1.5 py-0.5">j</kbd>/
			<kbd className="rounded bg-muted px-1.5 py-0.5">k</kbd> navigate,{" "}
			<kbd className="rounded bg-muted px-1.5 py-0.5">l</kbd> open,{" "}
			<kbd className="rounded bg-muted px-1.5 py-0.5">h</kbd> back
		</p>
	);
}

export function ProjectsPage() {
	const navigate = useNavigate();
	const { projects, isLoading, error, refetch } = useProjects();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	const handleSelectProject = useCallback(
		(project: V2Project) => {
			navigate(`/v2/projects/${project.id}/runs`);
		},
		[navigate],
	);

	const handleDrillIn = useCallback(
		(project: V2Project) => {
			navigate(`/v2/projects/${project.id}/runs`);
		},
		[navigate],
	);

	const handleDrillOut = useCallback(() => {
		navigate("/v2");
	}, [navigate]);

	useEffect(() => {
		if (projects.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			const target = e.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			switch (e.key) {
				case "j":
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex(
						selectedIndex === null
							? 0
							: Math.min(selectedIndex + 1, projects.length - 1),
					);
					break;
				case "k":
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex(
						selectedIndex === null
							? projects.length - 1
							: Math.max(selectedIndex - 1, 0),
					);
					break;
				case "l":
				case "ArrowRight":
				case "Enter":
					if (selectedIndex !== null && projects[selectedIndex]) {
						e.preventDefault();
						handleDrillIn(projects[selectedIndex]);
					}
					break;
				case "h":
				case "ArrowLeft":
					e.preventDefault();
					handleDrillOut();
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [projects, selectedIndex, handleDrillIn, handleDrillOut]);

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">Projects</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						{projects.length > 0
							? `${projects.length} registered project${projects.length === 1 ? "" : "s"}`
							: "Registered projects will appear here"}
					</p>
				</div>

				<button
					type="button"
					onClick={refetch}
					disabled={isLoading}
					className={cn(
						"inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors",
						"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
					aria-label="Refresh projects"
				>
					<RefreshCw
						className={cn("h-4 w-4", isLoading && "animate-spin")}
						aria-hidden="true"
					/>
					<span className="sr-only sm:not-sr-only">Refresh</span>
				</button>
			</header>

			{isLoading && projects.length === 0 ? (
				<LoadingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={refetch} />
			) : projects.length === 0 ? (
				<EmptyState />
			) : (
				<>
					<div
						className="rounded-lg border border-border divide-y divide-border"
						role="listbox"
						aria-label="Projects list"
					>
						{projects.map((project, index) => (
							<ProjectCard
								key={project.id}
								project={project}
								onClick={() => handleSelectProject(project)}
								selected={selectedIndex === index}
							/>
						))}
					</div>

					<KeyboardHints />
				</>
			)}
		</div>
	);
}
