import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Run, RunStatus } from "@/types/runs";
import type { StatusChangedMessage } from "@/types/websocket";

interface UseRunDetailResult {
	run: Run | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

export function useRunDetail(runId: string | undefined): UseRunDetailResult {
	const [run, setRun] = useState<Run | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const { onStatusChange } = useWebSocket();
	const runRef = useRef<Run | null>(null);

	const fetchRun = useCallback(async () => {
		if (!runId) {
			setRun(null);
			setIsLoading(false);
			return;
		}

		try {
			const response = await fetch(`/api/v2/runs/${runId}`);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error("Run not found");
				}
				throw new Error(`Failed to fetch run: ${response.statusText}`);
			}
			const runData = (await response.json()) as Run;
			setRun(runData);
			runRef.current = runData;
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			setRun(null);
			runRef.current = null;
		} finally {
			setIsLoading(false);
		}
	}, [runId]);

	useEffect(() => {
		setIsLoading(true);
		fetchRun();
	}, [fetchRun]);

	// Subscribe to status_changed events for optimistic updates and
	// reconciliation refetch. When step/runStatus fields are present,
	// apply them immediately to local state before triggering a full
	// refetch for eventual consistency.
	useEffect(() => {
		if (!runId) return;

		const handleStatusChange = (msg: StatusChangedMessage) => {
			const currentRun = runRef.current;
			if (!currentRun) return;

			if (
				msg.feature === currentRun.featureId &&
				msg.projectId === currentRun.projectId
			) {
				if (msg.step || msg.runStatus) {
					setRun((prev) => {
						if (!prev) return null;
						return {
							...prev,
							...(msg.step !== undefined && { currentStep: msg.step }),
							...(msg.runStatus !== undefined && {
								status: msg.runStatus as RunStatus,
							}),
						};
					});
				}

				fetchRun();
			}
		};

		const unsubscribe = onStatusChange(handleStatusChange);
		return unsubscribe;
	}, [runId, onStatusChange, fetchRun]);

	const refetch = useCallback(() => {
		setIsLoading(true);
		fetchRun();
	}, [fetchRun]);

	return {
		run,
		isLoading,
		error,
		refetch,
	};
}
