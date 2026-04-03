import { AnimatePresence, motion } from "framer-motion";
import { Activity, SlidersHorizontal, SquareKanban, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FilterBar } from "@/components/v2/FilterBar";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import type { FeedItem, NotificationFeedItem } from "@/hooks/useFeed";
import { useFeed } from "@/hooks/useFeed";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { resolveRunDisplayName } from "@/lib/run-display";
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
	if (status === "waiting") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-accent-amber"
				aria-label="Waiting"
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
	const isWaiting = run.status === "waiting";
	const latestEventAt = run.lastEventAt ?? run.startedAt;

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
				isWaiting && "bg-accent-ghost",
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

			{isWaiting && (
				<span className="shrink-0 type-caption text-accent-amber">waiting</span>
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
				<SquareKanban className="h-3 w-3" strokeWidth={1.5} />
				{run.projectName}
			</button>

			<span className="w-5 shrink-0" aria-hidden="true" />
		</motion.div>
	);
}

function NotificationFeedEntry({
	item,
	onClick,
	onDismiss,
	onProjectClick,
	reducedMotion,
}: {
	item: NotificationFeedItem;
	onClick: () => void;
	onDismiss: (id: number) => void;
	onProjectClick: (projectId: string) => void;
	reducedMotion: boolean;
}) {
	const notification = item.notification;
	const hasRoute = !!notification.route;

	return (
		<motion.div
			role={hasRoute ? "button" : undefined}
			tabIndex={hasRoute ? 0 : undefined}
			onClick={hasRoute ? onClick : undefined}
			onKeyDown={
				hasRoute
					? (e) => {
							if (e.key === "Enter" || e.key === " ") {
								e.preventDefault();
								onClick();
							}
						}
					: undefined
			}
			variants={reducedMotion ? feedItemVariantsReduced : feedItemVariants}
			transition={reducedMotion ? { duration: 0 } : feedItemTransition}
			className={cn(
				"group flex w-full items-center gap-3 px-3 py-2.5 text-left rounded-[var(--radius)]",
				"transition-colors duration-150",
				hasRoute && "hover:bg-surface cursor-pointer",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
			)}
		>
			<span
				className="inline-block w-[6px] shrink-0 text-fg-ghost/50 leading-none"
				style={{ fontSize: "8px" }}
				aria-hidden="true"
			>
				▲
			</span>

			<span className="w-[5.5em] shrink-0 text-right type-secondary tabular-nums text-fg-ghost">
				{formatRelativeTime(notification.createdAt)}
			</span>

			<span className="inline-flex w-[14px] shrink-0 items-center justify-center">
				{notification.harness ? (
					<HarnessIcon harness={notification.harness} size={14} />
				) : (
					<span className="inline-block w-[14px]" />
				)}
			</span>

			{notification.runCommand && (
				<span className="shrink-0 type-body font-medium text-fg">
					{notification.runCommand}
				</span>
			)}

			<span
				className={cn(
					"truncate type-secondary",
					hasRoute ? "text-fg-muted" : "text-fg-ghost",
				)}
			>
				{notification.message}
			</span>

			{notification.projectName && notification.projectId && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onProjectClick(notification.projectId!);
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter" || e.key === " ") {
							e.stopPropagation();
							onProjectClick(notification.projectId!);
						}
					}}
					className="ml-auto shrink-0 flex items-center gap-1 pl-4 type-secondary italic text-fg-ghost hover:text-fg-muted transition-colors duration-150 cursor-pointer bg-transparent border-none p-0"
					aria-label={`Open project ${notification.projectName}`}
				>
					<SquareKanban className="h-3 w-3" strokeWidth={1.5} />
					{notification.projectName}
				</button>
			)}

			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onDismiss(notification.id);
				}}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.stopPropagation();
						onDismiss(notification.id);
					}
				}}
				className={cn(
					"shrink-0 inline-flex items-center justify-center",
					"h-5 w-5 rounded transition-colors duration-150",
					"text-fg-ghost/0 group-hover:text-fg-ghost",
					"hover:!text-fg-muted hover:bg-surface/50",
					"bg-transparent border-none p-0 cursor-pointer",
					"focus-visible:text-fg-ghost focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
					!notification.projectName && "ml-auto",
				)}
				aria-label="Dismiss notification"
			>
				<X className="h-3 w-3" strokeWidth={1.5} />
			</button>
		</motion.div>
	);
}

export function HomePage() {
	const navigate = useNavigate();
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

	const { items, total, isLoading, refetch } = useFeed({
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
			navigate(`/runs/${runId}`);
		},
		[navigate],
	);

	const handleProjectClick = useCallback(
		(projectId: string) => {
			navigate(`/projects/${projectId}`);
		},
		[navigate],
	);

	const handleNotificationClick = useCallback(
		(route: string) => {
			navigate(route);
		},
		[navigate],
	);

	const handleDismiss = useCallback(
		async (id: number) => {
			try {
				const response = await fetch(`/api/v2/notifications/${id}/dismiss`, {
					method: "POST",
				});
				if (response.ok) {
					refetch();
				}
			} catch {}
		},
		[refetch],
	);

	const renderFeedItem = useCallback(
		(item: FeedItem) => {
			if (item.type === "run" && item.run) {
				return (
					<FeedEntry
						key={`run-${item.id}`}
						run={item.run}
						onClick={() => handleRunClick(item.id as string)}
						onProjectClick={handleProjectClick}
						reducedMotion={reducedMotion}
					/>
				);
			}
			if (item.type === "notification" && item.notification) {
				return (
					<NotificationFeedEntry
						key={`notif-${item.id}`}
						item={item as NotificationFeedItem}
						onClick={() => {
							const route = (item as NotificationFeedItem).notification.route;
							if (route) handleNotificationClick(route);
						}}
						onDismiss={handleDismiss}
						onProjectClick={handleProjectClick}
						reducedMotion={reducedMotion}
					/>
				);
			}
			return null;
		},
		[
			handleRunClick,
			handleProjectClick,
			handleNotificationClick,
			handleDismiss,
			reducedMotion,
		],
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
