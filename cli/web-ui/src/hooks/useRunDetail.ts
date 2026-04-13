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

const runDetailCache = new Map<string, Run>();

interface UseRunDetailResult {
	run: Run | null;
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

const TERMINAL_RUN_STATUSES = new Set<RunStatus>([
	"completed",
	"failed",
	"cancelled",
	"abandoned",
]);

export function useRunDetail(runId: string | undefined): UseRunDetailResult {
	const [run, setRun] = useState<Run | null>(() =>
		runId ? (runDetailCache.get(runId) ?? null) : null,
	);
	const [isLoading, setIsLoading] = useState(() =>
		runId ? !runDetailCache.has(runId) : false,
	);
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
					runDetailCache.delete(runId);
					throw new Error("Run not found");
				}
				throw new Error(`Failed to fetch run: ${response.statusText}`);
			}
			const runData = (await response.json()) as Run;
			setRun(runData);
			runRef.current = runData;
			runDetailCache.set(runId, runData);
			setError(null);
		} catch (err) {
			const nextError = err instanceof Error ? err : new Error(String(err));
			const shouldKeepStaleRun =
				runRef.current !== null && nextError.message !== "Run not found";
			if (!shouldKeepStaleRun) {
				setError(nextError);
				setRun(null);
				runRef.current = null;
			}
		} finally {
			setIsLoading(false);
		}
	}, [runId]);

	useEffect(() => {
		if (!runId) {
			setRun(null);
			runRef.current = null;
			setError(null);
			setIsLoading(false);
			return;
		}

		const cachedRun = runDetailCache.get(runId) ?? null;
		setRun(cachedRun);
		runRef.current = cachedRun;
		setError(null);
		setIsLoading(cachedRun === null);
		void fetchRun();
	}, [runId, fetchRun]);

	useEffect(() => {
		if (!runId || !run) return;
		runDetailCache.set(runId, run);
	}, [runId, run]);

	const debouncedFetchRef = useRef<ReturnType<typeof setTimeout>>();

	useEffect(() => {
		if (!runId) return;

		const handleEvent = (msg: EventNotificationMessage) => {
			const currentRun = runRef.current;
			if (!currentRun) return;
			if (msg.runId !== currentRun.id) return;

			let shouldRefetch = true;

			if (msg.eventType === "status_change") {
				const data = msg.data as Record<string, unknown> | null;
				const newStatus = data?.status as string | undefined;
				const step = msg.step;
				const statusMessage =
					typeof data?.message === "string" ? data.message : undefined;

				if (step || newStatus) {
					setRun((prev) => {
						if (!prev) return null;

						let updatedSteps = prev.steps;
						if (step && newStatus) {
							updatedSteps = prev.steps.map((s) =>
								s.id === step ? { ...s, status: newStatus as StepStatus } : s,
							);
						}

						const nextStatus = newStatus as RunStatus | undefined;
						const isTerminal =
							nextStatus != null && TERMINAL_RUN_STATUSES.has(nextStatus);
						const shouldClearLifecycleMessage =
							nextStatus !== undefined &&
							nextStatus !== prev.status &&
							statusMessage === undefined &&
							nextStatus !== "failed";

						return {
							...prev,
							steps: updatedSteps,
							...(step ? { currentStep: step } : {}),
							...(nextStatus !== undefined && {
								status: nextStatus,
							}),
							...(statusMessage !== undefined && {
								statusMessage,
								...(nextStatus === "failed" ? { error: statusMessage } : {}),
							}),
							...(shouldClearLifecycleMessage
								? {
										statusMessage: null,
										error: null,
									}
								: {}),
							...(isTerminal ? { completedAt: msg.createdAt } : {}),
						};
					});
				}

				const isTerminal =
					newStatus !== undefined &&
					TERMINAL_RUN_STATUSES.has(newStatus as RunStatus);
				if (isTerminal) {
					setTimeout(fetchRun, 1000);
				}
			}

			if (msg.eventType === "artifact_registered") {
				const data = msg.data as Record<string, unknown> | null;

				if (data?.reconciled) {
					shouldRefetch = false;
					setRun((prev) => {
						if (!prev) return null;
						return {
							...prev,
							artifacts: prev.artifacts.map((a) =>
								a.docId === data.docId
									? {
											...a,
											path: data.path as string,
										}
									: a,
							),
						};
					});
				} else {
					const docId = (data?.docId as string) ?? "";
					const path = (data?.path as string) ?? "";
					if (!docId || !path) return;

					const newArtifact: Artifact = {
						docId,
						path,
						absolutePath: path,
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
						steps: prev.steps.map((step) =>
							msg.step && step.id === msg.step
								? { ...step, status: "waiting" as StepStatus }
								: step,
						),
						status: "waiting" as RunStatus,
						currentStep: msg.step ?? prev.currentStep,
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

			if (shouldRefetch) {
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
