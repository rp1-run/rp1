import { describe, expect, test } from "bun:test";
import {
	projectMarkdown,
	resolveSourceAnchor,
} from "../../server/markdown-projection";
import type { TextSelectionAnchor } from "../../types/annotations";

function anchor(
	selectedText: string,
	contextBefore = "",
	contextAfter = "",
): TextSelectionAnchor {
	return {
		type: "text-selection",
		startOffset: 0,
		endOffset: 0,
		selectedText,
		contextBefore,
		contextAfter,
	};
}

const SOURCE = [
	"---",
	"rp1_doc_id: x",
	"---",
	"# Design",
	"",
	"| File | Role |",
	"| --- | --- |",
	"| `Support.kt` | THE single shared collaborator: `putAudit`, `audit`; exposes `val logger = getLogger<Svc>()` **verbatim type argument** |",
	"",
	"## REQ-001: Gate Discovery",
	"",
	"Priority: Must Have with escaped \\*literal\\* stars",
	"",
	"A [link label](https://example.com) inside prose.",
	"",
	"```mermaid",
	"flowchart TB",
	"    CM --> F",
	"    PS --> F",
	"```",
].join("\n");

describe("projectMarkdown", () => {
	test("projects rendered text without markdown syntax", () => {
		const { text } = projectMarkdown(SOURCE);
		expect(text).toContain("Design");
		expect(text).toContain("putAudit");
		expect(text).toContain("link label");
		expect(text).toContain("CM --> F");
		expect(text).not.toContain("**");
		expect(text).not.toContain("](https://");
		expect(text).not.toContain("rp1_doc_id");
	});

	test("maps every projected character to its source offset", () => {
		const { text, map } = projectMarkdown(SOURCE);
		expect(map.length).toBe(text.length);
		const idx = text.indexOf("putAudit");
		const sourceOffset = map[idx];
		expect(SOURCE.slice(sourceOffset, sourceOffset + "putAudit".length)).toBe(
			"putAudit",
		);
	});

	test("maps escaped characters to their unescaped source position", () => {
		const { text, map } = projectMarkdown(SOURCE);
		const idx = text.indexOf("*literal*");
		expect(idx).toBeGreaterThan(-1);
		// The projected '*' maps to the '*' after the backslash.
		expect(SOURCE[map[idx]]).toBe("*");
		expect(SOURCE[map[idx] - 1]).toBe("\\");
	});
});

describe("resolveSourceAnchor", () => {
	test("resolves rendered selection spanning inline code and bold to a verbatim source slice", () => {
		const resolved = resolveSourceAnchor(
			anchor(
				"THE single shared collaborator: putAudit, audit; exposes val logger = getLogger<Svc>() verbatim type argument",
				"Support.kt",
			),
			SOURCE,
		);
		expect(resolved).not.toBeNull();
		expect(SOURCE.includes(resolved!.text)).toBe(true);
		expect(resolved!.text).toContain("`putAudit`");
		expect(resolved!.text).toContain("**verbatim type argument");
		expect(SOURCE.slice(resolved!.start, resolved!.end)).toBe(resolved!.text);
	});

	test("resolves selections that span block boundaries", () => {
		const resolved = resolveSourceAnchor(
			anchor("REQ-001: Gate DiscoveryPriority: Must Have"),
			SOURCE,
		);
		expect(resolved).not.toBeNull();
		expect(resolved!.text).toBe(
			"REQ-001: Gate Discovery\n\nPriority: Must Have",
		);
	});

	test("resolves code block selections", () => {
		const resolved = resolveSourceAnchor(
			anchor("CM --> F\n    PS --> F", "flowchart TB"),
			SOURCE,
		);
		expect(resolved).not.toBeNull();
		expect(resolved!.text).toBe("CM --> F\n    PS --> F");
	});

	test("disambiguates repeated text via context", () => {
		const source = "alpha target beta\n\ngamma target delta\n";
		const first = resolveSourceAnchor(
			anchor("target", "alpha ", " beta"),
			source,
		);
		const second = resolveSourceAnchor(
			anchor("target", "gamma ", " delta"),
			source,
		);
		expect(first!.start).toBeLessThan(second!.start);
		expect(source.slice(second!.start, second!.end)).toBe("target");
		expect(second!.contextBefore.endsWith("gamma ")).toBe(true);
	});

	test("returns null for text that is not in the document", () => {
		expect(
			resolveSourceAnchor(anchor("this text does not exist anywhere"), SOURCE),
		).toBeNull();
	});

	test("returns null for legacy line-number-poisoned selections", () => {
		expect(
			resolveSourceAnchor(anchor(" CM --> F\n13    PS --> F"), SOURCE),
		).toBeNull();
	});
});
