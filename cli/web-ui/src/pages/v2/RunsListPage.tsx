import {
	AlertCircle,
	ChevronLeft,
	ChevronRight,
	Play,
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
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
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

function LoadingSkeleton() {
	return (
		<div className="divide-y divide-border">
			{["sk-a", "sk-b", "sk-c", "sk-d", "sk-e"].map((key) => (
				<div
					key={key}
					className="flex items-center gap-3 py-3 px-3 animate-pulse"
				>
					<div className="h-2 w-2 rounded-full bg-fg-ghost" />
					<div className="h-4 w-40 rounded bg-surface-void" />
					<div className="ml-auto h-3 w-16 rounded bg-surface-void" />
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
		<div className="flex flex-col items-center justify-center px-8 py-16">
			<Search className="mb-4 h-4 w-4 text-fg-ghost" strokeWidth={1.5} />
			<p className="mb-2 type-body text-fg">No runs found</p>
			<p className="mb-4 text-center type-secondary text-fg-muted">
				{hasFilters
					? "Try adjusting your filters to see more results."
					: "No agent runs have been recorded yet."}
			</p>
			{hasFilters && (
				<button
					type="button"
					onClick={onClearFilters}
					className="type-body text-fg-muted transition-colors duration-150 hover:text-fg"
				>
					Clear filters
				</button>
			)}
		</div>
	);
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center px-8 py-16">
			<AlertCircle className="mb-4 h-4 w-4 text-failure" strokeWidth={1.5} />
			<p className="mb-2 type-body text-fg">Failed to load runs</p>
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
		<div className="flex items-center justify-center gap-3">
			<button
				type="button"
				onClick={() => onPageChange(page - 1)}
				disabled={page <= 1}
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded text-fg-ghost transition-colors duration-150",
					"hover:text-fg",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
				aria-label="Previous page"
			>
				<ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
			</button>

			<span className="min-w-[100px] text-center type-secondary text-fg-ghost tabular-nums">
				Page {page} of {totalPages}
			</span>

			<button
				type="button"
				onClick={() => onPageChange(page + 1)}
				disabled={page >= totalPages}
				className={cn(
					"flex h-8 w-8 items-center justify-center rounded text-fg-ghost transition-colors duration-150",
					"hover:text-fg",
					"disabled:cursor-not-allowed disabled:opacity-50",
				)}
				aria-label="Next page"
			>
				<ChevronRight className="h-4 w-4" strokeWidth={1.5} />
			</button>
		</div>
	);
}

const RUN_CARD_HEIGHT = 44;

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

	useEffect(() => {
		if (runs.length === 0) return;

		const handleKeyDown = (e: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.body.dataset.chordPending) return;

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

	useEffect(() => {
		const handleFocusSearch = () => {};
		window.addEventListener("rp1:focus-search", handleFocusSearch);
		return () =>
			window.removeEventListener("rp1:focus-search", handleFocusSearch);
	}, []);

	useContextualShortcuts({
		viewId: "runs-list",
		viewLabel: "Runs List",
		shortcuts: [
			{
				key: "f",
				label: "Filter",
				description: "Focus the filter bar",
				action: () => {
					const tab = document.querySelector<HTMLElement>(
						'[role="tablist"] [role="tab"]',
					);
					tab?.focus();
				},
			},
			{
				key: "s",
				label: "Sort",
				description: "Open sort/filter dropdown",
				action: () => {
					const trigger = document.querySelector<HTMLElement>(
						'[aria-haspopup="listbox"]',
					);
					trigger?.click();
				},
			},
			{
				key: "r",
				label: "Refresh",
				description: "Refresh runs data",
				action: () => {
					refetch();
				},
			},
		],
	});

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
		<div className="mx-auto max-w-2xl px-6 py-8 space-y-6">
			<header>
				<h1 className="flex items-center gap-2 type-title text-fg">
					<Play className="h-4 w-4" strokeWidth={1.5} />
					Runs
				</h1>
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
						className="h-[600px] rounded border border-border"
						itemClassName=""
						aria-label="Runs list"
					/>

					<Pagination
						page={page}
						totalPages={totalPages}
						onPageChange={handlePageChange}
					/>

					{total > 0 && (
						<p className="text-center type-secondary text-fg-ghost tabular-nums">
							Showing {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} of{" "}
							{total} runs
						</p>
					)}
				</>
			)}
		</div>
	);
}
