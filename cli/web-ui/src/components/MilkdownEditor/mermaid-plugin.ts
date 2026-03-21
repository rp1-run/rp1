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

// --- Image export ---

async function svgToPngBlob(
	svgEl: SVGSVGElement,
	scaleFactor = 2,
): Promise<Blob> {
	const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
	svgClone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
	svgClone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");

	const viewBox = svgEl.viewBox?.baseVal;
	const attrW = Number.parseFloat(svgEl.getAttribute("width") ?? "0");
	const attrH = Number.parseFloat(svgEl.getAttribute("height") ?? "0");
	const width = viewBox?.width || attrW || svgEl.getBoundingClientRect().width;
	const height =
		viewBox?.height || attrH || svgEl.getBoundingClientRect().height;
	svgClone.setAttribute("width", String(width));
	svgClone.setAttribute("height", String(height));

	const styleEl = document.createElementNS(
		"http://www.w3.org/2000/svg",
		"style",
	);
	const styles: string[] = [];
	for (const sheet of document.styleSheets) {
		try {
			for (const rule of sheet.cssRules) {
				styles.push(rule.cssText);
			}
		} catch {
			/* skip cross-origin */
		}
	}
	styleEl.textContent = styles.join("\n");
	svgClone.insertBefore(styleEl, svgClone.firstChild);

	for (const fo of svgClone.querySelectorAll("foreignObject")) {
		const text = fo.textContent?.trim() ?? "";
		const svgText = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"text",
		);
		const x = fo.getAttribute("x") ?? "0";
		const y = fo.getAttribute("y") ?? "0";
		const foW = Number.parseFloat(fo.getAttribute("width") ?? "100");
		const foH = Number.parseFloat(fo.getAttribute("height") ?? "20");
		svgText.setAttribute("x", String(Number.parseFloat(x) + foW / 2));
		svgText.setAttribute("y", String(Number.parseFloat(y) + foH / 2));
		svgText.setAttribute("text-anchor", "middle");
		svgText.setAttribute("dominant-baseline", "central");
		svgText.setAttribute(
			"font-family",
			"var(--font-mono, 'JetBrains Mono', monospace)",
		);
		svgText.setAttribute("font-size", "14");
		svgText.setAttribute("fill", "currentColor");
		svgText.textContent = text;
		fo.replaceWith(svgText);
	}

	const svgString = new XMLSerializer().serializeToString(svgClone);
	const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

	const img = await new Promise<HTMLImageElement>((resolve, reject) => {
		const image = new Image();
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error("Failed to load SVG as image"));
		image.src = dataUrl;
	});

	const canvas = document.createElement("canvas");
	canvas.width = width * scaleFactor;
	canvas.height = height * scaleFactor;
	const ctx = canvas.getContext("2d");
	if (!ctx) throw new Error("Canvas context unavailable");
	ctx.scale(scaleFactor, scaleFactor);

	const isDark = document.documentElement.classList.contains("dark");
	ctx.fillStyle = isDark ? "#211e1c" : "#f0f0ee";
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(img, 0, 0, width, height);

	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
			"image/png",
		),
	);
}

// --- Icon helpers ---

const ICON_COPY =
	'<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>';
const ICON_CHECK = '<polyline points="20 6 9 17 4 12"/>';
const ICON_DOWNLOAD =
	'<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>';
const ICON_MAXIMIZE =
	'<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" x2="14" y1="3" y2="10"/><line x1="3" x2="10" y1="21" y2="14"/>';

function iconSvg(paths: string): string {
	return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function createActionButton(paths: string, label: string): HTMLButtonElement {
	const btn = document.createElement("button");
	btn.type = "button";
	btn.className = "milkdown-mermaid-action";
	btn.title = label;
	btn.setAttribute("aria-label", label);
	btn.innerHTML = iconSvg(paths);
	return btn;
}

function flashIcon(btn: HTMLButtonElement, originalPaths: string) {
	btn.innerHTML = iconSvg(ICON_CHECK);
	setTimeout(() => {
		btn.innerHTML = iconSvg(originalPaths);
	}, 1500);
}

/**
 * NodeView for mermaid code blocks.
 * Non-mermaid code blocks fall through to default rendering.
 */
function mermaidNodeView(_ctx: Ctx): NodeViewConstructor {
	return (node, _view, _getPos) => {
		const isMermaid = MERMAID_LANGS.test(node.attrs.language);

		if (!isMermaid) {
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

		const container = document.createElement("div");
		container.className = "milkdown-mermaid-container";

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

		// Action buttons — right-aligned in tab bar
		const actionsDiv = document.createElement("div");
		actionsDiv.className = "milkdown-mermaid-actions";

		const copyBtn = createActionButton(ICON_COPY, "Copy as image");
		const downloadBtn = createActionButton(ICON_DOWNLOAD, "Download as image");
		const fullscreenBtn = createActionButton(ICON_MAXIMIZE, "Fullscreen");

		actionsDiv.appendChild(copyBtn);
		actionsDiv.appendChild(downloadBtn);
		actionsDiv.appendChild(fullscreenBtn);

		tabBar.appendChild(previewTab);
		tabBar.appendChild(codeTab);
		tabBar.appendChild(actionsDiv);

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

		// Tab switching
		function setTab(tab: string) {
			inner.setAttribute("data-tab", tab);
			previewTab.classList.toggle("active", tab === "preview");
			codeTab.classList.toggle("active", tab === "code");
		}

		previewTab.addEventListener("click", () => setTab("preview"));
		codeTab.addEventListener("click", () => setTab("code"));

		// Action handlers
		copyBtn.addEventListener("click", async () => {
			const svgEl = previewPanel.querySelector("svg");
			if (!svgEl) return;
			try {
				const blob = await svgToPngBlob(svgEl);
				await navigator.clipboard.write([
					new ClipboardItem({ "image/png": blob }),
				]);
				flashIcon(copyBtn, ICON_COPY);
			} catch (err) {
				console.error("Copy as PNG failed:", err);
			}
		});

		downloadBtn.addEventListener("click", async () => {
			const svgEl = previewPanel.querySelector("svg");
			if (!svgEl) return;
			try {
				const blob = await svgToPngBlob(svgEl);
				const url = URL.createObjectURL(blob);
				const a = document.createElement("a");
				a.href = url;
				a.download = "mermaid-diagram.png";
				a.click();
				URL.revokeObjectURL(url);
				flashIcon(downloadBtn, ICON_DOWNLOAD);
			} catch (err) {
				console.error("Download as PNG failed:", err);
			}
		});

		fullscreenBtn.addEventListener("click", () => {
			const code = codeEl.textContent?.trim() ?? "";
			if (code) {
				document.dispatchEvent(
					new CustomEvent("mermaid-editor-fullscreen", {
						detail: { code },
					}),
				);
			}
		});

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
			ignoreMutation(mutation) {
				if (!(mutation instanceof MutationRecord)) return false;
				return !codeEl.contains(mutation.target);
			},
			stopEvent(event) {
				const target = event.target as HTMLElement;
				return !codeEl.contains(target) && !pre.contains(target);
			},
			update(updatedNode) {
				if (updatedNode.type.name !== "code_block") return false;
				if (!MERMAID_LANGS.test(updatedNode.attrs.language)) return false;
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
