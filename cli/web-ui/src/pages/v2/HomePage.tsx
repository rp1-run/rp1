import { AnimatePresence, motion } from "framer-motion";
import {
	Activity,
	LoaderCircle,
	Maximize2,
	Search,
	SlidersHorizontal,
	X,
} from "lucide-react";
import {
	type ReactNode,
	type Ref,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { FilterBar } from "@/components/v2/FilterBar";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import { RunDetailSurface } from "@/components/v2/RunDetailSurface";
import type { FeedItem } from "@/hooks/useFeed";
import { useFeed } from "@/hooks/useFeed";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
import { isTextInputElement } from "@/lib/keyboard";
import { resolveRunDisplayName } from "@/lib/run-display";
import {
	getRunCurrentStepLabel,
	getRunStatusLabel,
	getStatusLabel,
} from "@/lib/status-labels";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run, RunsFilter } from "@/types/runs";

const PAGE_SIZE = 25;
const ACTIVITY_NAVIGATION_KEYS = new Set(["ArrowDown", "j", "ArrowUp", "k"]);

function hasOpenDialog(): boolean {
	return Array.from(
		document.querySelectorAll<HTMLElement>('[role="dialog"]'),
	).some((dialog) => {
		if (dialog.dataset.state === "closed") return false;
		if (dialog.dataset.state === "open") return true;

		const rect = dialog.getBoundingClientRect();
		return (
			rect.width > 0 &&
			rect.height > 0 &&
			rect.right > 0 &&
			rect.bottom > 0 &&
			rect.left < window.innerWidth &&
			rect.top < window.innerHeight
		);
	});
}

function shouldIgnoreActivityNavigation(event: KeyboardEvent): boolean {
	if (event.defaultPrevented) return true;
	if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
		return true;
	}
	if (hasOpenDialog()) return true;
	if (document.body.dataset.chordPending) return true;
	return isTextInputElement(document.activeElement);
}

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
	selected,
	entryRef,
	onClick,
	reducedMotion,
}: {
	run: Run;
	selected: boolean;
	entryRef: (node: HTMLDivElement | null) => void;
	onClick: () => void;
	reducedMotion: boolean;
}) {
	const latestEventAt = run.lastEventAt ?? run.startedAt;
	const displayStatusLabel = getRunStatusLabel(run);
	const currentStepLabel = getRunCurrentStepLabel(run);
	const statusLabel =
		run.status === "running" && displayStatusLabel === getStatusLabel("running")
			? currentStepLabel?.toLowerCase()
			: displayStatusLabel.toLowerCase();
	const statusToneClass =
		run.status === "running" || run.status === "waiting"
			? "text-accent-amber"
			: run.status === "failed" || run.status === "abandoned"
				? "text-failure"
				: run.status === "completed"
					? "text-status-completed"
					: "text-fg-ghost";

	return (
		<motion.div
			ref={entryRef}
			role="button"
			tabIndex={0}
			aria-selected={selected}
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
				"group grid w-full grid-cols-[auto_3.75rem_minmax(0,1fr)_6.75rem] items-center gap-2.5 px-3 py-2.5 text-left rounded-[var(--radius)] sm:grid-cols-[auto_3.75rem_minmax(0,1fr)_7.5rem]",
				"transition-colors duration-150",
				"hover:bg-surface",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
				selected && "bg-surface ring-1 ring-border",
			)}
		>
			<StatusDot status={run.status} />

			<span className="min-w-0 text-right type-secondary tabular-nums text-fg-ghost">
				{formatRelativeTime(latestEventAt)}
			</span>

			<div className="flex min-w-0 flex-1 items-center gap-3 xl:gap-2">
				<span className="inline-flex w-[14px] shrink-0 items-center justify-center">
					<HarnessIcon harness={run.harness} size={14} />
				</span>

				<span className="shrink-0 type-body font-medium text-fg xl:min-w-0 xl:truncate">
					{run.command}
				</span>

				<span className="min-w-0 flex-1 truncate type-secondary text-fg-muted">
					{resolveRunDisplayName(run) || run.command}
				</span>

				{statusLabel && (
					<span
						className={cn(
							"max-w-[7.5rem] shrink-0 truncate type-caption",
							statusToneClass,
						)}
						title={statusLabel}
					>
						{statusLabel}
					</span>
				)}
			</div>

			<span
				className="min-w-0 truncate px-1.5 text-right type-secondary italic text-fg-ghost"
				title={run.projectName}
			>
				{run.projectName}
			</span>
		</motion.div>
	);
}

function EmptyActivityState({
	searchActive = false,
}: {
	searchActive?: boolean;
}) {
	if (searchActive) {
		return (
			<div className="flex flex-col items-center justify-center py-24 text-center xl:px-4 xl:py-16">
				<Search className="h-5 w-5 text-fg-ghost mb-4" strokeWidth={1.5} />
				<p className="type-body text-fg-ghost">No matching activity.</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col items-center justify-center py-24 text-center xl:px-4 xl:py-16">
			<Activity className="h-5 w-5 text-fg-ghost mb-4" strokeWidth={1.5} />
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
	);
}

function LoadingActivityState() {
	return (
		<output
			aria-live="polite"
			className="flex items-center justify-center gap-2 py-16"
		>
			<LoaderCircle
				className="h-4 w-4 animate-spin text-fg-ghost"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
			<span className="type-body text-fg-ghost">Loading activity...</span>
		</output>
	);
}

function NoSelectedRunState() {
	return (
		<div className="flex h-full min-h-0 items-center justify-center px-6 text-center">
			<div className="flex max-w-[280px] flex-col items-center">
				<Activity className="mb-4 h-5 w-5 text-fg-ghost" strokeWidth={1.5} />
				<p className="type-body text-fg-ghost">No run selected.</p>
			</div>
		</div>
	);
}

function SelectedRunPane({
	selectedRunId,
	onExpand,
}: {
	selectedRunId: string | null;
	onExpand: () => void;
}) {
	const [currentStepName, setCurrentStepName] = useState<{
		readonly runId: string | null;
		readonly name: string | null;
	}>({ runId: null, name: null });
	const handleCurrentStepNameChange = useCallback(
		(name: string | null) => {
			setCurrentStepName({ runId: selectedRunId, name });
		},
		[selectedRunId],
	);
	const previewTitle =
		currentStepName.runId === selectedRunId && currentStepName.name
			? `Current Step: ${currentStepName.name}`
			: "Run Preview";

	return (
		<section
			aria-label="Selected run"
			className="hidden min-h-0 min-w-0 overflow-hidden rounded-[var(--radius)] border border-border bg-surface-void xl:flex xl:flex-col"
		>
			<header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border px-4">
				<h2 className="min-w-0 truncate type-body font-medium text-fg">
					{previewTitle}
				</h2>
				<button
					type="button"
					onClick={onExpand}
					disabled={!selectedRunId}
					className="flex h-7 w-7 items-center justify-center rounded text-fg-ghost transition-colors duration-150 hover:bg-surface hover:text-fg-muted disabled:pointer-events-none disabled:opacity-40"
					aria-label="Expand selected run"
					title="Expand selected run"
				>
					<Maximize2 className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
			</header>
			<div className="min-h-0 flex-1 overflow-hidden">
				{selectedRunId ? (
					<RunDetailSurface
						key={selectedRunId}
						runId={selectedRunId}
						mode="activity-preview"
						onCurrentStepNameChange={handleCurrentStepNameChange}
					/>
				) : (
					<NoSelectedRunState />
				)}
			</div>
		</section>
	);
}

function ActivityHeader({
	showSearch,
	showFilters,
	onToggleSearch,
	onToggleFilters,
}: {
	showSearch: boolean;
	showFilters: boolean;
	onToggleSearch: () => void;
	onToggleFilters: () => void;
}) {
	return (
		<header className="mb-6 px-3 flex items-center justify-between xl:mb-4 xl:shrink-0">
			<h1 className="flex items-center gap-2 type-title text-fg">
				<Activity className="h-4 w-4" strokeWidth={1.5} />
				Activity
			</h1>
			<div className="flex items-center gap-1">
				<button
					type="button"
					onClick={onToggleSearch}
					className={cn(
						"flex h-7 w-7 items-center justify-center rounded transition-colors duration-150",
						showSearch
							? "text-fg bg-surface"
							: "text-fg-ghost hover:text-fg-muted",
					)}
					aria-label={showSearch ? "Hide search" : "Show search"}
					aria-expanded={showSearch}
				>
					<Search className="h-3.5 w-3.5" strokeWidth={1.5} />
				</button>
				<button
					type="button"
					onClick={onToggleFilters}
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
			</div>
		</header>
	);
}

function ActivitySearchBar({
	value,
	isLoading,
	inputRef,
	onChange,
	onClear,
}: {
	value: string;
	isLoading: boolean;
	inputRef: Ref<HTMLInputElement>;
	onChange: (value: string) => void;
	onClear: () => void;
}) {
	return (
		<div className="mb-4 px-3 xl:shrink-0">
			<div className="relative flex items-center">
				{isLoading ? (
					<LoaderCircle
						className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 animate-spin text-fg-ghost"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
				) : (
					<Search
						className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-fg-ghost"
						strokeWidth={1.5}
					/>
				)}
				<input
					ref={inputRef}
					type="search"
					value={value}
					aria-busy={isLoading}
					onChange={(event) => onChange(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape") {
							event.preventDefault();
							onClear();
						}
					}}
					className="h-8 w-full rounded-md border border-border bg-surface-void pl-8 pr-8 type-secondary text-fg outline-none transition-colors duration-150 placeholder:text-fg-ghost focus:border-fg-ghost [&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none"
					placeholder="Search activity"
					aria-label="Search activity"
				/>
				{value && (
					<button
						type="button"
						onClick={onClear}
						className="absolute right-1.5 flex h-5 w-5 items-center justify-center rounded text-fg-ghost transition-colors duration-150 hover:bg-surface hover:text-fg"
						aria-label="Clear search"
					>
						<X className="h-3 w-3" strokeWidth={1.5} />
					</button>
				)}
			</div>
		</div>
	);
}

function FeedList({
	items,
	hasMore,
	isLoading,
	searchActive,
	showEmptyLoadingState,
	renderFeedItem,
	onLoadEarlier,
}: {
	items: readonly FeedItem[];
	hasMore: boolean;
	isLoading: boolean;
	searchActive: boolean;
	showEmptyLoadingState: boolean;
	renderFeedItem: (item: FeedItem) => ReactNode;
	onLoadEarlier: () => void;
}) {
	if (isLoading && items.length === 0) {
		return showEmptyLoadingState ? <LoadingActivityState /> : null;
	}

	if (items.length === 0) {
		return <EmptyActivityState searchActive={searchActive} />;
	}

	return (
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
						onClick={onLoadEarlier}
						className="type-secondary text-fg-ghost hover:text-fg-muted transition-colors duration-150"
					>
						Earlier
					</button>
				</div>
			)}
		</>
	);
}

export function HomePage() {
	const { openWorkspace } = useWorkspaceTabs();
	const [searchParams, setSearchParams] = useSearchParams();
	const reducedMotion = usePrefersReducedMotion();
	const isWideActivityLayout = useMediaQuery("(min-width: 1280px)");
	const activityRowRefs = useRef(new Map<string, HTMLDivElement>());
	const searchInputRef = useRef<HTMLInputElement>(null);

	const initialProjectId = searchParams.get("projectId");
	const [showSearch, setShowSearch] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [showFilters, setShowFilters] = useState(!!initialProjectId);
	const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
	const [filters, setFilters] = useState<RunsFilter>({
		status: "all",
		projectId: initialProjectId,
		dateRange: "all",
	});
	const [pageSize, setPageSize] = useState(PAGE_SIZE);

	const { items, total, isLoading } = useFeed({
		...filters,
		limit: pageSize,
		search: searchQuery.trim() || undefined,
	});

	const hasMore = items.length < total;
	const searchActive = searchQuery.trim().length > 0;

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

	const handleToggleSearch = useCallback(() => {
		if (showSearch) {
			setSearchQuery("");
			setPageSize(PAGE_SIZE);
			setShowSearch(false);
			return;
		}
		setShowSearch(true);
	}, [showSearch]);

	const handleSearchChange = useCallback((value: string) => {
		setSearchQuery(value);
		setPageSize(PAGE_SIZE);
	}, []);

	const handleClearSearch = useCallback(() => {
		setSearchQuery("");
		setPageSize(PAGE_SIZE);
		searchInputRef.current?.focus();
	}, []);

	useEffect(() => {
		if (showSearch) {
			searchInputRef.current?.focus();
		}
	}, [showSearch]);

	useEffect(() => {
		if (!isWideActivityLayout) return;
		if (items.length === 0) {
			setSelectedRunId(null);
			return;
		}

		if (selectedRunId && items.some((item) => item.id === selectedRunId)) {
			return;
		}

		setSelectedRunId(items[0]?.id ?? null);
	}, [isWideActivityLayout, items, selectedRunId]);

	const setActivityRowRef = useCallback(
		(runId: string, node: HTMLDivElement | null) => {
			if (node) {
				activityRowRefs.current.set(runId, node);
				return;
			}
			activityRowRefs.current.delete(runId);
		},
		[],
	);

	const handleRunClick = useCallback(
		(runId: string) => {
			if (isWideActivityLayout) {
				setSelectedRunId(runId);
				return;
			}
			openWorkspace(`/runs/${runId}`);
		},
		[isWideActivityLayout, openWorkspace],
	);

	useEffect(() => {
		if (!isWideActivityLayout || items.length === 0) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (!ACTIVITY_NAVIGATION_KEYS.has(event.key)) return;
			if (shouldIgnoreActivityNavigation(event)) return;

			const direction = event.key === "ArrowDown" || event.key === "j" ? 1 : -1;
			const currentIndex = selectedRunId
				? items.findIndex((item) => item.id === selectedRunId)
				: -1;
			const nextIndex =
				currentIndex === -1
					? direction > 0
						? 0
						: items.length - 1
					: Math.min(Math.max(currentIndex + direction, 0), items.length - 1);
			const nextItem = items[nextIndex];
			if (!nextItem) return;

			event.preventDefault();
			handleRunClick(nextItem.id);
			const nextRow = activityRowRefs.current.get(nextItem.id);
			nextRow?.focus({ preventScroll: true });
			nextRow?.scrollIntoView?.({ block: "nearest" });
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [handleRunClick, isWideActivityLayout, items, selectedRunId]);

	const handleExpandSelectedRun = useCallback(() => {
		if (!selectedRunId) return;
		openWorkspace(`/runs/${selectedRunId}`);
	}, [openWorkspace, selectedRunId]);

	const renderFeedItem = useCallback(
		(item: FeedItem) => {
			return (
				<FeedEntry
					key={`run-${item.id}`}
					run={item.run}
					selected={item.id === selectedRunId}
					entryRef={(node) => setActivityRowRef(item.id, node)}
					onClick={() => handleRunClick(item.id)}
					reducedMotion={reducedMotion}
				/>
			);
		},
		[handleRunClick, reducedMotion, selectedRunId, setActivityRowRef],
	);

	return (
		<div className="h-full min-h-0 overflow-y-auto px-4 py-6 md:px-6 xl:overflow-hidden xl:py-4">
			<div className="mx-auto h-full min-h-0 max-w-[640px] xl:grid xl:max-w-none xl:grid-cols-[minmax(420px,560px)_minmax(0,1fr)] xl:gap-4">
				<section
					aria-label="Activity feed"
					className="min-h-0 xl:flex xl:flex-col xl:overflow-hidden xl:border-r xl:border-border xl:pr-4"
				>
					<ActivityHeader
						showSearch={showSearch}
						showFilters={showFilters}
						onToggleSearch={handleToggleSearch}
						onToggleFilters={() => setShowFilters((prev) => !prev)}
					/>

					{showSearch && (
						<ActivitySearchBar
							value={searchQuery}
							isLoading={isLoading}
							inputRef={searchInputRef}
							onChange={handleSearchChange}
							onClear={handleClearSearch}
						/>
					)}

					{showFilters && (
						<div className="mb-4 px-3 xl:shrink-0">
							<FilterBar
								filters={filters}
								onFiltersChange={handleFiltersChange}
							/>
						</div>
					)}

					<div className="xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1">
						<FeedList
							items={items}
							hasMore={hasMore}
							isLoading={isLoading}
							searchActive={searchActive}
							showEmptyLoadingState={!showSearch}
							renderFeedItem={renderFeedItem}
							onLoadEarlier={handleLoadEarlier}
						/>
					</div>
				</section>

				<SelectedRunPane
					selectedRunId={selectedRunId}
					onExpand={handleExpandSelectedRun}
				/>
			</div>
		</div>
	);
}
