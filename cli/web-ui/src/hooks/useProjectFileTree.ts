import { useCallback, useEffect, useState } from "react";
import type { FileNode } from "../server/routes/content-utils";
import { useReconnectRecovery } from "./useReconnectRecovery";

export type { FileNode };

const projectFileTreeCache = new Map<string, FileNode[]>();

interface UseProjectFileTreeResult {
	tree: FileNode[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function useProjectFileTree(
	projectId: string | undefined,
): UseProjectFileTreeResult {
	const [tree, setTree] = useState<FileNode[]>(() =>
		projectId ? (projectFileTreeCache.get(projectId) ?? []) : [],
	);
	const [loading, setLoading] = useState(() =>
		projectId ? !projectFileTreeCache.has(projectId) : false,
	);
	const [error, setError] = useState<string | null>(null);

	const fetchTree = useCallback(async () => {
		if (!projectId) {
			setTree([]);
			setLoading(false);
			return;
		}

		setError(null);

		try {
			const response = await fetch(
				`/api/v2/projects/${encodeURIComponent(projectId)}/files`,
			);
			if (!response.ok) {
				if (response.status === 410) {
					projectFileTreeCache.delete(projectId);
					throw new Error(`Project unavailable: ${projectId}`);
				}
				throw new Error(`Failed to fetch file tree: ${response.statusText}`);
			}
			const data = (await response.json()) as FileNode[];
			projectFileTreeCache.set(projectId, data);
			setTree(data);
			setError(null);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			const shouldKeepStaleTree =
				projectFileTreeCache.has(projectId) &&
				!message.startsWith("Project unavailable:");
			if (!shouldKeepStaleTree) {
				setError(message);
				setTree([]);
			}
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		if (!projectId) {
			setTree([]);
			setError(null);
			setLoading(false);
			return;
		}

		const cachedTree = projectFileTreeCache.get(projectId) ?? [];
		setTree(cachedTree);
		setError(null);
		setLoading(!projectFileTreeCache.has(projectId));
		void fetchTree();
	}, [projectId, fetchTree]);

	useReconnectRecovery(fetchTree);

	return {
		tree,
		loading,
		error,
		refetch: fetchTree,
	};
}
