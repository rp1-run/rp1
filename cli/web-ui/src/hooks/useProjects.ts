/**
 * Hook for fetching project list from V2 API.
 * Used by ProjectsPage for displaying registered projects.
 */

import { useCallback, useEffect, useState } from "react";

/**
 * V2 Project type for the projects list.
 */
export interface V2Project {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly available: boolean;
}

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

	const fetchProjects = useCallback(async () => {
		try {
			const response = await fetch("/api/v2/projects");

			if (!response.ok) {
				throw new Error(`Failed to fetch projects: ${response.statusText}`);
			}

			const data = (await response.json()) as ProjectsResponse;
			setProjects(data.projects);
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
