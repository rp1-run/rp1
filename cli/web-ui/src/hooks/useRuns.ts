import { useCallback, useEffect, useRef, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import { useRuntimeContract } from "@/providers/RuntimeProvider";
import {
	RELEVANT_HIDDEN_RUN_STATUSES,
	type Run,
	type RunStatusFilter,
	type RunsFilter,
	type RunViewFilter,
} from "@/types/runs";
import { useLiveRunIndexSnapshot } from "./useLiveRunIndex";
import { useReconnectRecovery } from "./useReconnectRecovery";

interface RunsResponse {
	runs: Run[];
	total: number;
}

interface FetchRunsOptions {
	readonly showLoading?: boolean;
	readonly reconcile?: boolean;
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

const relevantHiddenRunStatusSet = new Set<Run["status"]>(
	RELEVANT_HIDDEN_RUN_STATUSES,
);
const DEFAULT_RUNS_LIMIT = 50;

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

function matchesRunFilters(run: Run, options: UseRunsOptions): boolean {
	if (!matchesViewFilter(run, options.view)) {
		return false;
	}

	if (!matchesStatusFilter(run, options.status)) {
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

function mergeRunsById(runs: readonly Run[]): Run[] {
	const runsById = new Map<string, Run>();
	for (const run of runs) {
		runsById.set(run.id, run);
	}
	return [...runsById.values()];
}

function recoveryRunsLimit(
	limit: number | undefined,
	activityRecoveryLimit: number,
): number {
	return (limit ?? DEFAULT_RUNS_LIMIT) + activityRecoveryLimit;
}

function buildQueryParams(options: UseRunsOptions): URLSearchParams {
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

	return params;
}

export function useRuns(options: UseRunsOptions = {}): UseRunsResult {
	const { reconnectPolicy } = useRuntimeContract();
	const [runs, setRuns] = useState<Run[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const runsRef = useRef<Run[]>([]);
	const matchingRunIdsRef = useRef<Set<string>>(new Set());
	const liveSnapshot = useLiveRunIndexSnapshot();

	// Destructure to use primitives as dependencies (avoid object reference changes)
	const { view, status, projectId, dateRange, limit, offset } = options;

	useEffect(() => {
		runsRef.current = runs;
	}, [runs]);

	const fetchRuns = useCallback(
		async ({
			showLoading = false,
			reconcile = false,
		}: FetchRunsOptions = {}) => {
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
						? recoveryRunsLimit(limit, reconnectPolicy.activityRecoveryLimit)
						: limit,
					offset,
				});
				const url = `/api/v2/runs${params.toString() ? `?${params.toString()}` : ""}`;
				const response = await fetch(url);

				if (!response.ok) {
					throw new Error(`Failed to fetch runs: ${response.statusText}`);
				}

				const data = (await response.json()) as RunsResponse;
				liveRunIndex.upsertRuns(data.runs);
				const filterOptions = { view, status, projectId, dateRange };
				const responseRuns = data.runs
					.map((run) => liveRunIndex.getRun(run.id) ?? run)
					.filter((run) => matchesRunFilters(run, filterOptions));

				if (reconcile) {
					const currentRuns = runsRef.current
						.map((run) => liveRunIndex.getRun(run.id) ?? run)
						.filter((run) => matchesRunFilters(run, filterOptions));
					const mergedRuns = mergeRunsById([
						...currentRuns,
						...responseRuns,
					]).sort(compareRunsByActivity);
					const visibleRuns = mergedRuns.slice(0, limit ?? DEFAULT_RUNS_LIMIT);
					matchingRunIdsRef.current = new Set(currentRuns.map((run) => run.id));
					setRuns(visibleRuns);
					setTotal(Math.max(data.total, visibleRuns.length));
				} else {
					matchingRunIdsRef.current = new Set(
						liveRunIndex
							.getAllRuns()
							.filter((run) => matchesRunFilters(run, filterOptions))
							.map((run) => run.id),
					);
					setRuns(responseRuns.sort(compareRunsByActivity));
					setTotal(data.total);
				}
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)));
			} finally {
				setIsLoading(false);
			}
		},
		[
			view,
			status,
			projectId,
			dateRange,
			limit,
			offset,
			reconnectPolicy.activityRecoveryLimit,
		],
	);

	const reconcileRuns = useCallback(() => {
		return fetchRuns({ reconcile: true });
	}, [fetchRuns]);

	useEffect(() => {
		void fetchRuns({ showLoading: true });
	}, [fetchRuns]);

	useEffect(() => {
		if (isLoading) {
			return;
		}

		void liveSnapshot;
		const filterOptions = { view, status, projectId, dateRange };
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
			nextRuns = nextRuns.slice(0, limit ?? DEFAULT_RUNS_LIMIT);
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
		view,
		status,
		projectId,
		dateRange,
		limit,
		offset,
	]);

	useReconnectRecovery(reconcileRuns);

	const refetch = useCallback(() => {
		void fetchRuns({ showLoading: true });
	}, [fetchRuns]);

	return {
		runs,
		total,
		isLoading,
		error,
		refetch,
	};
}
