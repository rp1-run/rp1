import { useCallback, useEffect, useRef, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { Run, RunsFilter } from "@/types/runs";
import { useLiveRunIndexSnapshot } from "./useLiveRunIndex";
import { useReconnectRecovery } from "./useReconnectRecovery";

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

function activityTimestamp(run: Run): string {
	return run.lastEventAt ?? run.startedAt;
}

function compareRunsByActivity(a: Run, b: Run): number {
	return activityTimestamp(b).localeCompare(activityTimestamp(a));
}

function isWithinDateRange(
	timestamp: string,
	dateRange: UseRunsOptions["dateRange"],
): boolean {
	if (!dateRange || dateRange === "all") {
		return true;
	}

	const now = Date.now();
	const ranges: Record<
		Exclude<NonNullable<UseRunsOptions["dateRange"]>, "all">,
		number
	> = {
		today: 24 * 60 * 60 * 1000,
		week: 7 * 24 * 60 * 60 * 1000,
		month: 30 * 24 * 60 * 60 * 1000,
	};

	return now - new Date(timestamp).getTime() <= ranges[dateRange];
}

function matchesRunFilters(run: Run, options: UseRunsOptions): boolean {
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

function areRunsEqual(current: readonly Run[], next: readonly Run[]): boolean {
	if (current.length !== next.length) {
		return false;
	}

	return current.every((run, index) => run === next[index]);
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
	const matchingRunIdsRef = useRef<Set<string>>(new Set());
	const liveSnapshot = useLiveRunIndexSnapshot();

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
			liveRunIndex.upsertRuns(data.runs);
			const filterOptions = { status, projectId, dateRange };
			matchingRunIdsRef.current = new Set(
				liveRunIndex
					.getAllRuns()
					.filter((run) => matchesRunFilters(run, filterOptions))
					.map((run) => run.id),
			);
			setRuns(
				data.runs
					.map((run) => liveRunIndex.getRun(run.id) ?? run)
					.sort(compareRunsByActivity),
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
		fetchRuns();
	}, [fetchRuns]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		void liveSnapshot;
		const filterOptions = { status, projectId, dateRange };
		const knownMatchingRunIds = matchingRunIdsRef.current;
		for (const runId of [...knownMatchingRunIds]) {
			const liveRun = liveRunIndex.getRun(runId);
			if (liveRun && !matchesRunFilters(liveRun, filterOptions)) {
				knownMatchingRunIds.delete(runId);
			}
		}

		const currentRuns = runs;
		const nextLoadedRuns = currentRuns
			.map((run) => liveRunIndex.getRun(run.id) ?? run)
			.filter((run) => matchesRunFilters(run, filterOptions))
			.sort(compareRunsByActivity);
		for (const run of nextLoadedRuns) {
			knownMatchingRunIds.add(run.id);
		}

		const retainedIds = new Set(nextLoadedRuns.map((run) => run.id));
		const removedCount = currentRuns.reduce(
			(count, run) => count + (retainedIds.has(run.id) ? 0 : 1),
			0,
		);

		let addedCount = 0;
		let nextRuns = nextLoadedRuns;
		if ((offset ?? 0) === 0) {
			const additions: Run[] = [];
			for (const run of liveRunIndex.getAllRuns()) {
				if (
					retainedIds.has(run.id) ||
					knownMatchingRunIds.has(run.id) ||
					!matchesRunFilters(run, filterOptions)
				) {
					continue;
				}
				additions.push(run);
				retainedIds.add(run.id);
				knownMatchingRunIds.add(run.id);
			}
			addedCount = additions.length;
			nextRuns = [...nextLoadedRuns, ...additions].sort(compareRunsByActivity);
			if (limit !== undefined) {
				nextRuns = nextRuns.slice(0, limit);
			}
		}

		if (!areRunsEqual(currentRuns, nextRuns)) {
			setRuns(nextRuns);
		}

		if (addedCount > 0 || removedCount > 0) {
			setTotal((currentTotal) =>
				Math.max(0, currentTotal + addedCount - removedCount),
			);
		}
	}, [
		liveSnapshot,
		runs,
		isLoading,
		status,
		projectId,
		dateRange,
		limit,
		offset,
	]);

	useReconnectRecovery(fetchRuns);

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
