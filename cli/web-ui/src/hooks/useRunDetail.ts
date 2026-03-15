import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type {
	Artifact,
	Run,
	RunEvent,
	RunStatus,
	StepStatus,
} from "@/types/runs";
import type {
	ConnectionStatus,
	EventNotificationMessage,
} from "@/types/websocket";

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
	const { onEventNotification, status: wsStatus } = useWebSocket();
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

	const debouncedFetchRef = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => {
		if (!runId) return;

		const handleEvent = (msg: EventNotificationMessage) => {
			const currentRun = runRef.current;
			if (!currentRun) return;

			if (
				msg.featureId === currentRun.featureId &&
				msg.projectId === currentRun.projectId
			) {
				if (msg.eventType === "status_change") {
					const data = msg.data as Record<string, unknown> | null;
					const newStatus = data?.status as string | undefined;
					const step = msg.step;

					if (step || newStatus) {
						setRun((prev) => {
							if (!prev) return null;

							let updatedSteps = prev.steps;
							if (step && newStatus) {
								updatedSteps = prev.steps.map((s) =>
									s.id === step ? { ...s, status: newStatus as StepStatus } : s,
								);
							}

							return {
								...prev,
								steps: updatedSteps,
								...(step !== undefined && { currentStep: step }),
								...(newStatus !== undefined && {
									status: newStatus as RunStatus,
								}),
							};
						});
					}

					const isTerminal =
						newStatus === "completed" || newStatus === "failed";
					if (isTerminal) {
						setTimeout(fetchRun, 1000);
					}
				}

				if (msg.eventType === "artifact_registered") {
					const data = msg.data as Record<string, unknown> | null;
					const newArtifact: Artifact = {
						docId: (data?.docId as string) ?? "",
						path: (data?.path as string) ?? "",
						absolutePath: (data?.path as string) ?? "",
						type: (data?.type as Artifact["type"]) ?? "other",
						updatedDuringRun: true,
						isNew: true,
						step: msg.step,
					};

					setRun((prev) => {
						if (!prev) return null;
						return {
							...prev,
							artifacts: [...prev.artifacts, newArtifact],
						};
					});
				}

				if (msg.eventType === "waiting_for_user") {
					const data = msg.data as Record<string, unknown> | null;
					const prompt = (data?.prompt as string) ?? "";
					const waitingEvent: RunEvent = {
						id: `ws-${msg.eventId}`,
						type: "waiting_for_user",
						message: prompt,
						timestamp: msg.createdAt,
						stepId: msg.step,
						metadata: data ?? null,
					};

					setRun((prev) => {
						if (!prev) return null;
						return {
							...prev,
							status: "waiting" as RunStatus,
							events: [...prev.events, waitingEvent],
						};
					});
				}

				if (msg.eventType === "btw_update") {
					const data = msg.data as Record<string, unknown> | null;
					const message = (data?.message as string) ?? "";
					const btwEvent: RunEvent = {
						id: `ws-${msg.eventId}`,
						type: "btw_update",
						message,
						timestamp: msg.createdAt,
						stepId: msg.step,
						metadata: data ?? null,
					};

					setRun((prev) => {
						if (!prev) return null;
						return {
							...prev,
							events: [...prev.events, btwEvent],
						};
					});
				}

				clearTimeout(debouncedFetchRef.current);
				debouncedFetchRef.current = setTimeout(fetchRun, 500);
			}
		};

		const unsubscribe = onEventNotification(handleEvent);
		return () => {
			unsubscribe();
			clearTimeout(debouncedFetchRef.current);
		};
	}, [runId, onEventNotification, fetchRun]);

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
