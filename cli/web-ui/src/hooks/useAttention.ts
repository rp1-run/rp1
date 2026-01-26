import { useCallback, useEffect, useState } from "react";
import type { AttentionData } from "@/types/runs";
import { useWebSocket } from "@/providers/WebSocketProvider";

interface UseAttentionResult {
  data: AttentionData | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useAttention(): UseAttentionResult {
  const [data, setData] = useState<AttentionData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const { subscribeToAttention } = useWebSocket();

  const fetchAttention = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/runs/attention");
      if (!response.ok) {
        throw new Error(`Failed to fetch attention data: ${response.statusText}`);
      }
      const attentionData = (await response.json()) as AttentionData;
      setData(attentionData);
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
    const unsubscribe = subscribeToAttention(() => {
      fetchAttention();
    });
    return unsubscribe;
  }, [subscribeToAttention, fetchAttention]);

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
