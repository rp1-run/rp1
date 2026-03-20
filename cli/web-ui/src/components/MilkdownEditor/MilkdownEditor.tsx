import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { history } from "@milkdown/kit/plugin/history";
import { listener, listenerCtx } from "@milkdown/kit/plugin/listener";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { Milkdown, MilkdownProvider, useEditor } from "@milkdown/react";
import { useCallback } from "react";

import "@milkdown/kit/prose/view/style/prosemirror.css";

export interface MilkdownEditorProps {
	readonly content: string;
	readonly artifactPath: string;
	readonly docId?: string;
	readonly runId?: string;
	readonly onContentChange?: (markdown: string) => void;
	readonly enableAnnotations?: boolean;
}

function MilkdownEditorInner({
	content,
	onContentChange,
}: Pick<MilkdownEditorProps, "content" | "onContentChange">) {
	const onChange = useCallback(
		(_ctx: unknown, markdown: string, prevMarkdown: string) => {
			if (markdown !== prevMarkdown) {
				onContentChange?.(markdown);
			}
		},
		[onContentChange],
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
			.use(listener),
	);

	return <Milkdown />;
}

export function MilkdownEditor({
	content,
	onContentChange,
}: MilkdownEditorProps) {
	return (
		<MilkdownProvider>
			<div className="milkdown-editor-root">
				<MilkdownEditorInner
					content={content}
					onContentChange={onContentChange}
				/>
			</div>
		</MilkdownProvider>
	);
}
