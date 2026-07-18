import { describe, expect, test } from "bun:test";
import {
	findTextRange,
	getEditableText,
	getEditableTextNodes,
} from "../../lib/editable-text-nodes";

describe("editable text nodes", () => {
	test("collects annotation text while skipping excluded UI chrome", () => {
		const container = document.createElement("article");
		container.innerHTML = `
			<p>Intro <strong>text</strong></p>
			<div data-annotation-exclude>
				<button>Copy</button>
				<span>Line 1</span>
			</div>
			<pre><code>const value = 1;</code></pre>
		`;

		const editableText = getEditableText(container).replace(/\s+/g, " ").trim();

		expect(editableText).toBe("Intro text const value = 1;");
		expect(
			getEditableTextNodes(container).some((node) =>
				node.textContent?.includes("Copy"),
			),
		).toBe(false);
	});

	test("skips Shiki line-number widgets", () => {
		const container = document.createElement("article");
		container.innerHTML = [
			"<pre><code>",
			'<span class="line-number ProseMirror-widget" contenteditable="false">1</span>',
			'<span class="shiki">flowchart TB</span>\n',
			'<span class="line-number ProseMirror-widget" contenteditable="false">2</span>',
			'<span class="shiki">    CM --&gt; F</span>',
			"</code></pre>",
		].join("");

		expect(getEditableText(container)).toBe("flowchart TB\n    CM --> F");
	});

	test("maps a character range across multiple text nodes", () => {
		const container = document.createElement("div");
		container.innerHTML = "<span>Alpha </span><span>Beta</span>";
		const nodes = getEditableTextNodes(container);

		const range = findTextRange(nodes, 3, 9);

		expect(range).not.toBeNull();
		expect(range?.startNode.textContent).toBe("Alpha ");
		expect(range?.startOffset).toBe(3);
		expect(range?.endNode.textContent).toBe("Beta");
		expect(range?.endOffset).toBe(3);
	});

	test("returns null when the requested range falls outside editable text", () => {
		const container = document.createElement("div");
		container.textContent = "short";

		expect(findTextRange(getEditableTextNodes(container), 2, 99)).toBeNull();
	});
});
