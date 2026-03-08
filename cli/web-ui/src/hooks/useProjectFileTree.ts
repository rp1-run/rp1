import { useCallback, useEffect, useState } from "react";
import type { FileNode } from "../server/routes/content-utils";

export type { FileNode };

interface UseProjectFileTreeResult {
	tree: FileNode[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function useProjectFileTree(
	projectId: string | undefined,
): UseProjectFileTreeResult {
	const [tree, setTree] = useState<FileNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchTree = useCallback(async () => {
		if (!projectId) {
			setTree([]);
			setLoading(false);
			return;
		}

		setLoading(true);
		setError(null);

		try {
			const response = await fetch(
				`/api/v2/projects/${encodeURIComponent(projectId)}/files`,
			);
			if (!response.ok) {
				if (response.status === 410) {
					throw new Error(`Project unavailable: ${projectId}`);
				}
				throw new Error(`Failed to fetch file tree: ${response.statusText}`);
			}
			const data = await response.json();
			setTree(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchTree();
	}, [fetchTree]);

	return {
		tree,
		loading,
		error,
		refetch: fetchTree,
	};
}
