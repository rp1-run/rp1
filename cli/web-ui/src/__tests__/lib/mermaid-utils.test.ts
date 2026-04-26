import { afterEach, describe, expect, mock, test } from "bun:test";
import {
	normalizeMermaidEscapedNewlines,
	renderMermaidSvg,
	svgToPngBlob,
} from "../../lib/mermaid-utils";

describe("mermaid utils", () => {
	test("normalizes escaped newlines for Mermaid display", () => {
		const code = 'flowchart TD\n  A["First\\nSecond"] --> B';

		expect(normalizeMermaidEscapedNewlines(code)).toBe(
			'flowchart TD\n  A["First<br>Second"] --> B',
		);
	});

	test("leaves normal Mermaid newlines intact", () => {
		const code = "flowchart TD\n  A --> B";

		expect(normalizeMermaidEscapedNewlines(code)).toBe(code);
	});

	test("renders Mermaid SVG after applying rp1 theme initialization", async () => {
		const svg = await renderMermaidSvg(
			"flowchart TD\n  A[Start] --> B[Done]",
			`coverage-diagram-${Date.now()}`,
			false,
		);

		expect(svg).toContain("<svg");
		expect(svg).toContain("coverage-diagram-");
	});
});

describe("svgToPngBlob", () => {
	const originalImage = globalThis.Image;
	const originalGetContext = HTMLCanvasElement.prototype.getContext;
	const originalToBlob = HTMLCanvasElement.prototype.toBlob;

	afterEach(() => {
		globalThis.Image = originalImage;
		HTMLCanvasElement.prototype.getContext = originalGetContext;
		HTMLCanvasElement.prototype.toBlob = originalToBlob;
	});

	test("draws a themed PNG export at the requested scale", async () => {
		const scale = mock((_x: number, _y: number) => {});
		const fillRect = mock(
			(_x: number, _y: number, _width: number, _height: number) => {},
		);
		const drawImage = mock(
			(
				_image: CanvasImageSource,
				_x: number,
				_y: number,
				_width: number,
				_height: number,
			) => {},
		);
		const context = {
			scale,
			fillStyle: "",
			fillRect,
			drawImage,
		} as unknown as CanvasRenderingContext2D;

		globalThis.Image = class TestImage {
			onload: (() => void) | null = null;
			onerror: (() => void) | null = null;

			set src(_value: string) {
				queueMicrotask(() => this.onload?.());
			}
		} as unknown as typeof Image;
		HTMLCanvasElement.prototype.getContext = mock(() => context) as never;
		HTMLCanvasElement.prototype.toBlob = mock(
			(callback: BlobCallback, type?: string) => {
				callback(new Blob(["png"], { type: type ?? "image/png" }));
			},
		) as never;

		const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
		svg.setAttribute("width", "100");
		svg.setAttribute("height", "50");
		const foreignObject = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"foreignObject",
		);
		foreignObject.setAttribute("x", "10");
		foreignObject.setAttribute("y", "20");
		foreignObject.setAttribute("width", "80");
		foreignObject.setAttribute("height", "20");
		foreignObject.textContent = "Label";
		svg.appendChild(foreignObject);

		const blob = await svgToPngBlob(svg, true, 3);

		expect(blob.type).toBe("image/png");
		expect(scale).toHaveBeenCalledWith(3, 3);
		expect(fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 50);
	});
});
