import { parserCtx } from "@milkdown/core";
import {
	defaultValueCtx,
	Editor,
	editorViewCtx,
	rootCtx,
} from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { type Node as ProseNode, Slice } from "@milkdown/kit/prose/model";
import {
	type Selection as ProseSelection,
	Selection,
	TextSelection,
} from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { getMarkdown } from "@milkdown/kit/utils";
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
import { createContextMenuSelectionPlugin } from "./context-menu-selection-plugin";
import { createLinkClickPlugin } from "./link-click-plugin";
import { createMermaidPlugin } from "./mermaid-plugin";

import "@milkdown/kit/prose/view/style/prosemirror.css";

// Kick off the shared highlighter load as soon as this module is evaluated,
// so it is (almost always) resolved before the first editor mounts.
void getHighlighter();

interface HighlightConfig {
	parser: ReturnType<typeof createParser>;
	languageExtractor: (node: { attrs: { language?: string } }) => string;
}

/**
 * Resolve the Shiki-backed highlight config once per app session.
 * The editor is created only after this resolves: adding the highlight
 * plugin later would require tearing down and recreating the editor,
 * which destroys the user's selection and any in-progress annotation.
 */
function useHighlightConfig(): HighlightConfig | null {
	const [config, setConfig] = useState<HighlightConfig | null>(null);

	useEffect(() => {
		let cancelled = false;
		getHighlighter().then((highlighter) => {
			if (cancelled) return;
			const parser = withLineNumbers(
				createParser(highlighter, {
					themes: { light: "min-light", dark: "min-dark" },
				}),
			);
			setConfig({
				parser,
				languageExtractor: (node: { attrs: { language?: string } }) =>
					normalizeLanguage(node.attrs.language || "typescript"),
			});
		});
		return () => {
			cancelled = true;
		};
	}, []);

	return config;
}

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

function clampSelectionPosition(doc: ProseNode, position: number): number {
	return Math.max(0, Math.min(position, doc.content.size));
}

function createPreservedSelection(
	doc: ProseNode,
	selection: ProseSelection,
): ProseSelection {
	const anchor = clampSelectionPosition(doc, selection.anchor);
	const head = clampSelectionPosition(doc, selection.head);

	if (selection.empty) {
		const bias = head === 0 ? 1 : -1;
		return Selection.near(doc.resolve(head), bias);
	}

	return TextSelection.between(doc.resolve(anchor), doc.resolve(head));
}

function replaceContentWithPreservedSelection(
	view: EditorView,
	content: ProseNode,
	selection: ProseSelection,
): void {
	const transaction = view.state.tr
		.replace(0, view.state.doc.content.size, new Slice(content.content, 0, 0))
		.setMeta("addToHistory", false);
	const preservedSelection = createPreservedSelection(
		transaction.doc,
		selection,
	);
	view.dispatch(transaction.setSelection(preservedSelection));
}

function MilkdownEditorInner({
	content,
	onContentChange,
	editorRef,
	highlightConfig,
}: Pick<MilkdownEditorProps, "content" | "onContentChange"> & {
	editorRef: React.Ref<MilkdownEditorHandle>;
	highlightConfig: HighlightConfig;
}) {
	const viewRef = useRef<EditorView | undefined>(undefined);
	const latestMarkdownRef = useRef(content);
	const isApplyingExternalUpdateRef = useRef(false);
	const externalUpdateFrameRef = useRef<number | null>(null);
	const onContentChangeRef = useRef(onContentChange);

	useEffect(() => {
		onContentChangeRef.current = onContentChange;
	}, [onContentChange]);

	useEffect(() => {
		return () => {
			if (externalUpdateFrameRef.current !== null) {
				cancelAnimationFrame(externalUpdateFrameRef.current);
			}
		};
	}, []);

	const onChange = useCallback(
		(_ctx: unknown, markdown: string, prevMarkdown: string) => {
			if (markdown === prevMarkdown) return;
			latestMarkdownRef.current = markdown;
			if (isApplyingExternalUpdateRef.current) return;
			onContentChangeRef.current?.(markdown);
		},
		[],
	);

	// The editor is created exactly once per mount: highlightConfig is
	// resolved before this component renders, so no dependency can change
	// and force a teardown that would wipe the user's selection.
	const { get: getEditor, loading } = useEditor((root) => {
		return (
			Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, root);
					ctx.set(defaultValueCtx, content);
					ctx
						.get(listenerCtx)
						.markdownUpdated(onChange)
						.mounted((listenerContext) => {
							viewRef.current = listenerContext.get(editorViewCtx);
						})
						.destroy(() => {
							viewRef.current = undefined;
						});
					ctx.set(highlightPluginConfig.key, highlightConfig);
				})
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(listener)
				.use(createMermaidPlugin())
				.use(createContextMenuSelectionPlugin())
				.use(createLinkClickPlugin())
				// Note: mermaid NodeView must come after commonmark (needs code_block schema)
				.use(highlight)
		);
	}, []);

	useEffect(() => {
		if (loading) return;
		const editor = getEditor();
		if (!editor) return;
		if (content === latestMarkdownRef.current) return;

		const currentMarkdown = editor.action(getMarkdown());
		if (currentMarkdown === content) {
			latestMarkdownRef.current = content;
			return;
		}

		const view = viewRef.current;
		if (!view) return;

		if (externalUpdateFrameRef.current !== null) {
			cancelAnimationFrame(externalUpdateFrameRef.current);
			externalUpdateFrameRef.current = null;
		}

		isApplyingExternalUpdateRef.current = true;
		try {
			const previousSelection = view.state.selection;
			const hadFocus = view.hasFocus();
			editor.action((ctx) => {
				const viewFromContext = ctx.get(editorViewCtx);
				const parser = ctx.get(parserCtx);
				const nextDocument = parser(content);
				if (!nextDocument) return;

				replaceContentWithPreservedSelection(
					viewFromContext,
					nextDocument,
					previousSelection,
				);

				if (hadFocus) {
					viewFromContext.focus();
					queueMicrotask(() => {
						if (!viewFromContext.hasFocus()) {
							viewFromContext.focus();
						}
					});
				}
			});
			latestMarkdownRef.current = content;
		} finally {
			externalUpdateFrameRef.current = requestAnimationFrame(() => {
				externalUpdateFrameRef.current = null;
				isApplyingExternalUpdateRef.current = false;
			});
		}
	}, [content, getEditor, loading]);

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
	const highlightConfig = useHighlightConfig();

	// Wait for the (session-cached) highlighter instead of mounting an
	// editor without it: swapping the plugin in later would rebuild the
	// editor and destroy the user's selection mid-annotation.
	if (!highlightConfig) {
		return <div className="milkdown-editor-root" />;
	}

	return (
		<MilkdownProvider>
			<div className="milkdown-editor-root">
				<MilkdownEditorInner
					content={content}
					onContentChange={onContentChange}
					editorRef={ref}
					highlightConfig={highlightConfig}
				/>
			</div>
		</MilkdownProvider>
	);
});
