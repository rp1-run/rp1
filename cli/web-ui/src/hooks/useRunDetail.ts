import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Run, RunStatus, StepStatus } from "@/types/runs";
import type { ConnectionStatus, StatusChangedMessage } from "@/types/websocket";

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
	const { onStatusChange, status: wsStatus } = useWebSocket();
	const prevWsStatusRef = useRef<ConnectionStatus>(wsStatus);
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
	// debounced reconciliation refetch. When step/runStatus/stepStatus fields
	// are present, apply them immediately to local state. Full refetch is
	// debounced with a 500ms quiet window to batch rapid status changes.
	const debouncedFetchRef = useRef<ReturnType<typeof setTimeout>>();

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

						// Step-level optimistic patch: update individual step status
						let updatedSteps = prev.steps;
						if (msg.step && msg.stepStatus) {
							updatedSteps = prev.steps.map((s) =>
								s.id === msg.step
									? { ...s, status: msg.stepStatus as StepStatus }
									: s,
							);
						}

						return {
							...prev,
							steps: updatedSteps,
							...(msg.step !== undefined && { currentStep: msg.step }),
							...(msg.runStatus !== undefined && {
								status: msg.runStatus as RunStatus,
							}),
						};
					});
				}

				clearTimeout(debouncedFetchRef.current);
				debouncedFetchRef.current = setTimeout(fetchRun, 500);

				const isTerminal =
					msg.runStatus === "completed" || msg.runStatus === "failed";
				if (isTerminal) {
					setTimeout(fetchRun, 1000);
				}
			}
		};

		const unsubscribe = onStatusChange(handleStatusChange);
		return () => {
			unsubscribe();
			clearTimeout(debouncedFetchRef.current);
		};
	}, [runId, onStatusChange, fetchRun]);

	// Reconnection reconciliation: when the WebSocket transitions from
	// disconnected/connecting to connected, refetch the full run state to
	// reconcile any events missed during the disconnection window.
	useEffect(() => {
		if (
			prevWsStatusRef.current !== "connected" &&
			wsStatus === "connected" &&
			runId
		) {
			fetchRun();
		}
		prevWsStatusRef.current = wsStatus;
	}, [wsStatus, runId, fetchRun]);

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
