import { describe, expect, test } from "bun:test";
import { normalizeMermaidEscapedNewlines } from "../../lib/mermaid-utils";

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
});
