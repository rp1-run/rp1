import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, renderHook, waitFor } from "@testing-library/react";

let useProjectFileTreeImportVersion = 0;

async function loadUseProjectFileTree() {
	mock.module("../../hooks/useReconnectRecovery", () => ({
		useReconnectRecovery: () => {},
	}));

	return import(
		`../../hooks/useProjectFileTree.ts?use-project-file-tree-test=${++useProjectFileTreeImportVersion}`
	);
}

describe("useProjectFileTree", () => {
	beforeEach(() => {
		mock.restore();
		global.fetch = mock(async () => ({
			ok: true,
			json: async () => [
				{
					name: "docs",
					path: "docs",
					type: "directory",
					children: [],
				},
			],
		})) as unknown as typeof fetch;
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("reuses cached tree data across remounts without returning to loading", async () => {
		const { useProjectFileTree } = await loadUseProjectFileTree();
		const firstRender = renderHook(() => useProjectFileTree("proj-1"));

		await waitFor(() => {
			expect(firstRender.result.current.loading).toBe(false);
		});
		expect(firstRender.result.current.tree).toHaveLength(1);

		firstRender.unmount();

		global.fetch = mock(
			() => new Promise<Response>(() => {}),
		) as unknown as typeof fetch;

		const secondRender = renderHook(() => useProjectFileTree("proj-1"));

		expect(secondRender.result.current.loading).toBe(false);
		expect(secondRender.result.current.tree).toHaveLength(1);
	});
});
