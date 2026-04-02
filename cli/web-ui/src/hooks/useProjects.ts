/**
 * Hook for fetching project list from V2 API.
 * Used by ProjectsPage for displaying registered projects.
 */

import { useCallback, useEffect, useState } from "react";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { V2Project } from "@/types/projects";
import { useReconnectRecovery } from "./useReconnectRecovery";

export type { V2Project };

interface ProjectsResponse {
	projects: V2Project[];
}

interface UseProjectsReturn {
	projects: V2Project[];
	isLoading: boolean;
	error: Error | null;
	refetch: () => void;
}

export function useProjects(): UseProjectsReturn {
	const [projects, setProjects] = useState<V2Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const { onProjectsChange } = useWebSocket();

	const fetchProjects = useCallback(async () => {
		try {
			const response = await fetch("/api/v2/projects");

			if (!response.ok) {
				throw new Error(`Failed to fetch projects: ${response.statusText}`);
			}

			const data = (await response.json()) as ProjectsResponse;
			const sorted = [...data.projects].sort((a, b) => {
				// Projects with no activity sink to the bottom
				if (!a.lastActivityAt && !b.lastActivityAt) return 0;
				if (!a.lastActivityAt) return 1;
				if (!b.lastActivityAt) return -1;
				// Most recent activity first
				return b.lastActivityAt.localeCompare(a.lastActivityAt);
			});
			setProjects(sorted);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProjects();
	}, [fetchProjects]);

	useEffect(() => {
		return onProjectsChange(() => {
			void fetchProjects();
		});
	}, [fetchProjects, onProjectsChange]);

	useReconnectRecovery(fetchProjects);

	const refetch = useCallback(() => {
		setIsLoading(true);
		fetchProjects();
	}, [fetchProjects]);

	return {
		projects,
		isLoading,
		error,
		refetch,
	};
}
