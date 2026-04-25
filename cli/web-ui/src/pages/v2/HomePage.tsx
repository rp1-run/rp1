import { AnimatePresence, motion } from "framer-motion";
import { Activity, NotebookTabs, SlidersHorizontal } from "lucide-react";
import { useCallback, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FilterBar } from "@/components/v2/FilterBar";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import type { FeedItem } from "@/hooks/useFeed";
import { useFeed } from "@/hooks/useFeed";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
import { resolveRunDisplayName } from "@/lib/run-display";
import { getRunStatusLabel, getStatusLabel } from "@/lib/status-labels";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run, RunsFilter } from "@/types/runs";

const PAGE_SIZE = 25;

function StatusDot({ status }: { status: Run["status"] }) {
	if (status === "running") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-accent-amber animate-status-pulse"
				aria-label="Running"
			/>
		);
	}
	if (status === "failed") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-failure"
				aria-label="Failed"
			/>
		);
	}
	if (status === "abandoned") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-failure"
				aria-label="Abandoned"
			/>
		);
	}
	if (status === "waiting") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-accent-amber"
				aria-label="Waiting"
			/>
		);
	}
	if (status === "completed") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-status-completed"
				aria-label="Completed"
			/>
		);
	}
	if (status === "inactive" || status === "cancelled") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-muted-foreground"
				aria-label={getStatusLabel(status)}
			/>
		);
	}
	return (
		<span
			role="img"
			className="inline-block h-[6px] w-[6px] rounded-full bg-fg-ghost"
			aria-label={status}
		/>
	);
}

const feedItemVariants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
};

const feedItemTransition = {
	duration: 0.2,
	ease: [0.25, 0.1, 0.25, 1.0],
};

const feedItemVariantsReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
};

function FeedEntry({
	run,
	onClick,
	onProjectClick,
	reducedMotion,
}: {
	run: Run;
	onClick: () => void;
	onProjectClick: (projectId: string) => void;
	reducedMotion: boolean;
}) {
	const latestEventAt = run.lastEventAt ?? run.startedAt;
	const displayStatusLabel = getRunStatusLabel(run);
	const statusLabel =
		run.status === "running" && displayStatusLabel === getStatusLabel("running")
			? null
			: displayStatusLabel.toLowerCase();
	const statusToneClass =
		run.status === "waiting"
			? "text-accent-amber"
			: run.status === "failed" || run.status === "abandoned"
				? "text-failure"
				: run.status === "completed"
					? "text-status-completed"
					: "text-fg-ghost";

	return (
		<motion.div
			role="button"
			tabIndex={0}
			onClick={onClick}
			onKeyDown={(e) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onClick();
				}
			}}
			variants={reducedMotion ? feedItemVariantsReduced : feedItemVariants}
			transition={reducedMotion ? { duration: 0 } : feedItemTransition}
			className={cn(
				"flex w-full items-center gap-3 px-3 py-2.5 text-left rounded-[var(--radius)]",
				"transition-colors duration-150",
				"hover:bg-surface",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
				run.status === "waiting" && "bg-accent-ghost",
			)}
		>
			<StatusDot status={run.status} />

			<span className="w-[5.5em] shrink-0 text-right type-secondary tabular-nums text-fg-ghost">
				{formatRelativeTime(latestEventAt)}
			</span>

			<span className="inline-flex w-[14px] shrink-0 items-center justify-center">
				<HarnessIcon harness={run.harness} size={14} />
			</span>

			<span className="shrink-0 type-body font-medium text-fg">
				{run.command}
			</span>

			<span className="truncate type-secondary text-fg-muted">
				{resolveRunDisplayName(run) || run.command}
			</span>

			{statusLabel && (
				<span className={cn("shrink-0 type-caption", statusToneClass)}>
					{statusLabel}
				</span>
			)}

			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onProjectClick(run.projectId);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.stopPropagation();
						onProjectClick(run.projectId);
					}
				}}
				className="ml-auto shrink-0 flex items-center gap-1 pl-4 type-secondary italic text-fg-ghost hover:text-fg-muted transition-colors duration-150 cursor-pointer bg-transparent border-none p-0"
				aria-label={`Open project ${run.projectName}`}
			>
				<NotebookTabs className="h-3 w-3" strokeWidth={1.5} />
				{run.projectName}
			</button>

			<span className="w-5 shrink-0" aria-hidden="true" />
		</motion.div>
	);
}

export function HomePage() {
	const { openWorkspace } = useWorkspaceTabs();
	const [searchParams, setSearchParams] = useSearchParams();
	const reducedMotion = usePrefersReducedMotion();

	const initialProjectId = searchParams.get("projectId");
	const [showFilters, setShowFilters] = useState(!!initialProjectId);
	const [filters, setFilters] = useState<RunsFilter>({
		status: "all",
		projectId: initialProjectId,
		dateRange: "all",
	});
	const [pageSize, setPageSize] = useState(PAGE_SIZE);

	const { items, total, isLoading } = useFeed({
		...filters,
		limit: pageSize,
	});

	const hasMore = items.length < total;

	const handleFiltersChange = useCallback(
		(newFilters: RunsFilter) => {
			setFilters(newFilters);
			setPageSize(PAGE_SIZE);
			setSearchParams(
				(prev) => {
					if (newFilters.projectId) {
						prev.set("projectId", newFilters.projectId);
					} else {
						prev.delete("projectId");
					}
					return prev;
				},
				{ replace: true },
			);
		},
		[setSearchParams],
	);

	const handleLoadEarlier = useCallback(() => {
		setPageSize((prev) => prev + PAGE_SIZE);
	}, []);

	const handleRunClick = useCallback(
		(runId: string) => {
			openWorkspace(`/runs/${runId}`);
		},
		[openWorkspace],
	);

	const handleProjectClick = useCallback(
		(projectId: string) => {
			openWorkspace(`/projects/${projectId}`);
		},
		[openWorkspace],
	);

	const renderFeedItem = useCallback(
		(item: FeedItem) => {
			return (
				<FeedEntry
					key={`run-${item.id}`}
					run={item.run}
					onClick={() => handleRunClick(item.id)}
					onProjectClick={handleProjectClick}
					reducedMotion={reducedMotion}
				/>
			);
		},
		[handleRunClick, handleProjectClick, reducedMotion],
	);

	return (
		<div className="h-full overflow-y-auto px-4 py-6 md:px-6">
			<div className="mx-auto max-w-[640px]">
				<header className="mb-6 px-3 flex items-center justify-between">
					<h1 className="flex items-center gap-2 type-title text-fg">
						<Activity className="h-4 w-4" strokeWidth={1.5} />
						Activity
					</h1>
					<button
						type="button"
						onClick={() => setShowFilters((prev) => !prev)}
						className={cn(
							"flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
							showFilters
								? "text-fg bg-surface"
								: "text-fg-ghost hover:text-fg-muted",
						)}
						aria-label={showFilters ? "Hide filters" : "Show filters"}
						aria-expanded={showFilters}
					>
						<SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</header>

				{showFilters && (
					<div className="mb-4 px-3">
						<FilterBar
							filters={filters}
							onFiltersChange={handleFiltersChange}
						/>
					</div>
				)}

				{isLoading && items.length === 0 ? (
					<div className="flex items-center justify-center py-16">
						<span className="type-body text-fg-ghost">Loading...</span>
					</div>
				) : items.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Activity
							className="h-5 w-5 text-fg-ghost mb-4"
							strokeWidth={1.5}
						/>
						<p className="type-body text-fg-ghost mb-1">No activity yet.</p>
						<p className="type-secondary text-fg-ghost mb-4">
							Runs will appear here once you start your first workflow.
						</p>
						<a
							href="https://rp1.run/getting-started/first-workflow/"
							target="_blank"
							rel="noopener noreferrer"
							className="type-secondary text-fg-muted transition-colors duration-150 hover:text-fg underline underline-offset-2"
						>
							Get started with your first workflow
						</a>
					</div>
				) : (
					<>
						<AnimatePresence initial={false}>
							<motion.div
								className="flex flex-col"
								initial="initial"
								animate="animate"
							>
								{items.map(renderFeedItem)}
							</motion.div>
						</AnimatePresence>

						{hasMore && (
							<div className="flex justify-center py-4">
								<button
									type="button"
									onClick={handleLoadEarlier}
									className="type-secondary text-fg-ghost hover:text-fg-muted transition-colors duration-150"
								>
									Earlier
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
