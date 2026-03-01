import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import {
	detectHiddenAnchors,
	findHiddenAnchorById,
	useTextSelection,
} from "../../hooks/useTextSelection";

describe("useTextSelection", () => {
	let container: HTMLDivElement;
	let containerRef: React.RefObject<HTMLDivElement>;

	beforeEach(() => {
		container = document.createElement("div");
		container.innerHTML = "Hello world, this is some sample text for testing.";
		document.body.appendChild(container);
		containerRef = { current: container };
	});

	afterEach(() => {
		container.remove();
		window.getSelection()?.removeAllRanges();
	});

	test("returns null selection when no text is selected", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true }),
		);

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
	});

	test("clearSelection clears selection state and removes ranges", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: true }),
		);

		const removeAllRanges = mock(() => {});
		const originalGetSelection = window.getSelection;
		window.getSelection = mock(() => ({
			removeAllRanges,
			isCollapsed: true,
			anchorNode: null,
			focusNode: null,
			getRangeAt: () => ({ collapsed: true }),
		})) as unknown as typeof window.getSelection;

		act(() => {
			result.current.clearSelection();
		});

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
		expect(removeAllRanges).toHaveBeenCalled();

		window.getSelection = originalGetSelection;
	});

	test("does not track selection when disabled", () => {
		const { result } = renderHook(() =>
			useTextSelection({ containerRef, enabled: false }),
		);

		expect(result.current.selection).toBeNull();
		expect(result.current.selectionPosition).toBeNull();
	});

	test("uses document.body as default container when containerRef not provided", () => {
		const { result } = renderHook(() => useTextSelection({ enabled: true }));

		expect(result.current.selection).toBeNull();
	});
});

describe("detectHiddenAnchors", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	test("detects anchor elements with id and no href", () => {
		container.innerHTML = `
			<a id="section-1"></a>
			<p>Section 1 content</p>
			<a id="section-2"></a>
			<p>Section 2 content</p>
		`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(2);
		expect(anchors[0].anchor.anchorId).toBe("section-1");
		expect(anchors[0].anchor.type).toBe("hidden-anchor");
		expect(anchors[1].anchor.anchorId).toBe("section-2");
	});

	test("ignores anchor elements with href attribute", () => {
		container.innerHTML = `
			<a id="hidden-anchor"></a>
			<a id="link-anchor" href="/page">Link</a>
		`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorId).toBe("hidden-anchor");
	});

	test("ignores anchor elements without id", () => {
		container.innerHTML = `
			<a></a>
			<a id="valid-anchor"></a>
		`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorId).toBe("valid-anchor");
	});

	test("captures context text from next sibling text node", () => {
		container.innerHTML = `<a id="test-anchor"></a>This is the context text`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorText).toBe("This is the context text");
	});

	test("captures context text from next sibling element", () => {
		container.innerHTML = `<a id="test-anchor"></a><p>Paragraph content here</p>`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorText).toBe("Paragraph content here");
	});

	test("captures context text from parent element as fallback", () => {
		container.innerHTML = `<div>Parent text <a id="test-anchor"></a></div>`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorText).toBe("Parent text");
	});

	test("truncates long context text to 100 characters", () => {
		const longText = "A".repeat(150);
		container.innerHTML = `<a id="test-anchor"></a>${longText}`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].anchor.anchorText).toHaveLength(100);
	});

	test("returns empty array when no hidden anchors exist", () => {
		container.innerHTML = `<p>No anchors here</p>`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(0);
	});

	test("includes position data for each anchor", () => {
		container.innerHTML = `<a id="test-anchor"></a>`;

		const anchors = detectHiddenAnchors(container);

		expect(anchors).toHaveLength(1);
		expect(anchors[0].position).toHaveProperty("x");
		expect(anchors[0].position).toHaveProperty("y");
		expect(typeof anchors[0].position.x).toBe("number");
		expect(typeof anchors[0].position.y).toBe("number");
	});
});

describe("findHiddenAnchorById", () => {
	let container: HTMLDivElement;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
	});

	afterEach(() => {
		container.remove();
	});

	test("finds anchor by exact id match", () => {
		container.innerHTML = `
			<a id="anchor-1"></a>
			<a id="anchor-2"></a>
			<a id="anchor-3"></a>
		`;

		const result = findHiddenAnchorById(container, "anchor-2");

		expect(result).not.toBeNull();
		expect(result?.anchor.anchorId).toBe("anchor-2");
	});

	test("returns null when anchor not found", () => {
		container.innerHTML = `<a id="existing-anchor"></a>`;

		const result = findHiddenAnchorById(container, "non-existent");

		expect(result).toBeNull();
	});

	test("ignores anchors with href when searching", () => {
		container.innerHTML = `<a id="test-anchor" href="/page">Link</a>`;

		const result = findHiddenAnchorById(container, "test-anchor");

		expect(result).toBeNull();
	});

	test("handles special characters in anchor id", () => {
		container.innerHTML = `<a id="section.1"></a>`;

		const result = findHiddenAnchorById(container, "section.1");

		expect(result).not.toBeNull();
		expect(result?.anchor.anchorId).toBe("section.1");
	});

	test("returns anchor with context text", () => {
		container.innerHTML = `<a id="test-anchor"></a>Context text here`;

		const result = findHiddenAnchorById(container, "test-anchor");

		expect(result).not.toBeNull();
		expect(result?.anchor.anchorText).toBe("Context text here");
	});

	test("returns anchor with position data", () => {
		container.innerHTML = `<a id="test-anchor"></a>`;

		const result = findHiddenAnchorById(container, "test-anchor");

		expect(result).not.toBeNull();
		expect(result?.position).toHaveProperty("x");
		expect(result?.position).toHaveProperty("y");
	});

	test("returns anchor element reference", () => {
		container.innerHTML = `<a id="test-anchor"></a>`;

		const result = findHiddenAnchorById(container, "test-anchor");

		expect(result).not.toBeNull();
		expect(result?.element).toBeInstanceOf(HTMLAnchorElement);
		expect(result?.element.id).toBe("test-anchor");
	});
});
