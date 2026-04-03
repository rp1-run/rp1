import { describe, expect, test } from "bun:test";
import { filterAnnotationsForArtifactScope } from "../../hooks/useAnnotations";
import type { Annotation } from "../../types/annotations";

const annotations: readonly Annotation[] = [
	{
		id: "1",
		docId: "doc-1",
		artifactPath: "work/original.md",
		anchor: {
			type: "line",
			lineNumber: 1,
			lineContent: "line 1",
		},
		content: "First",
		status: "open",
		author: "user",
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		replies: [],
		orphaned: false,
	},
	{
		id: "2",
		docId: "doc-2",
		artifactPath: "work/current.md",
		anchor: {
			type: "line",
			lineNumber: 2,
			lineContent: "line 2",
		},
		content: "Second",
		status: "open",
		author: "user",
		createdAt: "2026-04-01T00:00:00.000Z",
		updatedAt: "2026-04-01T00:00:00.000Z",
		replies: [],
		orphaned: false,
	},
];

describe("filterAnnotationsForArtifactScope", () => {
	test("keeps doc-scoped annotations visible even if artifact paths changed", () => {
		expect(
			filterAnnotationsForArtifactScope(annotations, {
				artifactPath: "work/current.md",
				scopedDocId: "doc-1",
			}),
		).toEqual(annotations);
	});

	test("filters by artifact path when doc identity is unavailable", () => {
		expect(
			filterAnnotationsForArtifactScope(annotations, {
				artifactPath: "work/current.md",
				scopedDocId: null,
			}),
		).toEqual([annotations[1]]);
	});
});
