import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { forwardRef, type ReactNode, useState } from "react";

let importVersion = 0;

mock.module("@/components/MilkdownEditor/MilkdownEditor", () => ({
	MilkdownEditor: forwardRef<
		HTMLDivElement,
		{
			content: string;
			onContentChange?: (markdown: string) => void;
		}
	>(({ content, onContentChange }, ref) => {
		const [editorContent] = useState(content);
		return (
			<div ref={ref} data-testid="milkdown-editor">
				{editorContent}
				<button
					type="button"
					onClick={() =>
						onContentChange?.(editorContent.replace("Visible", "Edited"))
					}
				>
					Edit
				</button>
			</div>
		);
	}),
}));

mock.module("@/components/MarkdownViewer", () => ({
	MarkdownViewer: ({ content }: { content: string }) => (
		<div data-testid="markdown-viewer">{content}</div>
	),
}));

mock.module("@/components/MarkdownViewer/MarkdownViewer", () => ({
	AnnotationLayer: ({ children }: { children?: ReactNode }) => <>{children}</>,
}));

describe("UnifiedContentRenderer", () => {
	beforeEach(() => {
		mock.restore();
		document.body.innerHTML = "";
	});

	afterEach(() => {
		cleanup();
		mock.restore();
	});

	test("hides frontmatter by default", async () => {
		const { UnifiedContentRenderer } = await import(
			`../../../components/v2/UnifiedContentRenderer.tsx?renderer-test=${++importVersion}`
		);

		render(
			<UnifiedContentRenderer
				content={`---\ntitle: Test Doc\n---\n# Hello`}
				path="docs/test.md"
			/>,
		);

		expect(screen.queryByText("Frontmatter")).toBeNull();
		expect(screen.getByTestId("milkdown-editor")).toBeTruthy();
	});

	test("shows frontmatter when enabled", async () => {
		const { UnifiedContentRenderer } = await import(
			`../../../components/v2/UnifiedContentRenderer.tsx?renderer-test=${++importVersion}`
		);

		render(
			<UnifiedContentRenderer
				content={`---\ntitle: Test Doc\n---\n# Hello`}
				path="docs/test.md"
				showFrontmatter
			/>,
		);

		expect(screen.getByText("Frontmatter")).toBeTruthy();
	});

	test("hides markdown html comments by default", async () => {
		const { UnifiedContentRenderer } = await import(
			`../../../components/v2/UnifiedContentRenderer.tsx?renderer-test=${++importVersion}`
		);

		render(
			<UnifiedContentRenderer
				content={`# Hello\n\n<!-- internal metadata -->\n\nVisible`}
				path="docs/test.md"
			/>,
		);

		const editor = screen.getByTestId("milkdown-editor");
		expect(editor.textContent).not.toContain("internal metadata");
		expect(editor.textContent).toContain("Visible");
	});

	test("shows markdown html comments with frontmatter visibility enabled", async () => {
		const { UnifiedContentRenderer } = await import(
			`../../../components/v2/UnifiedContentRenderer.tsx?renderer-test=${++importVersion}`
		);

		render(
			<UnifiedContentRenderer
				content={`# Hello\n\n<!-- internal metadata -->\n\nVisible`}
				path="docs/test.md"
				showFrontmatter
			/>,
		);

		expect(screen.getByTestId("milkdown-editor").textContent).toContain(
			"internal metadata",
		);
	});

	test("remounts the markdown editor when the selected artifact changes", async () => {
		const { UnifiedContentRenderer } = await import(
			`../../../components/v2/UnifiedContentRenderer.tsx?renderer-test=${++importVersion}`
		);

		const view = render(
			<UnifiedContentRenderer
				content="# Requirements"
				path=".rp1/work/features/example/requirements.md"
				runId="run-1"
				docId="doc-requirements"
			/>,
		);

		expect(screen.getByTestId("milkdown-editor").textContent).toContain(
			"# Requirements",
		);

		view.rerender(
			<UnifiedContentRenderer
				content="# Tasks"
				path=".rp1/work/features/example/tasks.md"
				runId="run-1"
				docId="doc-tasks"
			/>,
		);

		expect(screen.getByTestId("milkdown-editor").textContent).toContain(
			"# Tasks",
		);
		expect(screen.getByTestId("milkdown-editor").textContent).not.toContain(
			"# Requirements",
		);
	});
});
