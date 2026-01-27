import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Run, RunsFilter } from "@/types/runs";

interface RunsResponse {
	runs: Run[];
	total: number;
}

interface UseRunsOptions extends Partial<RunsFilter> {
	limit?: number;
	offset?: number;
}

interface UseRunsResult {
	runs: Run[];
	total: number;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

function buildQueryParams(options: UseRunsOptions): URLSearchParams {
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

export function useRuns(options: UseRunsOptions = {}): UseRunsResult {
	const [runs, setRuns] = useState<Run[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const { subscribeToAttention } = useWebSocket();

	// Destructure to use primitives as dependencies (avoid object reference changes)
	const { status, projectId, dateRange, limit, offset } = options;

	const fetchRuns = useCallback(async () => {
		try {
			const params = buildQueryParams({
				status,
				projectId,
				dateRange,
				limit,
				offset,
			});
			const url = `/api/v2/runs${params.toString() ? `?${params.toString()}` : ""}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Failed to fetch runs: ${response.statusText}`);
			}

			const data = (await response.json()) as RunsResponse;
			setRuns(data.runs);
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
		fetchRuns();
	}, [fetchRuns]);

	useEffect(() => {
		const unsubscribe = subscribeToAttention(() => {
			fetchRuns();
		});
		return unsubscribe;
	}, [subscribeToAttention, fetchRuns]);

	const refetch = useCallback(() => {
		setIsLoading(true);
		fetchRuns();
	}, [fetchRuns]);

	return {
		runs,
		total,
		isLoading,
		error,
		refetch,
	};
}
