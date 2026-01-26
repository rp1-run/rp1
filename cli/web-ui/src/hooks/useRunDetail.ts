import { useCallback, useEffect, useState } from "react";
import type { Run, Step, Artifact, RunEvent } from "@/types/runs";
import type { RunMessage } from "@/types/websocket";
import { useWebSocket } from "@/providers/WebSocketProvider";

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
  const { subscribeToRun } = useWebSocket();

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
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setRun(null);
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
                : step
            ) as readonly Step[];
            return { ...currentRun, steps: updatedSteps };
          }

          case "run:artifact": {
            const existingIndex = currentRun.artifacts.findIndex(
              (a) => a.path === message.artifact.path
            );
            let updatedArtifacts: readonly Artifact[];
            if (existingIndex >= 0) {
              updatedArtifacts = currentRun.artifacts.map((a, i) =>
                i === existingIndex ? message.artifact : a
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
