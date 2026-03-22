/**
 * Shared Mermaid utilities — single source of truth for initialization,
 * rendering, and PNG export. Consumed by MermaidDiagram, mermaid-plugin,
 * and DiagramFullscreenProvider.
 */
import mermaid from "mermaid";
import { warmStoneDark, warmStoneLight } from "./mermaid-theme";

/** Initialize Mermaid with the design system theme. Call before each render. */
export function initializeMermaid(isDark: boolean): void {
	mermaid.initialize({
		startOnLoad: false,
		theme: "base",
		securityLevel: "strict",
		htmlLabels: false,
		fontFamily: "Commit Mono, monospace",
		themeVariables: isDark ? warmStoneDark : warmStoneLight,
		suppressErrorRendering: true,
		flowchart: { wrappingWidth: 300, padding: 12, htmlLabels: false },
		state: { useMaxWidth: false },
	});
}

/** Render a Mermaid diagram and return the SVG string. */
export async function renderMermaidSvg(
	code: string,
	id: string,
	isDark: boolean,
): Promise<string> {
	initializeMermaid(isDark);
	const { svg } = await mermaid.render(id, code);
	return svg;
}

/**
 * Background colors for PNG export, matching CSS custom properties.
 * Light ≈ --base hsl(40,6%,94%), Dark ≈ --base hsl(30,8%,12%).
 */
export const DIAGRAM_EXPORT_BG = {
	light: "#f0f0ee",
	dark: "#211e1c",
} as const;

/** Convert an SVG element to a PNG blob for clipboard/download. */
export async function svgToPngBlob(
	svgEl: SVGSVGElement,
	isDark: boolean,
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
		svgText.setAttribute("font-family", "Commit Mono, monospace");
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

	ctx.fillStyle = isDark ? DIAGRAM_EXPORT_BG.dark : DIAGRAM_EXPORT_BG.light;
	ctx.fillRect(0, 0, width, height);
	ctx.drawImage(img, 0, 0, width, height);

	return new Promise<Blob>((resolve, reject) =>
		canvas.toBlob(
			(b) => (b ? resolve(b) : reject(new Error("toBlob failed"))),
			"image/png",
		),
	);
}
