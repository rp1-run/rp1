import type { Ctx } from "@milkdown/kit/ctx";
import type { NodeViewConstructor } from "@milkdown/kit/prose/view";
import { $view } from "@milkdown/kit/utils";
import { codeBlockSchema } from "@milkdown/preset-commonmark";
import mermaid from "mermaid";
import { warmStoneDark, warmStoneLight } from "../../lib/mermaid-theme";

const DEBOUNCE_MS = 400;
const MERMAID_LANGS = /^(mermaid|mmd|mindmap)$/i;

const renderCache = new Map<string, string>();
let idCounter = 0;

function initMermaid() {
	const isDark = document.documentElement.classList.contains("dark");
	mermaid.initialize({
		startOnLoad: false,
		theme: "base",
		securityLevel: "loose",
		fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
		themeVariables: isDark ? warmStoneDark : warmStoneLight,
		suppressErrorRendering: true,
	});
}

async function renderMermaidSvg(code: string): Promise<string> {
	const cached = renderCache.get(code);
	if (cached) return cached;

	initMermaid();
	const id = `mermaid-editor-${idCounter++}`;
	const { svg } = await mermaid.render(id, code);
	renderCache.set(code, svg);
	return svg;
}

/**
 * NodeView for mermaid code blocks.
 * Non-mermaid code blocks fall through to default rendering.
 */
function mermaidNodeView(_ctx: Ctx): NodeViewConstructor {
	return (node, _view, _getPos) => {
		const isMermaid = MERMAID_LANGS.test(node.attrs.language);

		if (!isMermaid) {
			// Return a minimal pass-through NodeView for non-mermaid code blocks
			const pre = document.createElement("pre");
			pre.dataset.language = node.attrs.language;
			const code = document.createElement("code");
			pre.appendChild(code);
			return {
				dom: pre,
				contentDOM: code,
			};
		}

		// --- Mermaid NodeView ---
		let debounceTimer: ReturnType<typeof setTimeout> | null = null;
		let lastRenderedCode = "";

		// Outer dom — ProseMirror watches this, so never mutate its attributes
		const container = document.createElement("div");
		container.className = "milkdown-mermaid-container";

		// Inner wrapper carries tab state — safe from ProseMirror's MutationObserver
		const inner = document.createElement("div");
		inner.className = "milkdown-mermaid-inner";
		inner.setAttribute("data-tab", "preview");

		// Tab bar
		const tabBar = document.createElement("div");
		tabBar.className = "milkdown-mermaid-tabs";
		tabBar.contentEditable = "false";

		const previewTab = document.createElement("button");
		previewTab.type = "button";
		previewTab.className = "milkdown-mermaid-tab active";
		previewTab.textContent = "Preview";

		const codeTab = document.createElement("button");
		codeTab.type = "button";
		codeTab.className = "milkdown-mermaid-tab";
		codeTab.textContent = "Code";

		tabBar.appendChild(previewTab);
		tabBar.appendChild(codeTab);

		// Code area (ProseMirror's contentDOM — editable)
		const pre = document.createElement("pre");
		pre.className = "milkdown-mermaid-code";
		pre.dataset.language = node.attrs.language;
		const codeEl = document.createElement("code");
		pre.appendChild(codeEl);

		// Preview panel
		const previewPanel = document.createElement("div");
		previewPanel.className = "milkdown-mermaid-preview";
		previewPanel.contentEditable = "false";

		inner.appendChild(tabBar);
		inner.appendChild(pre);
		inner.appendChild(previewPanel);
		container.appendChild(inner);

		// Tab switching — only mutates the inner wrapper, never the dom element
		function setTab(tab: string) {
			inner.setAttribute("data-tab", tab);
			previewTab.classList.toggle("active", tab === "preview");
			codeTab.classList.toggle("active", tab === "code");
		}

		previewTab.addEventListener("click", () => setTab("preview"));
		codeTab.addEventListener("click", () => setTab("code"));

		// Render mermaid diagram
		function scheduleRender(code: string) {
			if (code === lastRenderedCode) return;
			if (debounceTimer) clearTimeout(debounceTimer);
			debounceTimer = setTimeout(async () => {
				debounceTimer = null;
				try {
					const svg = await renderMermaidSvg(code);
					previewPanel.innerHTML = svg;
					previewPanel.classList.remove("mermaid-error");
					lastRenderedCode = code;
				} catch (err) {
					previewPanel.textContent =
						err instanceof Error ? err.message : "Render error";
					previewPanel.classList.add("mermaid-error");
				}
			}, DEBOUNCE_MS);
		}

		// Initial render
		const initialCode = node.textContent.trim();
		const cached = renderCache.get(initialCode);
		if (cached) {
			previewPanel.innerHTML = cached;
			lastRenderedCode = initialCode;
		} else {
			scheduleRender(initialCode);
		}

		return {
			dom: container,
			contentDOM: codeEl,
			ignoreMutation(mutation: MutationRecord) {
				// ProseMirror owns contentDOM (the <code> element) — let it
				// handle mutations there. Everything else (tab bar, preview
				// panel, inner wrapper attributes) is our UI chrome — ignore.
				if (mutation.type === "selection") return false;
				const target = mutation.target as Node;
				return !codeEl.contains(target);
			},
			stopEvent(event) {
				const target = event.target as HTMLElement;
				return !codeEl.contains(target) && !pre.contains(target);
			},
			update(updatedNode) {
				if (updatedNode.type.name !== "code_block") return false;
				if (!MERMAID_LANGS.test(updatedNode.attrs.language)) return false;
				// Re-render if code changed
				const newCode = updatedNode.textContent.trim();
				if (newCode !== lastRenderedCode) {
					scheduleRender(newCode);
				}
				return true;
			},
			destroy() {
				if (debounceTimer) clearTimeout(debounceTimer);
			},
		};
	};
}

export const createMermaidPlugin = () =>
	$view(codeBlockSchema.node, mermaidNodeView);
