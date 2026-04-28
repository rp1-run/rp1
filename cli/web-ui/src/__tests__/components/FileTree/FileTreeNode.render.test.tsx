import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { FileTreeNode } from "../../../components/FileTree/FileTreeNode";
import type { FileNode } from "../../../server/routes/content-utils";

const directoryNode: FileNode = {
	name: "src",
	path: "src",
	type: "directory",
	children: [
		{
			name: "index.ts",
			path: "src/index.ts",
			type: "file",
		},
	],
};

const fileNode: FileNode = {
	name: "tasks.md",
	path: ".rp1/work/features/demo/tasks.md",
	type: "file",
};

describe("FileTreeNode interactions", () => {
	let onSelect: ReturnType<typeof mock>;
	let onToggleExpand: ReturnType<typeof mock>;
	let onFocusChange: ReturnType<typeof mock>;
	let writeText: ReturnType<typeof mock>;

	beforeEach(() => {
		onSelect = mock(() => {});
		onToggleExpand = mock(() => {});
		onFocusChange = mock(() => {});
		writeText = mock(async () => undefined);
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText },
		});
	});

	afterEach(() => {
		cleanup();
	});

	test("toggles directories from click and keyboard without selecting a file", () => {
		renderNode(directoryNode, {
			expandedPaths: new Set(),
			focusedPath: "src",
		});

		const directory = screen.getByRole("button", { name: "src" });
		expect(screen.getByRole("treeitem").getAttribute("aria-expanded")).toBe(
			"false",
		);

		fireEvent.click(directory);
		fireEvent.keyDown(directory, { key: "ArrowRight" });

		expect(onFocusChange).toHaveBeenCalledWith("src");
		expect(onToggleExpand).toHaveBeenCalledTimes(2);
		expect(onToggleExpand).toHaveBeenCalledWith("src");
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("renders expanded children and collapses directories with arrow-left", () => {
		renderNode(directoryNode, {
			expandedPaths: new Set(["src"]),
			focusedPath: "src",
		});

		const directory = screen.getByRole("button", { name: "src" });
		expect(
			screen.getAllByRole("treeitem")[0]?.getAttribute("aria-expanded"),
		).toBe("true");
		expect(screen.getByRole("group")).toBeTruthy();
		expect(screen.getByText("index.ts")).toBeTruthy();

		fireEvent.keyDown(directory, { key: "ArrowLeft" });

		expect(onToggleExpand).toHaveBeenCalledWith("src");
	});

	test("selects file nodes and copies project-qualified paths without selecting", async () => {
		renderNode(fileNode, {
			projectPath: "/Users/prem/Development/rp1",
			selectedPath: fileNode.path,
			focusedPath: fileNode.path,
		});

		const fileRow = screen.getByRole("button", { name: "tasks.md" });
		fireEvent.keyDown(fileRow, { key: "Enter" });

		expect(onFocusChange).toHaveBeenCalledWith(fileNode.path);
		expect(onSelect).toHaveBeenCalledWith(fileNode.path);

		onSelect.mockClear();
		fireEvent.click(
			screen.getByRole("button", { name: "Copy path for tasks.md" }),
		);

		await waitFor(() => {
			expect(writeText).toHaveBeenCalledWith(
				"/Users/prem/Development/rp1/.rp1/work/features/demo/tasks.md",
			);
		});
		expect(onSelect).not.toHaveBeenCalled();
	});

	test("ignores arrow-left for collapsed directories and arrow-right for expanded directories", () => {
		renderNode(directoryNode, {
			expandedPaths: new Set(["src"]),
			focusedPath: "src",
		});

		const directory = screen.getByRole("button", { name: "src" });
		fireEvent.keyDown(directory, { key: "ArrowRight" });

		expect(onToggleExpand).not.toHaveBeenCalled();
		cleanup();

		renderNode(directoryNode, {
			expandedPaths: new Set(),
			focusedPath: "src",
		});

		fireEvent.keyDown(screen.getByRole("button", { name: "src" }), {
			key: "ArrowLeft",
		});

		expect(onToggleExpand).not.toHaveBeenCalled();
	});

	function renderNode(
		node: FileNode,
		options: {
			expandedPaths?: Set<string>;
			selectedPath?: string | null;
			focusedPath?: string | null;
			projectPath?: string | null;
		} = {},
	) {
		return render(
			<FileTreeNode
				node={node}
				depth={0}
				selectedPath={options.selectedPath ?? null}
				onSelect={onSelect}
				expandedPaths={options.expandedPaths ?? new Set()}
				onToggleExpand={onToggleExpand}
				focusedPath={options.focusedPath ?? null}
				onFocusChange={onFocusChange}
				projectPath={options.projectPath}
			/>,
		);
	}
});
