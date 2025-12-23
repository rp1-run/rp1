import { useCallback, useEffect, useState } from "react";
import type { FileNode } from "../server/routes/api";

interface UseFileTreeResult {
	tree: FileNode[];
	loading: boolean;
	error: string | null;
	refetch: () => Promise<void>;
}

export function useFileTree(): UseFileTreeResult {
	const [tree, setTree] = useState<FileNode[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchTree = useCallback(async () => {
		setLoading(true);
		setError(null);

		try {
			const response = await fetch("/api/files");
			if (!response.ok) {
				throw new Error(`Failed to fetch file tree: ${response.statusText}`);
			}
			const data = await response.json();
			setTree(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
		}
	}, []);

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
