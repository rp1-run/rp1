import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";

const linkClickPluginKey = new PluginKey("linkClick");

/**
 * Finds the closest `<a>` element from a click target within the editor.
 * Returns the href if it's a valid external/internal link, otherwise null.
 */
function findLinkHref(
	target: EventTarget | null,
	view: EditorView,
): string | null {
	if (!(target instanceof HTMLElement)) return null;
	const anchor = target.closest("a");
	if (!anchor) return null;
	// Only handle links that are inside the editor DOM
	if (!view.dom.contains(anchor)) return null;
	return anchor.href || null;
}

/**
 * ProseMirror plugin that makes hyperlinks clickable in the Milkdown editor.
 * Opens links in a new tab on click.
 */
export const createLinkClickPlugin = () =>
	$prose(() => {
		return new Plugin({
			key: linkClickPluginKey,
			props: {
				handleClick(view: EditorView, _pos: number, event: MouseEvent) {
					const href = findLinkHref(event.target, view);
					if (!href) return false;
					// Open in a new tab
					window.open(href, "_blank", "noopener,noreferrer");
					event.preventDefault();
					return true;
				},
			},
		});
	});
