import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import { highlight, highlightPluginConfig } from "@milkdown/plugin-highlight";
import { createParser } from "@milkdown/plugin-highlight/shiki";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { withLineNumbers } from "prosemirror-highlight";
import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import { getHighlighter, normalizeLanguage } from "../../lib/shiki";
import { createMermaidPlugin } from "./mermaid-plugin";

import "@milkdown/kit/prose/view/style/prosemirror.css";

export interface MilkdownEditorHandle {
	getEditorView: () => EditorView | undefined;
}

export interface MilkdownEditorProps {
	readonly content: string;
	readonly artifactPath: string;
	readonly docId?: string;
	readonly runId?: string;
	readonly onContentChange?: (markdown: string) => void;
}

function MilkdownEditorInner({
	content,
	onContentChange,
	editorRef,
}: Pick<MilkdownEditorProps, "content" | "onContentChange"> & {
	editorRef: React.Ref<MilkdownEditorHandle>;
}) {
	const viewRef = useRef<EditorView | undefined>(undefined);

	const [highlightConfig, setHighlightConfig] = useState<{
		parser: ReturnType<typeof createParser>;
		languageExtractor: (node: { attrs: { language?: string } }) => string;
	} | null>(null);

	useEffect(() => {
		let cancelled = false;
		getHighlighter().then((highlighter) => {
			if (cancelled) return;
			const parser = withLineNumbers(
				createParser(highlighter, {
					themes: { light: "min-light", dark: "min-dark" },
				}),
			);
			setHighlightConfig({
				parser,
				languageExtractor: (node: { attrs: { language?: string } }) =>
					normalizeLanguage(node.attrs.language || "typescript"),
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	const onChange = useCallback(
		(_ctx: unknown, markdown: string, prevMarkdown: string) => {
			if (markdown !== prevMarkdown) {
				onContentChange?.(markdown);
			}
		},
		[onContentChange],
	);

	useEditor(
		(root) => {
			const editor = Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, root);
					ctx.set(defaultValueCtx, content);
					ctx.get(listenerCtx).markdownUpdated(onChange);
					if (highlightConfig) {
						ctx.set(highlightPluginConfig.key, highlightConfig);
					}
				})
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(listener)
				.use(createMermaidPlugin());

			// Note: mermaid NodeView must come after commonmark (needs code_block schema)

			if (highlightConfig) {
				editor.use(highlight);
			}

			return editor;
		},
		[highlightConfig],
	);

	useImperativeHandle(
		editorRef,
		() => ({
			getEditorView: () => viewRef.current,
		}),
		[],
	);

	return <Milkdown />;
}

export const MilkdownEditor = forwardRef<
	MilkdownEditorHandle,
	MilkdownEditorProps
>(function MilkdownEditor({ content, onContentChange }, ref) {
	return (
		<MilkdownProvider>
			<div className="milkdown-editor-root">
				<MilkdownEditorInner
					content={content}
					onContentChange={onContentChange}
					editorRef={ref}
				/>
			</div>
		</MilkdownProvider>
	);
});
