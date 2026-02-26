import { motion } from "framer-motion";
import { AlertCircle, FolderOpen, RefreshCw } from "lucide-react";
import { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { KeyHints, NAV_HINTS } from "@/components/v2/KeyHints";
import { ProjectCard } from "@/components/v2/ProjectCard";
import { useKeyboardNav } from "@/hooks/useKeyboardNav";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useProjects, type V2Project } from "@/hooks/useProjects";
import {
	staggerContainer,
	staggerContainerReduced,
	staggerItem,
	staggerItemReduced,
} from "@/lib/motion-config";
import { cn } from "@/lib/utils";

const SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e", "sk-f"];

function LoadingSkeleton() {
	return (
		<div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
			{SKELETON_KEYS.map((key) => (
				<div
					key={key}
					className="animate-pulse rounded-lg border border-border p-4 space-y-3"
				>
					<div className="flex justify-between">
						<div className="h-5 w-32 rounded bg-muted" />
						<div className="h-5 w-20 rounded-full bg-muted" />
					</div>
					<div className="h-4 w-48 rounded bg-muted" />
					<div className="flex justify-between">
						<div className="h-4 w-24 rounded bg-muted" />
						<div className="flex gap-2">
							<div className="h-5 w-5 rounded bg-muted" />
							<div className="h-5 w-5 rounded bg-muted" />
						</div>
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
				Run <code className="rounded bg-muted px-1.5 py-0.5">rp1 arcade</code>{" "}
				in a project directory to register it.
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

export function ProjectsPage() {
	const navigate = useNavigate();
	const { projects, isLoading, error, refetch } = useProjects();
	const reducedMotion = usePrefersReducedMotion();

	const handleCardClick = useCallback(
		(project: V2Project) => {
			navigate(`/projects/${project.id}`);
		},
		[navigate],
	);

	const handleArtifactsClick = useCallback(
		(project: V2Project) => {
			navigate(`/projects/${project.id}/files`);
		},
		[navigate],
	);

	const handleRunsClick = useCallback(
		(project: V2Project) => {
			navigate(`/projects/${project.id}/runs`);
		},
		[navigate],
	);

	const handleDrillOut = useCallback(() => {
		navigate("/");
	}, [navigate]);

	const { selectedIndex, setSelectedIndex } = useKeyboardNav({
		items: projects,
		onSelect: handleCardClick,
		onDrillIn: handleCardClick,
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
						handleCardClick(projects[selectedIndex]);
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
		handleCardClick,
		handleDrillOut,
	]);

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
						"inline-flex items-center gap-2 rounded-md border border-border bg-muted/30 px-4 py-2 font-mono text-sm transition-colors",
						"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
					aria-label="Refresh projects"
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
			</header>

			{isLoading && projects.length === 0 ? (
				<LoadingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={refetch} />
			) : projects.length === 0 ? (
				<EmptyState />
			) : (
				<>
					{/* biome-ignore lint/a11y/useSemanticElements: div with role="list" used for grid layout incompatible with ul/li */}
					<motion.div
						className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3"
						role="list"
						aria-label="Projects"
						variants={
							reducedMotion ? staggerContainerReduced : staggerContainer
						}
						initial="initial"
						animate="animate"
					>
						{projects.map((project, index) => (
							<motion.div
								key={project.id}
								variants={reducedMotion ? staggerItemReduced : staggerItem}
							>
								<ProjectCard
									project={project}
									onCardClick={() => handleCardClick(project)}
									onArtifactsClick={() => handleArtifactsClick(project)}
									onRunsClick={() => handleRunsClick(project)}
									selected={selectedIndex === index}
								/>
							</motion.div>
						))}
					</motion.div>

					<KeyHints hints={NAV_HINTS} />
				</>
			)}
		</div>
	);
}
