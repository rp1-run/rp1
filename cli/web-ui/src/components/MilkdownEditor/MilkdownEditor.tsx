import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useCallback, useMemo } from "react";
import {
	createDiffTrackerPlugin,
	type DiffUpdateCallback,
} from "./diff-tracker-plugin";

import "@milkdown/kit/prose/view/style/prosemirror.css";

export interface MilkdownEditorProps {
	readonly content: string;
	readonly artifactPath: string;
	readonly docId?: string;
	readonly runId?: string;
	readonly onContentChange?: (markdown: string) => void;
	readonly onDiffUpdate?: DiffUpdateCallback;
	readonly enableAnnotations?: boolean;
}

function MilkdownEditorInner({
	content,
	onContentChange,
	onDiffUpdate,
}: Pick<MilkdownEditorProps, "content" | "onContentChange" | "onDiffUpdate">) {
	const onChange = useCallback(
		(_ctx: unknown, markdown: string, prevMarkdown: string) => {
			if (markdown !== prevMarkdown) {
				onContentChange?.(markdown);
			}
		},
		[onContentChange],
	);

	const diffPlugin = useMemo(
		() => createDiffTrackerPlugin(onDiffUpdate),
		[onDiffUpdate],
	);

	useEditor((root) =>
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
	);

	return <Milkdown />;
}

export function MilkdownEditor({
	content,
	onContentChange,
	onDiffUpdate,
}: MilkdownEditorProps) {
	return (
		<MilkdownProvider>
			<div className="milkdown-editor-root">
				<MilkdownEditorInner
					content={content}
					onContentChange={onContentChange}
					onDiffUpdate={onDiffUpdate}
				/>
			</div>
		</MilkdownProvider>
	);
}
