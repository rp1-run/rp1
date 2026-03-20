import type { Node as ProseMirrorNode } from "@milkdown/kit/prose/model";
import type { Transaction } from "@milkdown/kit/prose/state";
import { Plugin, PluginKey } from "@milkdown/kit/prose/state";
import type { EditorView } from "@milkdown/kit/prose/view";
import { $prose } from "@milkdown/kit/utils";
import { diffLines, type LineDiffEntry } from "../../lib/diff-engine";

const DEBOUNCE_MS = 200;

export const diffTrackerKey = new PluginKey<DiffTrackerState>("diff-tracker");

/** Plugin state tracks only live editing concerns — never persisted diffs. */
export interface DiffTrackerState {
	baseline: string[];
	currentDiff: LineDiffEntry[];
	lineInfos: LineInfo[];
}

export interface LineInfo {
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

/** Getter for persisted diffs — React owns the data, plugin reads on demand. */
export type PersistedDiffsGetter = () => readonly LineDiffEntry[];

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

/**
 * Find the ProseMirror textblock whose content matches the given text.
 * Returns the LineInfo or undefined if not found.
 */
function findLineByText(
	lineInfos: readonly LineInfo[],
	text: string,
): LineInfo | undefined {
	return lineInfos.find((l) => l.text === text);
}

/**
 * Render all gutter markers using ProseMirror positions.
 * Live diffs come from plugin state, persisted diffs from the getter.
 */
function renderAllMarkers(
	gutterEl: HTMLElement,
	view: EditorView,
	state: DiffTrackerState,
	persistedDiffs: readonly LineDiffEntry[],
	onMarkerClick?: MarkerClickCallback,
) {
	gutterEl.innerHTML = "";
	const editorRect = view.dom.getBoundingClientRect();

	// Track which lines already have markers (live takes priority)
	const markedPositions = new Set<number>();

	// 1. Render live diff markers (sequential walk — positions are exact)
	let currentLineIdx = 0;
	let lastNodeBottom = 0;

	for (const entry of state.currentDiff) {
		if (entry.type === "unchanged") {
			if (currentLineIdx < state.lineInfos.length) {
				const node = view.nodeDOM(state.lineInfos[currentLineIdx]?.from);
				if (node instanceof HTMLElement) {
					lastNodeBottom = node.getBoundingClientRect().bottom;
				}
			}
			currentLineIdx++;
		} else if (entry.type === "added" || entry.type === "modified") {
			if (currentLineIdx < state.lineInfos.length) {
				const lineInfo = state.lineInfos[currentLineIdx];
				const node = view.nodeDOM(lineInfo?.from);
				if (node instanceof HTMLElement) {
					const nodeRect = node.getBoundingClientRect();
					const marker = createMarker(entry, onMarkerClick);
					marker.style.top = `${nodeRect.top - editorRect.top}px`;
					marker.style.height = `${nodeRect.height}px`;
					gutterEl.appendChild(marker);
					lastNodeBottom = nodeRect.bottom;
					if (lineInfo) markedPositions.add(lineInfo.from);
				}
			}
			currentLineIdx++;
		} else if (entry.type === "deleted") {
			const marker = createMarker(entry, onMarkerClick);
			marker.style.top = `${lastNodeBottom - editorRect.top}px`;
			gutterEl.appendChild(marker);
		}
	}

	// 2. Render persisted diff markers (read from getter — always fresh)
	for (const entry of persistedDiffs) {
		if (entry.type === "unchanged") continue;

		// Try line number first (correct on initial load)
		const lineIdx = entry.line - 1;
		let lineInfo: LineInfo | undefined;

		if (lineIdx >= 0 && lineIdx < state.lineInfos.length) {
			lineInfo = state.lineInfos[lineIdx];
		}

		// Fall back to text matching if line moved
		if (!lineInfo || markedPositions.has(lineInfo.from)) {
			const matchText = entry.after ?? entry.before;
			if (matchText !== null) {
				lineInfo = findLineByText(state.lineInfos, matchText);
			}
		}

		if (!lineInfo || markedPositions.has(lineInfo.from)) continue;

		const node = view.nodeDOM(lineInfo.from);
		if (!(node instanceof HTMLElement)) continue;

		const nodeRect = node.getBoundingClientRect();
		const top = nodeRect.top - editorRect.top;
		if (nodeRect.height <= 0 || top <= 0) continue;

		const marker = createMarker(entry, onMarkerClick);
		marker.style.top = `${top}px`;
		marker.style.height =
			entry.type === "deleted" ? "2px" : `${nodeRect.height}px`;
		gutterEl.appendChild(marker);
		markedPositions.add(lineInfo.from);
	}
}

export function createDiffTrackerPlugin(
	onDiffUpdate?: DiffUpdateCallback,
	onMarkerClick?: MarkerClickCallback,
	getPersistedDiffs?: PersistedDiffsGetter,
) {
	const emptyDiffs: readonly LineDiffEntry[] = [];

	return $prose(() => {
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let editorView: EditorView | null = null;
		let gutterEl: HTMLElement | null = null;

		return new Plugin<DiffTrackerState>({
			key: diffTrackerKey,

			state: {
				init(_, state): DiffTrackerState {
					const lineInfos = extractLines(state.doc);
					const baseline = lineInfos.map((l) => l.text);
					return {
						baseline,
						currentDiff: [],
						lineInfos,
					};
				},

				apply(tr: Transaction, prev: DiffTrackerState): DiffTrackerState {
					const meta = tr.getMeta(diffTrackerKey);

					// Handle full state update (from debounced diff computation)
					if (meta?.currentDiff) {
						return meta as DiffTrackerState;
					}

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

					// Update lineInfos immediately for marker repositioning
					return {
						...prev,
						lineInfos: extractLines(tr.doc),
					};
				},
			},

			view(view) {
				editorView = view;

				gutterEl = document.createElement("div");
				gutterEl.className = "milkdown-diff-gutter";
				gutterEl.setAttribute("data-diff-gutter", "true");

				const wrapper = view.dom.parentElement;
				if (wrapper) {
					wrapper.style.position = "relative";
					wrapper.insertBefore(gutterEl, view.dom);
				}

				// Schedule initial render after first paint (DOM needs layout)
				requestAnimationFrame(() => {
					if (!gutterEl || !editorView) return;
					const pluginState = diffTrackerKey.getState(editorView.state);
					if (!pluginState) return;
					const persisted = getPersistedDiffs?.() ?? emptyDiffs;
					const hasLive = pluginState.currentDiff.some(
						(e) => e.type !== "unchanged",
					);
					if (hasLive || persisted.length > 0) {
						renderAllMarkers(
							gutterEl,
							editorView,
							pluginState,
							persisted,
							onMarkerClick,
						);
					}
				});

				return {
					update(view) {
						const pluginState = diffTrackerKey.getState(view.state);
						if (!pluginState || !gutterEl) return;

						const persisted = getPersistedDiffs?.() ?? emptyDiffs;
						const hasLive = pluginState.currentDiff.some(
							(e) => e.type !== "unchanged",
						);

						if (hasLive || persisted.length > 0) {
							renderAllMarkers(
								gutterEl,
								view,
								pluginState,
								persisted,
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
