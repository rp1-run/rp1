import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

export interface RunInfo {
	readonly startedAt: string;
	readonly harness: string | null;
	readonly command: string;
	readonly displayName: string;
	readonly projectName: string;
	readonly projectId: string;
}

interface BreadcrumbContextValue {
	readonly artifactPath: string | null;
	readonly runId: string | null;
	readonly projectName: string | null;
	readonly projectId: string | null;
	readonly runInfo: RunInfo | null;
	readonly headerLeft: ReactNode | null;
	readonly headerRight: ReactNode | null;
	readonly setActiveArtifact: (runId: string, path: string | null) => void;
	readonly setProject: (id: string | null, name: string | null) => void;
	readonly setRunInfo: (info: RunInfo | null) => void;
	readonly setHeaderLeft: (node: ReactNode | null) => void;
	readonly setHeaderRight: (node: ReactNode | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
	artifactPath: null,
	runId: null,
	projectName: null,
	projectId: null,
	runInfo: null,
	headerLeft: null,
	headerRight: null,
	setActiveArtifact: () => {},
	setProject: () => {},
	setRunInfo: () => {},
	setHeaderLeft: () => {},
	setHeaderRight: () => {},
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
	const [headerLeft, setHeaderLeftState] = useState<ReactNode | null>(null);
	const [headerRight, setHeaderRightState] = useState<ReactNode | null>(null);

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

	const setHeaderLeft = useCallback((node: ReactNode | null) => {
		setHeaderLeftState(node);
	}, []);

	const setHeaderRight = useCallback((node: ReactNode | null) => {
		setHeaderRightState(node);
	}, []);

	return (
		<BreadcrumbContext.Provider
			value={{
				artifactPath,
				runId,
				projectName,
				projectId,
				runInfo,
				headerLeft,
				headerRight,
				setActiveArtifact,
				setProject,
				setRunInfo,
				setHeaderLeft,
				setHeaderRight,
			}}
		>
			{children}
		</BreadcrumbContext.Provider>
	);
}

export function useBreadcrumbContext() {
	return useContext(BreadcrumbContext);
}
