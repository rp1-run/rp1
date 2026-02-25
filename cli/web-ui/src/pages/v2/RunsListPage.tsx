import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	RefreshCw,
	Search,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { FilterBar } from "@/components/v2/FilterBar";
import { RunCard } from "@/components/v2/RunCard";
import {
	VirtualizedList,
	type VirtualizedListRef,
} from "@/components/v2/VirtualizedList";
import {
	type VirtualizedListRef as KeyboardNavListRef,
	useKeyboardNav,
} from "@/hooks/useKeyboardNav";
import { useRuns } from "@/hooks/useRuns";
import { isTextInputElement } from "@/lib/keyboard";
import { cn } from "@/lib/utils";
import type { Run, RunStatus, RunsFilter } from "@/types/runs";

const PAGE_SIZE = 20;

function parseFiltersFromParams(
	params: URLSearchParams,
	projectIdFromRoute: string | undefined,
): RunsFilter {
	const status = params.get("status") as RunStatus | "all" | null;
	const projectId = projectIdFromRoute ?? params.get("projectId");
	const dateRange = params.get("dateRange") as RunsFilter["dateRange"] | null;

	return {
		status: status ?? "all",
		projectId: projectId ?? null,
		dateRange: dateRange ?? "all",
	};
}

const SKELETON_KEYS = ["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"];

function LoadingSkeleton() {
	return (
		<div className="rounded-lg border border-border divide-y divide-border/50">
			{SKELETON_KEYS.map((key) => (
				<div key={key} className="animate-pulse bg-muted/20 py-3 px-3">
					<div className="flex items-center gap-3">
						<div className="h-5 w-5 rounded-full bg-muted" />
						<div className="h-5 w-40 rounded bg-muted" />
						<div className="ml-auto h-5 w-16 rounded bg-muted" />
					</div>
				</div>
			))}
		</div>
	);
}

function EmptyState({
	hasFilters,
	onClearFilters,
}: {
	hasFilters: boolean;
	onClearFilters: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-muted/50 p-4">
				<Search className="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				No runs found
			</h2>
			<p className="mb-4 text-center text-sm text-muted-foreground">
				{hasFilters
					? "Try adjusting your filters to see more results."
					: "No agent runs have been recorded yet. Start a new run to see it here."}
			</p>
			{hasFilters && (
				<button
					type="button"
					onClick={onClearFilters}
					className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
				>
					Clear filters
				</button>
			)}
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
				Failed to load runs
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

function Pagination({
	page,
	totalPages,
	onPageChange,
}: {
	page: number;
	totalPages: number;
	onPageChange: (page: number) => void;
}) {
	if (totalPages <= 1) return null;

	return (
		<div className="flex items-center justify-center gap-2">
			<button
				type="button"
				onClick={() => onPageChange(page - 1)}
				disabled={page <= 1}
				className={cn(
					"inline-flex h-9 w-9 items-center justify-center rounded-md border border-border transition-colors",
					"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
				aria-label="Previous page"
			>
				<ChevronLeft className="h-4 w-4" />
			</button>

			<span className="min-w-[100px] text-center text-sm text-muted-foreground">
				Page {page} of {totalPages}
			</span>

			<button
				type="button"
				onClick={() => onPageChange(page + 1)}
				disabled={page >= totalPages}
				className={cn(
					"inline-flex h-9 w-9 items-center justify-center rounded-md border border-border transition-colors",
					"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
				aria-label="Next page"
			>
				<ChevronRight className="h-4 w-4" />
			</button>
		</div>
	);
}

const RUN_CARD_HEIGHT = 80;

export function RunsListPage() {
	const navigate = useNavigate();
	const { projectId: projectIdFromRoute } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const [page, setPage] = useState(1);
	const virtualizedListRef = useRef<VirtualizedListRef>(null);

	const filters = useMemo(
		() => parseFiltersFromParams(searchParams, projectIdFromRoute),
		[searchParams, projectIdFromRoute],
	);

	const offset = (page - 1) * PAGE_SIZE;

	const { runs, total, isLoading, error, refetch } = useRuns({
		...filters,
		limit: PAGE_SIZE,
		offset,
	});

	const totalPages = Math.ceil(total / PAGE_SIZE);

	const handleFiltersChange = useCallback(
		(newFilters: RunsFilter) => {
			const params = new URLSearchParams();

			if (newFilters.status !== "all") {
				params.set("status", newFilters.status);
			}

			if (newFilters.projectId && !projectIdFromRoute) {
				params.set("projectId", newFilters.projectId);
			}

			if (newFilters.dateRange !== "all") {
				params.set("dateRange", newFilters.dateRange);
			}

			setSearchParams(params, { replace: true });
			setPage(1);
		},
		[setSearchParams, projectIdFromRoute],
	);

	const handleClearFilters = useCallback(() => {
		handleFiltersChange({
			status: "all",
			projectId: projectIdFromRoute ?? null,
			dateRange: "all",
		});
	}, [handleFiltersChange, projectIdFromRoute]);

	const handlePageChange = useCallback((newPage: number) => {
		setPage(newPage);
		window.scrollTo({ top: 0, behavior: "smooth" });
	}, []);

	const handleSelectRun = useCallback(
		(run: Run) => {
			navigate(`/runs/${run.id}`);
		},
		[navigate],
	);

	const handleDrillIn = useCallback(
		(run: Run) => {
			navigate(`/runs/${run.id}`);
		},
		[navigate],
	);

	const handleDrillOut = useCallback(() => {
		navigate(projectIdFromRoute ? "/projects" : "/");
	}, [navigate, projectIdFromRoute]);

	const { selectedIndex, setSelectedIndex } = useKeyboardNav({
		items: runs,
		onSelect: handleSelectRun,
		onDrillIn: handleDrillIn,
		onDrillOut: handleDrillOut,
		enabled: runs.length > 0,
		listRef: virtualizedListRef as React.RefObject<KeyboardNavListRef | null>,
	});

	// Document-level keyboard listener for vim navigation
	useEffect(() => {
		if (runs.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;

			if (isTextInputElement(e.target as Element)) return;

			switch (e.key) {
				case "j":
				case "ArrowDown":
					e.preventDefault();
					setSelectedIndex(
						selectedIndex === null
							? 0
							: Math.min(selectedIndex + 1, runs.length - 1),
					);
					break;
				case "k":
				case "ArrowUp":
					e.preventDefault();
					setSelectedIndex(
						selectedIndex === null
							? runs.length - 1
							: Math.max(selectedIndex - 1, 0),
					);
					break;
				case "l":
				case "ArrowRight":
				case "Enter":
					if (selectedIndex !== null && runs[selectedIndex]) {
						e.preventDefault();
						handleDrillIn(runs[selectedIndex]);
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
	}, [runs, selectedIndex, setSelectedIndex, handleDrillIn, handleDrillOut]);

	useEffect(() => {
		const handleRefresh = () => {
			refetch();
		};
		window.addEventListener("rp1:refresh", handleRefresh);
		return () => window.removeEventListener("rp1:refresh", handleRefresh);
	}, [refetch]);

	// TODO: Focus FilterBar search input once it gains a text input field
	useEffect(() => {
		const handleFocusSearch = () => {};
		window.addEventListener("rp1:focus-search", handleFocusSearch);
		return () =>
			window.removeEventListener("rp1:focus-search", handleFocusSearch);
	}, []);

	const renderRunItem = useCallback(
		(run: Run, _index: number, isSelected: boolean) => (
			<RunCard
				run={run}
				onClick={() => handleSelectRun(run)}
				selected={isSelected}
			/>
		),
		[handleSelectRun],
	);

	const getRunKey = useCallback((run: Run) => run.id, []);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally reset page when filters change
	useEffect(() => {
		setPage(1);
	}, [filters.status, filters.projectId, filters.dateRange]);

	const hasFilters =
		filters.status !== "all" ||
		(filters.projectId !== null && !projectIdFromRoute) ||
		filters.dateRange !== "all";

	return (
		<div className="space-y-6">
			<header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">Runs</h1>
					{projectIdFromRoute && (
						<p className="mt-1 text-sm text-muted-foreground">
							Showing runs for project: {projectIdFromRoute}
						</p>
					)}
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
					aria-label="Refresh runs"
				>
					<RefreshCw
						className={cn("h-4 w-4", isLoading && "animate-spin")}
						aria-hidden="true"
					/>
					<span className="sr-only sm:not-sr-only">Refresh</span>
				</button>
			</header>

			<FilterBar filters={filters} onFiltersChange={handleFiltersChange} />

			{isLoading && runs.length === 0 ? (
				<LoadingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={refetch} />
			) : runs.length === 0 ? (
				<EmptyState
					hasFilters={hasFilters}
					onClearFilters={handleClearFilters}
				/>
			) : (
				<>
					<VirtualizedList
						ref={virtualizedListRef}
						items={runs}
						estimateSize={RUN_CARD_HEIGHT}
						overscan={5}
						renderItem={renderRunItem}
						getItemKey={getRunKey}
						onSelect={handleSelectRun}
						selectedIndex={selectedIndex}
						className="h-[600px] rounded-lg border border-border"
						itemClassName=""
						aria-label="Runs list"
					/>

					<Pagination
						page={page}
						totalPages={totalPages}
						onPageChange={handlePageChange}
					/>

					{total > 0 && (
						<p className="text-center text-sm text-muted-foreground">
							Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of{" "}
							{total} runs
						</p>
					)}

					<p className="text-center text-xs text-muted-foreground">
						<kbd className="rounded bg-muted px-1.5 py-0.5">j</kbd>/
						<kbd className="rounded bg-muted px-1.5 py-0.5">k</kbd> navigate,{" "}
						<kbd className="rounded bg-muted px-1.5 py-0.5">l</kbd> open,{" "}
						<kbd className="rounded bg-muted px-1.5 py-0.5">h</kbd> back
					</p>
				</>
			)}
		</div>
	);
}
