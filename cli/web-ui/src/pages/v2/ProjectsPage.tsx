import { AlertCircle, FolderOpen, Play, SquareKanban } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { useProjects, type V2Project } from "@/hooks/useProjects";
import { useRuns } from "@/hooks/useRuns";
import { cn } from "@/lib/utils";

function LoadingSkeleton() {
	return (
		<div className="space-y-0 divide-y divide-border">
			{["sk-a", "sk-b", "sk-c", "sk-d"].map((key) => (
				<div key={key} className="flex items-center gap-3 py-3 animate-pulse">
					<div className="h-2 w-2 rounded-full bg-fg-ghost" />
					<div className="h-4 w-40 rounded bg-surface-void" />
					<div className="ml-auto h-3 w-16 rounded bg-surface-void" />
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<p className="py-16 text-center text-fg-ghost">
			No projects registered yet.
		</p>
	);
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center px-8 py-16">
			<AlertCircle className="mb-4 h-4 w-4 text-failure" strokeWidth={1.5} />
			<p className="mb-2 type-body text-fg">Failed to load projects</p>
			<p className="mb-4 type-secondary text-fg-muted">{error.message}</p>
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

function ActivityDot({ projectId }: { projectId: string }) {
	const { runs } = useRuns({
		status: "running",
		projectId,
		limit: 1,
		offset: 0,
		dateRange: "all",
	});

	if (runs.length === 0) return null;

	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label on decorative dot for screen readers
		<span
			className="h-2 w-2 shrink-0 rounded-full bg-fg animate-status-pulse"
			aria-label="Active runs"
		/>
	);
}

function ProjectRow({
	project,
	selected,
	onClick,
	onRunsClick,
	onFilesClick,
}: {
	project: V2Project;
	selected: boolean;
	onClick: () => void;
	onRunsClick: (e: React.MouseEvent) => void;
	onFilesClick: (e: React.MouseEvent) => void;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex w-full items-center gap-3 py-3 px-2 text-left transition-colors duration-150 rounded group",
				"hover:bg-accent-ghost",
				selected && "bg-accent-ghost",
				!project.available && "opacity-50",
			)}
		>
			<ActivityDot projectId={project.id} />
			<span className="type-body text-fg truncate">{project.name}</span>
			<span className="type-secondary text-fg-ghost truncate">
				{project.path}
			</span>
			<span className="ml-auto flex items-center gap-3 shrink-0">
				<button
					type="button"
					onClick={onRunsClick}
					className="text-fg-ghost opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:text-fg bg-transparent border-none p-0 cursor-pointer"
					aria-label={`Runs for ${project.name}`}
				>
					<Play className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					onClick={onFilesClick}
					className="text-fg-ghost opacity-0 group-hover:opacity-100 transition-opacity duration-150 hover:text-fg bg-transparent border-none p-0 cursor-pointer"
					aria-label={`Files for ${project.name}`}
				>
					<FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
				<span className="type-secondary text-fg-muted tabular-nums">
					{project.runCount} run{project.runCount === 1 ? "" : "s"}
				</span>
			</span>
		</button>
	);
}

export function ProjectsPage() {
	const navigate = useNavigate();
	const { projects, isLoading, error, refetch } = useProjects();

	const handleProjectClick = useCallback(
		(project: V2Project) => {
			navigate(`/projects/${project.id}`);
		},
		[navigate],
	);

	const handleDrillOut = useCallback(() => {
		navigate("/");
	}, [navigate]);

	const { selectedIndex, setSelectedIndex } = useKeyboardNav({
		items: projects,
		onSelect: handleProjectClick,
		onDrillIn: handleProjectClick,
		onDrillOut: handleDrillOut,
		enabled: projects.length > 0,
	});

	useEffect(() => {
		if (projects.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.body.dataset.chordPending) return;

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
						handleProjectClick(projects[selectedIndex]);
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
	}, [
		projects,
		selectedIndex,
		setSelectedIndex,
		handleProjectClick,
		handleDrillOut,
	]);

	return (
		<div className="mx-auto max-w-2xl px-6 py-8">
			<header className="mb-6">
				<h1 className="flex items-center gap-2 type-title text-fg">
					<SquareKanban className="h-4 w-4" strokeWidth={1.5} />
					Projects
				</h1>
			</header>

			{isLoading && projects.length === 0 ? (
				<LoadingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={refetch} />
			) : projects.length === 0 ? (
				<EmptyState />
			) : (
				<ul
					className="divide-y divide-border list-none m-0 p-0"
					aria-label="Projects"
				>
					{projects.map((project, index) => (
						<li key={project.id}>
							<ProjectRow
								project={project}
								selected={selectedIndex === index}
								onClick={() => handleProjectClick(project)}
								onRunsClick={(e) => {
									e.stopPropagation();
									navigate(`/projects/${project.id}/runs`);
								}}
								onFilesClick={(e) => {
									e.stopPropagation();
									navigate(`/projects/${project.id}/files`);
								}}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}
