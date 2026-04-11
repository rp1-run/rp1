import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Run, RunsFilter } from "@/types/runs";
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
	const { subscribeToAttention } = useWebSocket();

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
			setItems(data.items);
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
		const unsubscribe = subscribeToAttention(() => {
			fetchFeed();
		});
		return unsubscribe;
	}, [subscribeToAttention, fetchFeed]);

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
