import { useState, useEffect, useCallback } from "react";
import type { FileContent } from "../server/routes/api";

interface UseFileContentResult {
  content: FileContent | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useFileContent(path: string | null): UseFileContentResult {
  const [content, setContent] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchContent = useCallback(async () => {
    if (!path) {
      setContent(null);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/content/${path}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(`Failed to fetch content: ${response.statusText}`);
      }
      const data = await response.json();
      setContent(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setContent(null);
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    fetchContent();
  }, [fetchContent]);

  return {
    content,
    loading,
    error,
    refetch: fetchContent,
  };
}
