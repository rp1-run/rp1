import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import type { EditorView } from "@milkdown/kit/prose/view";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import {
	forwardRef,
	useCallback,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type { LineDiffEntry } from "../../lib/diff-engine";
import {
	createDiffTrackerPlugin,
	type DiffUpdateCallback,
	type MarkerClickCallback,
} from "./diff-tracker-plugin";

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
	readonly onDiffUpdate?: DiffUpdateCallback;
	readonly enableAnnotations?: boolean;
	readonly onMarkerClick?: MarkerClickCallback;
	readonly persistedDiffs?: LineDiffEntry[];
}

function MilkdownEditorInner({
	content,
	onContentChange,
	onDiffUpdate,
	onMarkerClick,
	persistedDiffs,
	editorRef,
}: Pick<
	MilkdownEditorProps,
	| "content"
	| "onContentChange"
	| "onDiffUpdate"
	| "onMarkerClick"
	| "persistedDiffs"
> & {
	editorRef: React.Ref<MilkdownEditorHandle>;
}) {
	const viewRef = useRef<EditorView | undefined>(undefined);

	// Ref holds the current persisted diffs — always fresh for the plugin getter
	const persistedDiffsRef = useRef<readonly LineDiffEntry[]>([]);
	persistedDiffsRef.current = persistedDiffs ?? [];

	const onChange = useCallback(
		(_ctx: unknown, markdown: string, prevMarkdown: string) => {
			if (markdown !== prevMarkdown) {
				onContentChange?.(markdown);
			}
		},
		[onContentChange],
	);

	// Stable getter — the plugin reads this on every render pass.
	// Never changes reference, so it never causes plugin recreation.
	const getPersistedDiffs = useCallback(() => persistedDiffsRef.current, []);

	const diffPlugin = useMemo(
		() =>
			createDiffTrackerPlugin(onDiffUpdate, onMarkerClick, getPersistedDiffs),
		[onDiffUpdate, onMarkerClick, getPersistedDiffs],
	);

	useEditor(
		(root) =>
			Editor.make()
				.config((ctx) => {
					ctx.set(rootCtx, root);
					ctx.set(defaultValueCtx, content);
					ctx.get(listenerCtx).markdownUpdated(onChange);
				})
				.use(commonmark)
				.use(gfm)
				.use(history)
				.use(listener)
				.use(diffPlugin),
		[],
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
>(function MilkdownEditor(
	{ content, onContentChange, onDiffUpdate, onMarkerClick, persistedDiffs },
	ref,
) {
	return (
		<MilkdownProvider>
			<div className="milkdown-editor-root">
				<MilkdownEditorInner
					content={content}
					onContentChange={onContentChange}
					onDiffUpdate={onDiffUpdate}
					onMarkerClick={onMarkerClick}
					persistedDiffs={persistedDiffs}
					editorRef={ref}
				/>
			</div>
		</MilkdownProvider>
	);
});
