import { useCallback, useEffect, useRef, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run, RunsFilter } from "@/types/runs";
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

export interface UseFeedOptions extends Partial<RunsFilter> {
	limit?: number;
	offset?: number;
}

export interface UseFeedResult {
	items: FeedItem[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

function activityTimestamp(run: Run): string {
	return run.lastEventAt ?? run.startedAt;
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

function matchesFeedFilters(run: Run, options: UseFeedOptions): boolean {
	if (
		options.status &&
		options.status !== "all" &&
		run.status !== options.status
	) {
		return false;
	}

	if (options.projectId && run.projectId !== options.projectId) {
		return false;
	}

	return isWithinDateRange(activityTimestamp(run), options.dateRange);
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

function buildQueryParams(options: UseFeedOptions): URLSearchParams {
	const params = new URLSearchParams();

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

	return params;
}

export function useFeed(options: UseFeedOptions = {}): UseFeedResult {
	const [items, setItems] = useState<FeedItem[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const matchingRunIdsRef = useRef<Set<string>>(new Set());
	useLiveRunIndexBridge();
	const liveSnapshot = useLiveRunIndexSnapshot();

	const { status, projectId, dateRange, limit, offset } = options;

	const fetchFeed = useCallback(async () => {
		try {
			const params = buildQueryParams({
				status,
				projectId,
				dateRange,
				limit,
				offset,
			});
			const url = `/api/v2/feed${params.toString() ? `?${params.toString()}` : ""}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch feed: ${response.statusText}`);
			}

			const data = (await response.json()) as FeedResponse;
			liveRunIndex.upsertRuns(data.items.map((item) => item.run));
			const filterOptions = { status, projectId, dateRange };
			matchingRunIdsRef.current = new Set(
				liveRunIndex
					.getAllRuns()
					.filter((run) => matchesFeedFilters(run, filterOptions))
					.map((run) => run.id),
			);
			setItems(
				data.items
					.map((item) =>
						toFeedItem(liveRunIndex.getRun(item.run.id) ?? item.run),
					)
					.sort(compareFeedItems),
			);
			setTotal(data.total);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, [status, projectId, dateRange, limit, offset]);

	useEffect(() => {
		setIsLoading(true);
		fetchFeed();
	}, [fetchFeed]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		void liveSnapshot;
		const filterOptions = { status, projectId, dateRange };
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
			nextItems = [...nextLoadedItems, ...additions];
			if (limit !== undefined) {
				nextItems = nextItems.slice(0, limit);
			}
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
		status,
		projectId,
		dateRange,
		limit,
		offset,
	]);

	useReconnectRecovery(fetchFeed);

	const refetch = useCallback(() => {
		setIsLoading(true);
		fetchFeed();
	}, [fetchFeed]);

	return {
		items,
		total,
		isLoading,
		error,
		refetch,
	};
}
