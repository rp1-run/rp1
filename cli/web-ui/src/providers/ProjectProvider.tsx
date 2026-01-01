/**
 * Project context provider for multi-project support.
 * Manages current project state and provides project switching functionality.
 */

import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type { ProjectEntry } from "../server/registry";

interface ProjectsResponse {
	projects: ProjectEntry[];
	lastInvoked: string | null;
}

interface ProjectContextValue {
	projects: ProjectEntry[];
	currentProjectId: string | null;
	currentProject: ProjectEntry | null;
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
	setCurrentProject: (projectId: string) => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
	const [projects, setProjects] = useState<ProjectEntry[]>([]);
	const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchProjects = useCallback(async () => {
		try {
			const response = await fetch("/api/projects");
			if (!response.ok) {
				throw new Error(`Failed to fetch projects: ${response.statusText}`);
			}
			const data = (await response.json()) as ProjectsResponse;
			setProjects(data.projects);

			// Set current project if not already set
			if (!currentProjectId && data.lastInvoked) {
				setCurrentProjectId(data.lastInvoked);
			} else if (!currentProjectId && data.projects.length > 0) {
				setCurrentProjectId(data.projects[0].id);
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [currentProjectId]);

	useEffect(() => {
		fetchProjects();
	}, [fetchProjects]);

	const setCurrentProject = useCallback((projectId: string) => {
		setCurrentProjectId(projectId);
	}, []);

	const currentProject =
		projects.find((p) => p.id === currentProjectId) ?? null;

	return (
		<ProjectContext.Provider
			value={{
				projects,
				currentProjectId,
				currentProject,
				loading,
				error,
				refetch: fetchProjects,
				setCurrentProject,
			}}
		>
			{children}
		</ProjectContext.Provider>
	);
}

export function useProjects(): ProjectContextValue {
	const context = useContext(ProjectContext);
	if (!context) {
		throw new Error("useProjects must be used within a ProjectProvider");
	}
	return context;
}
