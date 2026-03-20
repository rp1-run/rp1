import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { diffLines, type LineDiffEntry } from "../../lib/diff-engine";

const DEBOUNCE_MS = 200;

const diffTrackerKey = new PluginKey<DiffTrackerState>("diff-tracker");

interface DiffTrackerState {
	baseline: string[];
	currentDiff: LineDiffEntry[];
	lineInfos: LineInfo[];
}

interface LineInfo {
	text: string;
	from: number;
	to: number;
}

export type DiffUpdateCallback = (diffs: LineDiffEntry[]) => void;

export interface MarkerClickInfo {
	entry: LineDiffEntry;
	rect: DOMRect;
}

export type MarkerClickCallback = (info: MarkerClickInfo) => void;

function extractLines(doc: ProseMirrorNode): LineInfo[] {
	const lines: LineInfo[] = [];
	doc.descendants((node, pos) => {
		if (node.isTextblock) {
			lines.push({
				text: node.textContent,
				from: pos,
				to: pos + node.nodeSize,
			});
			return false;
		}
	});
	return lines;
}

function createMarker(
	entry: LineDiffEntry,
	onMarkerClick?: MarkerClickCallback,
): HTMLDivElement {
	const marker = document.createElement("div");
	const typeClass =
		entry.type === "added"
			? "milkdown-diff-added"
			: entry.type === "modified"
				? "milkdown-diff-modified"
				: "milkdown-diff-deleted";
	marker.className = `milkdown-diff-marker ${typeClass}`;
	marker.style.cursor = "pointer";

	if (onMarkerClick) {
		marker.addEventListener("click", (e) => {
			e.stopPropagation();
			onMarkerClick({ entry, rect: marker.getBoundingClientRect() });
		});
	}

	return marker;
}

function renderGutter(
	gutterEl: HTMLElement,
	view: EditorView,
	diff: readonly LineDiffEntry[],
	lineInfos: readonly LineInfo[],
	onMarkerClick?: MarkerClickCallback,
) {
	gutterEl.innerHTML = "";
	const editorRect = view.dom.getBoundingClientRect();

	let currentLineIdx = 0;
	let lastNodeBottom = 0;

	for (const entry of diff) {
		if (entry.type === "unchanged") {
			if (currentLineIdx < lineInfos.length) {
				const node = view.nodeDOM(lineInfos[currentLineIdx]?.from);
				if (node instanceof HTMLElement) {
					lastNodeBottom = node.getBoundingClientRect().bottom;
				}
			}
			currentLineIdx++;
		} else if (entry.type === "added" || entry.type === "modified") {
			if (currentLineIdx < lineInfos.length) {
				const node = view.nodeDOM(lineInfos[currentLineIdx]?.from);
				if (node instanceof HTMLElement) {
					const nodeRect = node.getBoundingClientRect();
					const marker = createMarker(entry, onMarkerClick);
					marker.style.top = `${nodeRect.top - editorRect.top}px`;
					marker.style.height = `${nodeRect.height}px`;
					gutterEl.appendChild(marker);
					lastNodeBottom = nodeRect.bottom;
				}
			}
			currentLineIdx++;
		} else if (entry.type === "deleted") {
			const marker = createMarker(entry, onMarkerClick);
			marker.style.top = `${lastNodeBottom - editorRect.top}px`;
			gutterEl.appendChild(marker);
		}
	}
}

/**
 * Render gutter markers from persisted diffs using the `line` field directly.
 * Persisted diffs only contain non-unchanged entries, so we can't walk sequentially.
 */
function renderGutterFromPersisted(
	gutterEl: HTMLElement,
	view: EditorView,
	diffs: readonly LineDiffEntry[],
	lineInfos: readonly LineInfo[],
	onMarkerClick?: MarkerClickCallback,
) {
	gutterEl.innerHTML = "";
	const editorRect = view.dom.getBoundingClientRect();

	for (const entry of diffs) {
		if (entry.type === "unchanged") continue;

		const lineIdx = entry.line - 1;

		if (entry.type === "added" || entry.type === "modified") {
			if (lineIdx >= 0 && lineIdx < lineInfos.length) {
				const node = view.nodeDOM(lineInfos[lineIdx]?.from);
				if (node instanceof HTMLElement) {
					const nodeRect = node.getBoundingClientRect();
					const top = nodeRect.top - editorRect.top;
					if (nodeRect.height > 0 && top > 0) {
						const marker = createMarker(entry, onMarkerClick);
						marker.style.top = `${top}px`;
						marker.style.height = `${nodeRect.height}px`;
						gutterEl.appendChild(marker);
					}
				}
			}
		} else if (entry.type === "deleted") {
			const prevIdx = Math.max(0, lineIdx - 1);
			if (prevIdx < lineInfos.length) {
				const node = view.nodeDOM(lineInfos[prevIdx]?.from);
				if (node instanceof HTMLElement) {
					const nodeRect = node.getBoundingClientRect();
					const top = nodeRect.bottom - editorRect.top;
					if (nodeRect.height > 0 && top > 0) {
						const marker = createMarker(entry, onMarkerClick);
						marker.style.top = `${top}px`;
						gutterEl.appendChild(marker);
					}
				}
			}
		}
	}
}

export function createDiffTrackerPlugin(
	onDiffUpdate?: DiffUpdateCallback,
	initialDiffs?: readonly LineDiffEntry[],
	onMarkerClick?: MarkerClickCallback,
) {
	return $prose(() => {
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let editorView: EditorView | null = null;
		let gutterEl: HTMLElement | null = null;
		let hasRenderedInitial = false;

		return new Plugin<DiffTrackerState>({
			key: diffTrackerKey,

			state: {
				init(_, state): DiffTrackerState {
					const lineInfos = extractLines(state.doc);
					const baseline = lineInfos.map((l) => l.text);
					return {
						baseline,
						currentDiff: initialDiffs ? [...initialDiffs] : [],
						lineInfos,
					};
				},

				apply(tr: Transaction, prev: DiffTrackerState): DiffTrackerState {
					const meta = tr.getMeta(diffTrackerKey);
					if (meta) return meta as DiffTrackerState;
					if (!tr.docChanged) return prev;

					if (debounceTimer !== null) clearTimeout(debounceTimer);

					const baseline = prev.baseline;

					debounceTimer = setTimeout(() => {
						debounceTimer = null;
						if (!editorView) return;

						const doc = editorView.state.doc;
						const lineInfos = extractLines(doc);
						const currentLines = lineInfos.map((l) => l.text);
						const diff = diffLines(baseline, currentLines);

						onDiffUpdate?.(diff);

						const tr = editorView.state.tr;
						tr.setMeta(diffTrackerKey, {
							baseline,
							currentDiff: diff,
							lineInfos,
						});
						tr.setMeta("addToHistory", false);
						editorView.dispatch(tr);
					}, DEBOUNCE_MS);

					return prev;
				},
			},

			view(view) {
				editorView = view;

				gutterEl = document.createElement("div");
				gutterEl.className = "milkdown-diff-gutter";
				const wrapper = view.dom.parentElement;
				if (wrapper) {
					wrapper.style.position = "relative";
					wrapper.insertBefore(gutterEl, view.dom);
				}

				return {
					update(view) {
						const pluginState = diffTrackerKey.getState(view.state);
						if (!pluginState || !gutterEl) return;

						if (!hasRenderedInitial && initialDiffs?.length) {
							hasRenderedInitial = true;
							// Defer to next frame so DOM layout is complete
							const g = gutterEl;
							requestAnimationFrame(() => {
								const state = diffTrackerKey.getState(view.state);
								if (state && g) {
									renderGutterFromPersisted(
										g,
										view,
										initialDiffs,
										state.lineInfos,
										onMarkerClick,
									);
								}
							});
							return;
						}

						const hasChanges = pluginState.currentDiff.some(
							(e) => e.type !== "unchanged",
						);
						if (hasChanges) {
							renderGutter(
								gutterEl,
								view,
								pluginState.currentDiff,
								pluginState.lineInfos,
								onMarkerClick,
							);
						} else if (initialDiffs?.length) {
							renderGutterFromPersisted(
								gutterEl,
								view,
								initialDiffs,
								pluginState.lineInfos,
								onMarkerClick,
							);
						} else {
							gutterEl.innerHTML = "";
						}
					},
					destroy() {
						editorView = null;
						gutterEl?.remove();
						gutterEl = null;
						if (debounceTimer !== null) {
							clearTimeout(debounceTimer);
							debounceTimer = null;
						}
					},
				};
			},
		});
	});
}
