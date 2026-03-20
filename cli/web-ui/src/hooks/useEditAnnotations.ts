import { useCallback, useEffect, useRef } from "react";
import type { LineDiffEntry } from "@/lib/diff-engine";
import { useAnnotationContextSafe } from "@/providers/AnnotationProvider";
import type { EditDiffAnchor } from "@/types/annotations";

interface UseEditAnnotationsOpts {
	readonly docId: string | undefined;
	readonly runId: string | undefined;
	readonly artifactPath: string;
}

interface UseEditAnnotationsResult {
	readonly handleDiffUpdate: (
		diffs: LineDiffEntry[],
		baselineHash: string,
	) => void;
}

function buildEditSummary(diffs: readonly LineDiffEntry[]): string {
	let modified = 0;
	let added = 0;
	let deleted = 0;

	for (const d of diffs) {
		switch (d.type) {
			case "modified":
				modified++;
				break;
			case "added":
				added++;
				break;
			case "deleted":
				deleted++;
				break;
		}
	}

	const parts: string[] = [];
	if (modified > 0)
		parts.push(`Modified ${modified} line${modified !== 1 ? "s" : ""}`);
	if (added > 0) parts.push(`added ${added} line${added !== 1 ? "s" : ""}`);
	if (deleted > 0)
		parts.push(`deleted ${deleted} line${deleted !== 1 ? "s" : ""}`);

	return `[edit] ${parts.join(", ")}`;
}

export function useEditAnnotations(
	opts: UseEditAnnotationsOpts,
): UseEditAnnotationsResult {
	const { docId, runId, artifactPath } = opts;
	const { createAnnotation, deleteAnnotation, getAnnotationsForArtifact } =
		useAnnotationContextSafe();

	const editAnnotationIdRef = useRef<string | null>(null);
	const pendingRef = useRef(false);
	const initializedRef = useRef(false);

	// On mount, find existing open edit annotation for this artifact
	useEffect(() => {
		if (initializedRef.current || !artifactPath) return;
		initializedRef.current = true;

		const existing = getAnnotationsForArtifact(artifactPath);
		for (const ann of existing) {
			if (ann.anchor.type === "edit-diff" && ann.status === "open") {
				editAnnotationIdRef.current = ann.id;
				break;
			}
		}
	}, [artifactPath, getAnnotationsForArtifact]);

	const handleDiffUpdate = useCallback(
		(diffs: LineDiffEntry[], baselineHash: string) => {
			if (!docId) return;
			if (pendingRef.current) return;

			const nonUnchanged = diffs.filter((d) => d.type !== "unchanged");

			if (nonUnchanged.length === 0) {
				// No changes in current session — don't create or modify annotations.
				// Existing annotations from previous sessions remain as-is.
				return;
			}

			const anchor: EditDiffAnchor = {
				type: "edit-diff",
				diffs: nonUnchanged,
				baselineHash,
			};

			const content = buildEditSummary(nonUnchanged);

			const upsert = async () => {
				pendingRef.current = true;
				try {
					if (editAnnotationIdRef.current) {
						try {
							await deleteAnnotation(editAnnotationIdRef.current);
						} catch {
							// Annotation may already be gone
						}
						editAnnotationIdRef.current = null;
					}

					const created = await createAnnotation({
						docId,
						artifactPath,
						anchor,
						content,
						runId,
					});
					editAnnotationIdRef.current = created.id;
				} catch {
					// Silently handle errors to avoid breaking the editing flow
				} finally {
					pendingRef.current = false;
				}
			};

			upsert();
		},
		[docId, runId, artifactPath, createAnnotation, deleteAnnotation],
	);

	return { handleDiffUpdate };
}
