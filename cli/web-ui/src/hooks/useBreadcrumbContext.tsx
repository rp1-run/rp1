import type { ReactNode } from "react";
import { createContext, useCallback, useContext, useState } from "react";

interface BreadcrumbContextValue {
	readonly artifactPath: string | null;
	readonly runId: string | null;
	readonly projectName: string | null;
	readonly setActiveArtifact: (runId: string, path: string | null) => void;
	readonly setProjectName: (name: string | null) => void;
}

const BreadcrumbContext = createContext<BreadcrumbContextValue>({
	artifactPath: null,
	runId: null,
	projectName: null,
	setActiveArtifact: () => {},
	setProjectName: () => {},
});

export function BreadcrumbProvider({
	children,
}: {
	readonly children: ReactNode;
}) {
	const [artifactPath, setArtifactPath] = useState<string | null>(null);
	const [runId, setRunId] = useState<string | null>(null);
	const [projectName, setProjectNameState] = useState<string | null>(null);

	const setActiveArtifact = useCallback((rid: string, path: string | null) => {
		setRunId(rid);
		setArtifactPath(path);
	}, []);

	const setProjectName = useCallback((name: string | null) => {
		setProjectNameState(name);
	}, []);

	return (
		<BreadcrumbContext.Provider
			value={{
				artifactPath,
				runId,
				projectName,
				setActiveArtifact,
				setProjectName,
			}}
		>
			{children}
		</BreadcrumbContext.Provider>
	);
}

export function useBreadcrumbContext() {
	return useContext(BreadcrumbContext);
}
