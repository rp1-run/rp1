import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import type { LineDiffEntry } from "@/lib/diff-engine";
import type { Annotation, CreateAnnotationRequest } from "@/types/annotations";

let mockCreateAnnotation: ReturnType<typeof mock>;
let mockResolveAnnotation: ReturnType<typeof mock>;
let mockDeleteAnnotation: ReturnType<typeof mock>;
let createdIdCounter = 0;

function makeAnnotation(
	request: CreateAnnotationRequest,
	id?: string,
): Annotation {
	return {
		id: id ?? `anno-${++createdIdCounter}`,
		docId: request.docId,
		artifactPath: request.artifactPath,
		anchor: request.anchor,
		content: request.content,
		status: "open",
		author: "user",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		replies: [],
		orphaned: false,
	};
}

beforeEach(() => {
	createdIdCounter = 0;
	mockCreateAnnotation = mock((req: CreateAnnotationRequest) =>
		Promise.resolve(makeAnnotation(req)),
	);
	mockResolveAnnotation = mock(() => Promise.resolve());
	mockDeleteAnnotation = mock(() => Promise.resolve());
});

mock.module("@/providers/AnnotationProvider", () => ({
	useAnnotationContextSafe: () => ({
		annotations: [],
		isLoading: false,
		error: null,
		filter: { status: "all", author: null, dateRange: "all" },
		selectedAnnotationId: null,
		docId: null,
		setFilter: () => {},
		selectAnnotation: () => {},
		createAnnotation: (...args: unknown[]) => mockCreateAnnotation(...args),
		resolveAnnotation: (...args: unknown[]) => mockResolveAnnotation(...args),
		reopenAnnotation: () => Promise.resolve(),
		deleteAnnotation: (...args: unknown[]) => mockDeleteAnnotation(...args),
		addReply: () => Promise.resolve(),
		getAnnotationsForArtifact: () => [],
		refetch: () => Promise.resolve(),
	}),
}));

async function flushPromises() {
	await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("useEditAnnotations", () => {
	test("creates annotation when diffs contain non-unchanged entries", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: "doc-1",
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		const diffs: LineDiffEntry[] = [
			{ type: "unchanged", line: 1, before: "hello", after: "hello" },
			{ type: "modified", line: 2, before: "old", after: "new" },
			{ type: "added", line: 3, before: null, after: "extra" },
		];

		act(() => {
			result.current.handleDiffUpdate(diffs, "hash-abc");
		});
		await flushPromises();

		expect(mockCreateAnnotation).toHaveBeenCalledTimes(1);
		const call = mockCreateAnnotation.mock.calls[0] as [
			CreateAnnotationRequest,
		];
		expect(call[0].docId).toBe("doc-1");
		expect(call[0].runId).toBe("run-1");
		expect(call[0].artifactPath).toBe("path/to/file.md");
		expect(call[0].content).toBe("[edit] Modified 1 line, added 1 line");
		expect(call[0].anchor.type).toBe("edit-diff");
		if (call[0].anchor.type === "edit-diff") {
			expect(call[0].anchor.diffs).toHaveLength(2);
			expect(call[0].anchor.baselineHash).toBe("hash-abc");
		}
	});

	test("does not create annotation when all entries are unchanged", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: "doc-1",
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		const diffs: LineDiffEntry[] = [
			{ type: "unchanged", line: 1, before: "a", after: "a" },
			{ type: "unchanged", line: 2, before: "b", after: "b" },
		];

		act(() => {
			result.current.handleDiffUpdate(diffs, "hash-abc");
		});
		await flushPromises();

		expect(mockCreateAnnotation).not.toHaveBeenCalled();
	});

	test("resolves annotation when changes are reverted", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: "doc-1",
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		const diffs: LineDiffEntry[] = [
			{ type: "added", line: 1, before: null, after: "new line" },
		];

		act(() => {
			result.current.handleDiffUpdate(diffs, "hash-abc");
		});
		await flushPromises();

		expect(mockCreateAnnotation).toHaveBeenCalledTimes(1);

		const revertDiffs: LineDiffEntry[] = [
			{ type: "unchanged", line: 1, before: "a", after: "a" },
		];

		act(() => {
			result.current.handleDiffUpdate(revertDiffs, "hash-abc");
		});
		await flushPromises();

		expect(mockResolveAnnotation).toHaveBeenCalledTimes(1);
		expect(mockResolveAnnotation.mock.calls[0]).toEqual(["anno-1"]);
	});

	test("deletes old annotation and creates new one on subsequent diff updates", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: "doc-1",
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		act(() => {
			result.current.handleDiffUpdate(
				[{ type: "added", line: 1, before: null, after: "line 1" }],
				"hash-1",
			);
		});
		await flushPromises();

		expect(mockCreateAnnotation).toHaveBeenCalledTimes(1);

		act(() => {
			result.current.handleDiffUpdate(
				[
					{ type: "added", line: 1, before: null, after: "line 1" },
					{ type: "modified", line: 2, before: "old", after: "new" },
				],
				"hash-1",
			);
		});
		await flushPromises();

		expect(mockDeleteAnnotation).toHaveBeenCalledTimes(1);
		expect(mockDeleteAnnotation.mock.calls[0]).toEqual(["anno-1"]);
		expect(mockCreateAnnotation).toHaveBeenCalledTimes(2);
	});

	test("generates correct summary with all diff types", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: "doc-1",
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		const diffs: LineDiffEntry[] = [
			{ type: "modified", line: 1, before: "a", after: "b" },
			{ type: "modified", line: 2, before: "c", after: "d" },
			{ type: "modified", line: 3, before: "e", after: "f" },
			{ type: "added", line: 4, before: null, after: "g" },
			{ type: "added", line: 5, before: null, after: "h" },
			{ type: "deleted", line: 6, before: "i", after: null },
		];

		act(() => {
			result.current.handleDiffUpdate(diffs, "hash-abc");
		});
		await flushPromises();

		const call = mockCreateAnnotation.mock.calls[0] as [
			CreateAnnotationRequest,
		];
		expect(call[0].content).toBe(
			"[edit] Modified 3 lines, added 2 lines, deleted 1 line",
		);
	});

	test("does nothing when docId is undefined", async () => {
		const { useEditAnnotations } = await import(
			"../../hooks/useEditAnnotations"
		);
		const { result } = renderHook(() =>
			useEditAnnotations({
				docId: undefined,
				runId: "run-1",
				artifactPath: "path/to/file.md",
			}),
		);

		act(() => {
			result.current.handleDiffUpdate(
				[{ type: "added", line: 1, before: null, after: "new" }],
				"hash-abc",
			);
		});
		await flushPromises();

		expect(mockCreateAnnotation).not.toHaveBeenCalled();
	});
});
