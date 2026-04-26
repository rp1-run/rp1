import { useCallback, useEffect, useRef, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import { getSocraticDuelEventLabel } from "@/lib/socratic-duel-status";
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
	StateSnapshotMessage,
} from "@/types/websocket";
import {
	useLiveRunIndexBridge,
	useLiveRunIndexSnapshot,
} from "./useLiveRunIndex";

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

function mergeLiveRunSummary(run: Run, summary: Run): Run {
	return {
		...run,
		projectId: summary.projectId,
		projectName: summary.projectName,
		featureId: summary.featureId,
		featureName: summary.featureName,
		name: summary.name ?? run.name,
		command: summary.command,
		status: summary.status,
		harness: summary.harness ?? run.harness,
		currentStep: summary.currentStep ?? run.currentStep,
		startedAt: summary.startedAt,
		lastEventAt: summary.lastEventAt ?? run.lastEventAt ?? run.startedAt,
		completedAt: summary.completedAt ?? run.completedAt,
		statusMessage: summary.statusMessage ?? run.statusMessage ?? null,
		error: summary.error ?? run.error,
	};
}

function getCachedRun(runId: string | undefined): Run | null {
	if (!runId) return null;

	const cachedRun = runDetailCache.get(runId) ?? null;
	if (cachedRun?.id === runId) return cachedRun;
	if (cachedRun) runDetailCache.delete(runId);
	return null;
}

function cacheRunForId(runId: string, run: Run): void {
	if (run.id !== runId) return;
	runDetailCache.set(runId, run);
}

function snapshotMayAffectRun(
	currentRun: Run,
	socketProjectId: string | null,
	message: StateSnapshotMessage,
): boolean {
	if (message.runs.some((snapshotRun) => snapshotRun.id === currentRun.id)) {
		return true;
	}

	return socketProjectId === currentRun.projectId;
}

function mergeArtifactRegistration(
	artifacts: readonly Artifact[],
	incoming: Artifact,
): readonly Artifact[] {
	const existingIndex = artifacts.findIndex(
		(artifact) => artifact.docId === incoming.docId,
	);

	if (existingIndex === -1) {
		return [...artifacts, incoming];
	}

	return artifacts.map((artifact, index) =>
		index === existingIndex
			? {
					...artifact,
					path: incoming.path,
					type: incoming.type,
					updatedDuringRun: true,
					isNew: true,
					step: artifact.step ?? incoming.step,
				}
			: artifact,
	);
}

function updateReconciledArtifactPath(
	artifacts: readonly Artifact[],
	docId: string,
	path: string,
): readonly Artifact[] {
	return artifacts.map((artifact) =>
		artifact.docId === docId
			? {
					...artifact,
					path,
				}
			: artifact,
	);
}

export function useRunDetail(runId: string | undefined): UseRunDetailResult {
	const [run, setRun] = useState<Run | null>(() => getCachedRun(runId));
	const [isLoading, setIsLoading] = useState(() =>
		runId ? getCachedRun(runId) === null : false,
	);
	const [error, setError] = useState<Error | null>(null);
	const {
		onEventNotification,
		onStateSnapshot,
		projectId: socketProjectId,
		status: wsStatus,
	} = useWebSocket();
	const prevWsStatusRef = useRef<ConnectionStatus>(wsStatus);
	const activeRunIdRef = useRef<string | null>(runId ?? null);
	const fetchRequestIdRef = useRef(0);
	const runRef = useRef<Run | null>(null);
	activeRunIdRef.current = runId ?? null;
	useLiveRunIndexBridge();
	const liveSnapshot = useLiveRunIndexSnapshot();

	const fetchRun = useCallback(async () => {
		const requestedRunId = runId;
		const requestId = ++fetchRequestIdRef.current;
		const isActiveRequest = () =>
			activeRunIdRef.current === requestedRunId &&
			fetchRequestIdRef.current === requestId;

		if (!requestedRunId) {
			setRun(null);
			runRef.current = null;
			setIsLoading(false);
			return;
		}

		try {
			const response = await fetch(`/api/v2/runs/${requestedRunId}`);
			if (!isActiveRequest()) return;
			if (!response.ok) {
				if (response.status === 404) {
					runDetailCache.delete(requestedRunId);
					throw new Error("Run not found");
				}
				throw new Error(`Failed to fetch run: ${response.statusText}`);
			}
			const runData = (await response.json()) as Run;
			if (!isActiveRequest()) return;
			if (runData.id !== requestedRunId) {
				throw new Error("Run response did not match requested run");
			}
			setRun(runData);
			runRef.current = runData;
			cacheRunForId(requestedRunId, runData);
			liveRunIndex.upsertRun(runData);
			setError(null);
		} catch (err) {
			if (!isActiveRequest()) return;
			const nextError = err instanceof Error ? err : new Error(String(err));
			const currentRun = runRef.current;
			const shouldKeepStaleRun =
				currentRun?.id === requestedRunId &&
				nextError.message !== "Run not found";
			if (!shouldKeepStaleRun) {
				setError(nextError);
				setRun(null);
				runRef.current = null;
			}
		} finally {
			if (isActiveRequest()) {
				setIsLoading(false);
			}
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

		const cachedRun = getCachedRun(runId);
		setRun(cachedRun);
		runRef.current = cachedRun;
		setError(null);
		setIsLoading(cachedRun === null);
		void fetchRun();
	}, [runId, fetchRun]);

	useEffect(() => {
		if (!runId || !run || run.id !== runId) return;
		cacheRunForId(runId, run);
	}, [runId, run]);

	useEffect(() => {
		runRef.current = runId && run?.id === runId ? run : null;
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
				const stepStatus = data?.status as string | undefined;
				const step = msg.step;
				const fallbackRunStatus =
					(step === null || step === undefined) && msg.unit == null
						? (stepStatus ?? null)
						: null;
				const nextStatus = (msg.runStatus ??
					fallbackRunStatus) as RunStatus | null;
				const rawStatusMessage =
					typeof data?.message === "string" ? data.message : undefined;

				if (step || stepStatus || nextStatus || rawStatusMessage) {
					setRun((prev) => {
						if (!prev || prev.id !== runId) return prev;

						let updatedSteps = prev.steps;
						if (step && stepStatus && !msg.unit) {
							updatedSteps = prev.steps.map((s) =>
								s.id === step ? { ...s, status: stepStatus as StepStatus } : s,
							);
						}

						const isTerminal =
							nextStatus != null && TERMINAL_RUN_STATUSES.has(nextStatus);
						const statusMessage =
							getSocraticDuelEventLabel(prev.command, step, data) ??
							rawStatusMessage;
						const shouldClearLifecycleMessage =
							nextStatus !== null &&
							nextStatus !== prev.status &&
							statusMessage === undefined &&
							nextStatus !== "failed";

						return {
							...prev,
							steps: updatedSteps,
							...(step ? { currentStep: step } : {}),
							...(nextStatus !== null && {
								status: nextStatus,
							}),
							...(statusMessage !== undefined && {
								statusMessage,
								...(nextStatus === "failed" && rawStatusMessage
									? { error: rawStatusMessage }
									: {}),
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
					nextStatus !== null && TERMINAL_RUN_STATUSES.has(nextStatus);
				if (isTerminal) {
					setTimeout(fetchRun, 1000);
				}
			}

			if (msg.eventType === "artifact_registered") {
				const data = msg.data as Record<string, unknown> | null;
				const docId = typeof data?.docId === "string" ? data.docId : "";
				const path = typeof data?.path === "string" ? data.path : "";

				if (!docId || !path) return;

				if (data?.reconciled) {
					shouldRefetch = false;
					setRun((prev) => {
						if (!prev || prev.id !== runId) return prev;
						return {
							...prev,
							artifacts: updateReconciledArtifactPath(
								prev.artifacts,
								docId,
								path,
							),
						};
					});
				} else {
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
						if (!prev || prev.id !== runId) return prev;
						return {
							...prev,
							artifacts: mergeArtifactRegistration(prev.artifacts, newArtifact),
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
					if (!prev || prev.id !== runId) return prev;
					return {
						...prev,
						steps: prev.steps.map((step) =>
							msg.step && step.id === msg.step
								? { ...step, status: "waiting" as StepStatus }
								: step,
						),
						status: (msg.runStatus ?? "waiting") as RunStatus,
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
					if (!prev || prev.id !== runId) return prev;
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

	useEffect(() => {
		if (!runId) {
			return;
		}

		void liveSnapshot;
		const currentRun = runRef.current;
		if (!currentRun) {
			return;
		}

		const liveSummary = liveRunIndex.getRun(runId);
		if (!liveSummary) {
			return;
		}

		setRun((prev) => {
			if (!prev || prev.id !== runId) {
				return prev;
			}

			const nextRun = mergeLiveRunSummary(prev, liveSummary);
			if (
				nextRun.projectName === prev.projectName &&
				nextRun.featureName === prev.featureName &&
				nextRun.name === prev.name &&
				nextRun.command === prev.command &&
				nextRun.status === prev.status &&
				nextRun.harness === prev.harness &&
				nextRun.currentStep === prev.currentStep &&
				nextRun.lastEventAt === prev.lastEventAt &&
				nextRun.completedAt === prev.completedAt &&
				nextRun.statusMessage === prev.statusMessage &&
				nextRun.error === prev.error
			) {
				return prev;
			}

			return nextRun;
		});
	}, [liveSnapshot, runId]);

	useEffect(() => {
		if (!runId) {
			return;
		}

		return onStateSnapshot((message) => {
			const currentRun = runRef.current;
			if (
				!currentRun ||
				!snapshotMayAffectRun(currentRun, socketProjectId, message)
			) {
				return;
			}
			void fetchRun();
		});
	}, [fetchRun, onStateSnapshot, runId, socketProjectId]);

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

	const visibleRun = runId && run?.id === runId ? run : null;
	const visibleError = run && runId && run.id !== runId ? null : error;
	const visibleIsLoading =
		runId && !visibleRun && !visibleError ? true : isLoading;

	return {
		run: visibleRun,
		isLoading: visibleIsLoading,
		error: visibleError,
		refetch,
	};
}
