import { useCallback, useEffect, useRef, useState } from "react";
import {
	buildActivitySearchText,
	normalizeActivitySearchTokens,
} from "@/lib/activity-search-fields";
import { liveRunIndex } from "@/lib/live-run-index";
import { useRuntimeContract } from "@/providers/RuntimeProvider";
import {
	RELEVANT_HIDDEN_RUN_STATUSES,
	type Run,
	type RunStatusFilter,
	type RunsFilter,
	type RunViewFilter,
} from "@/types/runs";
import {
	useLiveRunIndexBridge,
	useLiveRunIndexSnapshot,
} from "./useLiveRunIndex";
import { useReconnectRecovery } from "./useReconnectRecovery";

export interface RunFeedItem {
	readonly type: "run";
	readonly id: string;
	readonly timestamp: string;
	readonly run: Run;
}

export type FeedItem = RunFeedItem;

interface FeedResponse {
	items: FeedItem[];
	total: number;
}

interface FetchFeedOptions {
	readonly signal?: AbortSignal;
	readonly showLoading?: boolean;
	readonly reconcile?: boolean;
}

export interface UseFeedOptions extends Partial<RunsFilter> {
	limit?: number;
	offset?: number;
	search?: string;
}

export interface UseFeedResult {
	items: FeedItem[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

const relevantHiddenRunStatusSet = new Set<Run["status"]>(
	RELEVANT_HIDDEN_RUN_STATUSES,
);
const DEFAULT_FEED_LIMIT = 25;

function activityTimestamp(run: Run): string {
	return run.lastEventAt ?? run.startedAt;
}

function compareRunsByActivity(a: Run, b: Run): number {
	return activityTimestamp(b).localeCompare(activityTimestamp(a));
}

function compareFeedItems(a: FeedItem, b: FeedItem): number {
	return activityTimestamp(b.run).localeCompare(activityTimestamp(a.run));
}

function isWithinDateRange(
	timestamp: string,
	dateRange: UseFeedOptions["dateRange"],
): boolean {
	if (!dateRange || dateRange === "all") {
		return true;
	}

	const now = Date.now();
	const ranges: Record<
		Exclude<NonNullable<UseFeedOptions["dateRange"]>, "all">,
		number
	> = {
		today: 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		month: 30 * 24 * 60 * 60 * 1000,
	};

	return now - new Date(timestamp).getTime() <= ranges[dateRange];
}

function matchesSearch(run: Run, search: string | null | undefined): boolean {
	const tokens = normalizeActivitySearchTokens(search);
	if (tokens.length === 0) return true;

	const searchableText = buildActivitySearchText(run);
	return tokens.every((token) => searchableText.includes(token));
}

function matchesStatusFilter(
	run: Run,
	status: RunStatusFilter | null | undefined,
): boolean {
	if (!status || status === "all") {
		return true;
	}

	return run.status === status;
}

function matchesViewFilter(
	run: Run,
	view: RunViewFilter | null | undefined,
): boolean {
	if (!view || view === "all") {
		return true;
	}

	if (view === "relevant") {
		return !relevantHiddenRunStatusSet.has(run.status);
	}

	return true;
}

function matchesFeedFilters(run: Run, options: UseFeedOptions): boolean {
	if (!matchesViewFilter(run, options.view)) {
		return false;
	}

	if (!matchesStatusFilter(run, options.status)) {
		return false;
	}

	if (options.projectId && run.projectId !== options.projectId) {
		return false;
	}

	return (
		isWithinDateRange(activityTimestamp(run), options.dateRange) &&
		matchesSearch(run, options.search)
	);
}

function toFeedItem(run: Run): RunFeedItem {
	return {
		type: "run",
		id: run.id,
		timestamp: activityTimestamp(run),
		run,
	};
}

function areFeedItemsEqual(
	current: readonly FeedItem[],
	next: readonly FeedItem[],
): boolean {
	if (current.length !== next.length) {
		return false;
	}

	return current.every((item, index) => {
		const candidate = next[index];
		return (
			item.id === candidate?.id &&
			item.timestamp === candidate?.timestamp &&
			item.run === candidate?.run
		);
	});
}

function mergeRunsById(runs: readonly Run[]): Run[] {
	const runsById = new Map<string, Run>();
	for (const run of runs) {
		runsById.set(run.id, run);
	}
	return [...runsById.values()];
}

function recoveryFeedLimit(
	limit: number | undefined,
	activityRecoveryLimit: number,
): number {
	return (limit ?? DEFAULT_FEED_LIMIT) + activityRecoveryLimit;
}

function buildQueryParams(options: UseFeedOptions): URLSearchParams {
	const params = new URLSearchParams();

	if (options.view && options.view !== "all") {
		params.set("view", options.view);
	}

	if (options.status && options.status !== "all") {
		params.set("status", options.status);
	}

	if (options.projectId) {
		params.set("projectId", options.projectId);
	}

	if (options.dateRange && options.dateRange !== "all") {
		params.set("dateRange", options.dateRange);
	}

	if (options.limit !== undefined) {
		params.set("limit", String(options.limit));
	}

	if (options.offset !== undefined) {
		params.set("offset", String(options.offset));
	}

	const searchTokens = normalizeActivitySearchTokens(options.search);
	if (searchTokens.length > 0 && options.search !== undefined) {
		params.set("q", options.search.trim());
	}

	return params;
}

function isAbortError(err: unknown): boolean {
	return (
		typeof err === "object" &&
		err !== null &&
		"name" in err &&
		err.name === "AbortError"
	);
}

export function useFeed(options: UseFeedOptions = {}): UseFeedResult {
	const { reconnectPolicy } = useRuntimeContract();
	const [items, setItems] = useState<FeedItem[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const itemsRef = useRef<FeedItem[]>([]);
	const matchingRunIdsRef = useRef<Set<string>>(new Set());
	const latestRequestIdRef = useRef(0);
	useLiveRunIndexBridge();
	const liveSnapshot = useLiveRunIndexSnapshot();

	const { view, status, projectId, dateRange, limit, offset, search } = options;

	useEffect(() => {
		itemsRef.current = items;
	}, [items]);

	const fetchFeed = useCallback(
		async ({
			signal,
			showLoading = false,
			reconcile = false,
		}: FetchFeedOptions = {}) => {
			const requestId = latestRequestIdRef.current + 1;
			latestRequestIdRef.current = requestId;
			const isLatestRequest = () =>
				latestRequestIdRef.current === requestId && !signal?.aborted;

			if (showLoading) {
				setIsLoading(true);
			}

			try {
				const params = buildQueryParams({
					view,
					status,
					projectId,
					dateRange,
					limit: reconcile
						? recoveryFeedLimit(limit, reconnectPolicy.activityRecoveryLimit)
						: limit,
					offset,
					search,
				});
				const url = `/api/v2/feed${params.toString() ? `?${params.toString()}` : ""}`;
				const response = await fetch(url, { signal });

				if (!response.ok) {
					throw new Error(`Failed to fetch feed: ${response.statusText}`);
				}

				const data = (await response.json()) as FeedResponse;
				if (!isLatestRequest()) {
					return;
				}

				liveRunIndex.upsertRuns(data.items.map((item) => item.run));
				const filterOptions = { view, status, projectId, dateRange, search };
				const responseRuns = data.items
					.map((item) => liveRunIndex.getRun(item.run.id) ?? item.run)
					.filter((run) => matchesFeedFilters(run, filterOptions));

				if (reconcile) {
					const currentRuns = itemsRef.current
						.map((item) => liveRunIndex.getRun(item.run.id) ?? item.run)
						.filter((run) => matchesFeedFilters(run, filterOptions));
					const mergedRuns = mergeRunsById([
						...currentRuns,
						...responseRuns,
					]).sort(compareRunsByActivity);
					const visibleRuns = mergedRuns.slice(0, limit ?? DEFAULT_FEED_LIMIT);
					matchingRunIdsRef.current = new Set(currentRuns.map((run) => run.id));
					setItems(visibleRuns.map(toFeedItem));
					setTotal(Math.max(data.total, visibleRuns.length));
				} else {
					matchingRunIdsRef.current = new Set(
						liveRunIndex
							.getAllRuns()
							.filter((run) => matchesFeedFilters(run, filterOptions))
							.map((run) => run.id),
					);
					setItems(responseRuns.map(toFeedItem).sort(compareFeedItems));
					setTotal(data.total);
				}
				setError(null);
			} catch (err) {
				if (isAbortError(err) || !isLatestRequest()) {
					return;
				}

				setError(err instanceof Error ? err : new Error(String(err)));
			} finally {
				if (isLatestRequest()) {
					setIsLoading(false);
				}
			}
		},
		[
			view,
			status,
			projectId,
			dateRange,
			limit,
			offset,
			search,
			reconnectPolicy.activityRecoveryLimit,
		],
	);

	const reconcileFeed = useCallback(() => {
		return fetchFeed({ reconcile: true });
	}, [fetchFeed]);

	useEffect(() => {
		const controller = new AbortController();
		void fetchFeed({ signal: controller.signal, showLoading: true });

		return () => {
			controller.abort();
		};
	}, [fetchFeed]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		void liveSnapshot;
		const filterOptions = { view, status, projectId, dateRange, search };
		const knownMatchingRunIds = matchingRunIdsRef.current;
		for (const runId of [...knownMatchingRunIds]) {
			const liveRun = liveRunIndex.getRun(runId);
			if (liveRun && !matchesFeedFilters(liveRun, filterOptions)) {
				knownMatchingRunIds.delete(runId);
			}
		}

		const currentItems = items;
		const nextLoadedItems = currentItems
			.map((item) => liveRunIndex.getRun(item.run.id) ?? item.run)
			.filter((run) => matchesFeedFilters(run, filterOptions))
			.map(toFeedItem);
		for (const item of nextLoadedItems) {
			knownMatchingRunIds.add(item.id);
		}

		const retainedIds = new Set(nextLoadedItems.map((item) => item.id));
		const removedCount = currentItems.reduce(
			(count, item) => count + (retainedIds.has(item.id) ? 0 : 1),
			0,
		);

		let addedCount = 0;
		let nextItems = nextLoadedItems;
		if ((offset ?? 0) === 0) {
			const additions: RunFeedItem[] = [];
			for (const run of liveRunIndex.getAllRuns()) {
				if (
					retainedIds.has(run.id) ||
					knownMatchingRunIds.has(run.id) ||
					!matchesFeedFilters(run, filterOptions)
				) {
					continue;
				}
				additions.push(toFeedItem(run));
				retainedIds.add(run.id);
				knownMatchingRunIds.add(run.id);
			}
			addedCount = additions.length;
			nextItems = [...additions.sort(compareFeedItems), ...nextLoadedItems];
			nextItems = nextItems.slice(0, limit ?? DEFAULT_FEED_LIMIT);
		}

		if (!areFeedItemsEqual(currentItems, nextItems)) {
			setItems(nextItems);
		}

		if (addedCount > 0 || removedCount > 0) {
			setTotal((currentTotal) =>
				Math.max(0, currentTotal + addedCount - removedCount),
			);
		}
	}, [
		liveSnapshot,
		items,
		isLoading,
		view,
		status,
		projectId,
		dateRange,
		search,
		limit,
		offset,
	]);

	useReconnectRecovery(reconcileFeed);

	const refetch = useCallback(() => {
		void fetchFeed({ showLoading: true });
	}, [fetchFeed]);

	return {
		items,
		total,
		isLoading,
		error,
		refetch,
	};
}
