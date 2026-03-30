import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

export interface RunInfo {
	readonly startedAt: string;
	readonly harness: string | null;
	readonly command: string;
	readonly displayName: string;
	readonly projectName: string;
}

interface BreadcrumbContextValue {
	readonly artifactPath: string | null;
	readonly runId: string | null;
	readonly projectName: string | null;
	readonly projectId: string | null;
	readonly runInfo: RunInfo | null;
	readonly setActiveArtifact: (runId: string, path: string | null) => void;
	readonly setProject: (id: string | null, name: string | null) => void;
	readonly setRunInfo: (info: RunInfo | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
	artifactPath: null,
	runId: null,
	projectName: null,
	projectId: null,
	runInfo: null,
	setActiveArtifact: () => {},
	setProject: () => {},
	setRunInfo: () => {},
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
	const [runInfo, setRunInfoState] = useState<RunInfo | null>(null);

	const setActiveArtifact = useCallback((rid: string, path: string | null) => {
		setRunId(rid);
		setArtifactPath(path);
	}, []);

	const setProject = useCallback((id: string | null, name: string | null) => {
		setProjectId(id);
		setProjectName(name);
	}, []);

	const setRunInfo = useCallback((info: RunInfo | null) => {
		setRunInfoState(info);
	}, []);

	return (
		<BreadcrumbContext.Provider
			value={{
				artifactPath,
				runId,
				projectName,
				projectId,
				runInfo,
				setActiveArtifact,
				setProject,
				setRunInfo,
			}}
		>
			{children}
		</BreadcrumbContext.Provider>
	);
}

export function useBreadcrumbContext() {
	return useContext(BreadcrumbContext);
}
