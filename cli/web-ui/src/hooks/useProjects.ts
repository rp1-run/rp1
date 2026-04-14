/**
 * Hook for fetching project list from V2 API.
 * Used by ProjectsPage for displaying registered projects.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { liveRunIndex } from "@/lib/live-run-index";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { V2Project } from "@/types/projects";
import {
	useLiveRunIndexBridge,
	useLiveRunIndexSnapshot,
} from "./useLiveRunIndex";
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

function sortProjects(projects: readonly V2Project[]): V2Project[] {
	return [...projects].sort((a, b) => {
		if (!a.lastActivityAt && !b.lastActivityAt) return 0;
		if (!a.lastActivityAt) return 1;
		if (!b.lastActivityAt) return -1;
		return b.lastActivityAt.localeCompare(a.lastActivityAt);
	});
}

function areProjectsEqual(
	current: readonly V2Project[],
	next: readonly V2Project[],
): boolean {
	if (current.length !== next.length) {
		return false;
	}

	return current.every((project, index) => {
		const candidate = next[index];
		return (
			project.id === candidate?.id &&
			project.name === candidate?.name &&
			project.path === candidate?.path &&
			project.available === candidate?.available &&
			project.runCount === candidate?.runCount &&
			project.lastActivityAt === candidate?.lastActivityAt
		);
	});
}

export function useProjects(): UseProjectsReturn {
	const [projects, setProjects] = useState<V2Project[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	const knownRunIdsByProjectRef = useRef<Map<string, Set<string>>>(new Map());
	const { onProjectsChange } = useWebSocket();
	useLiveRunIndexBridge();
	const liveSnapshot = useLiveRunIndexSnapshot();

	const fetchProjects = useCallback(async () => {
		try {
			const response = await fetch("/api/v2/projects");

			if (!response.ok) {
				throw new Error(`Failed to fetch projects: ${response.statusText}`);
			}

			const data = (await response.json()) as ProjectsResponse;
			knownRunIdsByProjectRef.current = new Map(
				data.projects.map((project) => [
					project.id,
					new Set(liveRunIndex.getProjectRunIds(project.id)),
				]),
			);
			setProjects(sortProjects(data.projects));
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

	useEffect(() => {
		if (isLoading || projects.length === 0) {
			return;
		}

		void liveSnapshot;
		const nextProjects = sortProjects(
			projects.map((project) => {
				const knownRunIds =
					knownRunIdsByProjectRef.current.get(project.id) ?? new Set<string>();
				const liveRunIds = liveRunIndex.getProjectRunIds(project.id);
				let nextRunCount = project.runCount;

				for (const runId of liveRunIds) {
					if (knownRunIds.has(runId)) {
						continue;
					}
					knownRunIds.add(runId);
					nextRunCount += 1;
				}

				knownRunIdsByProjectRef.current.set(project.id, knownRunIds);

				const liveActivity = liveRunIndex.getLastActivityAt(project.id);
				const nextLastActivityAt =
					liveActivity &&
					(!project.lastActivityAt || liveActivity > project.lastActivityAt)
						? liveActivity
						: project.lastActivityAt;

				if (
					nextRunCount === project.runCount &&
					nextLastActivityAt === project.lastActivityAt
				) {
					return project;
				}

				return {
					...project,
					runCount: nextRunCount,
					lastActivityAt: nextLastActivityAt,
				};
			}),
		);

		if (!areProjectsEqual(projects, nextProjects)) {
			setProjects(nextProjects);
		}
	}, [isLoading, liveSnapshot, projects]);

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
