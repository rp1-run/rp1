import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { forwardRef, type ReactNode } from "react";

let importVersion = 0;

mock.module("@/components/MilkdownEditor/MilkdownEditor", () => ({
	MilkdownEditor: forwardRef<
		HTMLDivElement,
		{
			content: string;
			onContentChange?: (markdown: string) => void;
		}
	>(({ content, onContentChange }, ref) => (
		<div ref={ref} data-testid="milkdown-editor">
			{content}
			<button
				type="button"
				onClick={() => onContentChange?.(content.replace("Visible", "Edited"))}
			>
				Edit
			</button>
		</div>
	)),
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
});
