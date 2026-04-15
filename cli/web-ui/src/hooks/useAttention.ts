import { useCallback, useEffect, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import type { AttentionData } from "@/types/runs";
import {
	useLiveRunIndexBridge,
	useLiveRunIndexSnapshot,
} from "./useLiveRunIndex";
import { useReconnectRecovery } from "./useReconnectRecovery";

interface UseAttentionResult {
	data: AttentionData | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

function areAttentionGroupsEqual(
	current: AttentionData | null,
	next: AttentionData,
): boolean {
	if (!current) {
		return false;
	}

	return (
		current.waiting.length === next.waiting.length &&
		current.failed.length === next.failed.length &&
		current.running.length === next.running.length &&
		current.waiting.every((run, index) => run === next.waiting[index]) &&
		current.failed.every((run, index) => run === next.failed[index]) &&
		current.running.every((run, index) => run === next.running[index])
	);
}

export function useAttention(): UseAttentionResult {
	const [data, setData] = useState<AttentionData | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	useLiveRunIndexBridge();
	const liveSnapshot = useLiveRunIndexSnapshot();

	const fetchAttention = useCallback(async () => {
		try {
			const response = await fetch("/api/v2/runs/attention");
			if (!response.ok) {
				throw new Error(
					`Failed to fetch attention data: ${response.statusText}`,
				);
			}
			const attentionData = (await response.json()) as AttentionData;
			liveRunIndex.upsertRuns([
				...attentionData.waiting,
				...attentionData.failed,
				...attentionData.running,
			]);
			setData({
				waiting: attentionData.waiting
					.map((run) => liveRunIndex.getRun(run.id) ?? run)
					.filter((run) => run.status === "waiting"),
				failed: attentionData.failed
					.map((run) => liveRunIndex.getRun(run.id) ?? run)
					.filter((run) => run.status === "failed"),
				running: attentionData.running
					.map((run) => liveRunIndex.getRun(run.id) ?? run)
					.filter((run) => run.status === "running"),
			});
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAttention();
	}, [fetchAttention]);

	useEffect(() => {
		if (isLoading || data === null) {
			return;
		}

		void liveSnapshot;
		const nextData: AttentionData = {
			waiting: liveRunIndex
				.getAllRuns()
				.filter((run) => run.status === "waiting"),
			failed: liveRunIndex
				.getAllRuns()
				.filter((run) => run.status === "failed"),
			running: liveRunIndex
				.getAllRuns()
				.filter((run) => run.status === "running"),
		};

		if (!areAttentionGroupsEqual(data, nextData)) {
			setData(nextData);
		}
	}, [data, isLoading, liveSnapshot]);

	useReconnectRecovery(fetchAttention);

	const refetch = useCallback(() => {
		setIsLoading(true);
		fetchAttention();
	}, [fetchAttention]);

	return {
		data,
		isLoading,
		error,
		refetch,
	};
}
