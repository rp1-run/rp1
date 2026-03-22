import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

interface BreadcrumbContextValue {
	readonly artifactPath: string | null;
	readonly runId: string | null;
	readonly projectName: string | null;
	readonly projectId: string | null;
	readonly setActiveArtifact: (runId: string, path: string | null) => void;
	readonly setProject: (id: string | null, name: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
	artifactPath: null,
	runId: null,
	projectName: null,
	projectId: null,
	setActiveArtifact: () => {},
	setProject: () => {},
});

export function BreadcrumbProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [artifactPath, setArtifactPath] = useState<string | null>(null);
	const [runId, setRunId] = useState<string | null>(null);
	const [projectName, setProjectName] = useState<string | null>(null);
	const [projectId, setProjectId] = useState<string | null>(null);

	const setActiveArtifact = useCallback((rid: string, path: string | null) => {
		setRunId(rid);
		setArtifactPath(path);
	}, []);

	const setProject = useCallback((id: string | null, name: string | null) => {
		setProjectId(id);
		setProjectName(name);
	}, []);

	return (
		<BreadcrumbContext.Provider
			value={{
				artifactPath,
				runId,
				projectName,
				projectId,
				setActiveArtifact,
				setProject,
			}}
		>
			{children}
		</BreadcrumbContext.Provider>
	);
}

export function useBreadcrumbContext() {
	return useContext(BreadcrumbContext);
}
