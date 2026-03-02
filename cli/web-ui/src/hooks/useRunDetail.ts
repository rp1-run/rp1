import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact, Run, RunEvent, Step } from "@/types/runs";
import type { RunMessage, StatusChangedMessage } from "@/types/websocket";

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
	const { subscribeToRun, onStatusChange } = useWebSocket();
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

	useEffect(() => {
		if (!runId) return;

		const handleRunMessage = (message: RunMessage) => {
			setRun((currentRun) => {
				if (!currentRun) return null;

				switch (message.type) {
					case "run:status":
						return {
							...currentRun,
							status: message.status,
							currentStep: message.currentStep,
						};

					case "run:step": {
						const updatedSteps = currentRun.steps.map((step) =>
							step.id === message.stepId
								? { ...step, status: message.status }
								: step,
						) as readonly Step[];
						return { ...currentRun, steps: updatedSteps };
					}

					case "run:artifact": {
						const existingIndex = currentRun.artifacts.findIndex(
							(a) => a.path === message.artifact.path,
						);
						let updatedArtifacts: readonly Artifact[];
						if (existingIndex >= 0) {
							updatedArtifacts = currentRun.artifacts.map((a, i) =>
								i === existingIndex ? message.artifact : a,
							) as readonly Artifact[];
						} else {
							updatedArtifacts = [...currentRun.artifacts, message.artifact];
						}
						return { ...currentRun, artifacts: updatedArtifacts };
					}

					case "run:event": {
						const updatedEvents = [
							...currentRun.events,
							message.event,
						] as readonly RunEvent[];
						return { ...currentRun, events: updatedEvents };
					}

					default:
						return currentRun;
				}
			});
		};

		const unsubscribe = subscribeToRun(runId, handleRunMessage);
		return unsubscribe;
	}, [runId, subscribeToRun]);

	// Subscribe to status_changed events to trigger refetch when the matching
	// feature receives a status update. This handles state-machine-enabled
	// workflows where the WebSocket run:step/run:status messages use a
	// different runId format than the frontend composite ID.
	useEffect(() => {
		if (!runId) return;

		const handleStatusChange = (msg: StatusChangedMessage) => {
			const currentRun = runRef.current;
			if (!currentRun) return;

			if (
				msg.feature === currentRun.featureId &&
				msg.projectId === currentRun.projectId
			) {
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
