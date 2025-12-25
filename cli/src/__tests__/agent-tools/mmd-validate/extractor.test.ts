/**
 * Unit tests for mmd-validate extractor module.
 * Tests Mermaid block extraction from markdown documents.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import {
	extractMermaidBlocks,
	isRawMermaid,
} from "../../../agent-tools/mmd-validate/extractor.js";
import { expectRight } from "../../helpers/index.js";

describe("extractor", () => {
	describe("isRawMermaid", () => {
		test("returns true for flowchart declaration", () => {
			expect(isRawMermaid("flowchart TD\n  A --> B")).toBe(true);
		});

		test("returns true for graph declaration", () => {
			expect(isRawMermaid("graph LR\n  Start --> End")).toBe(true);
		});

		test("returns true for sequenceDiagram", () => {
			expect(isRawMermaid("sequenceDiagram\n  Alice->>Bob: Hello")).toBe(true);
		});

		test("returns true for classDiagram", () => {
			expect(isRawMermaid("classDiagram\n  class Animal")).toBe(true);
		});

		test("returns true for stateDiagram", () => {
			expect(isRawMermaid("stateDiagram-v2\n  [*] --> Active")).toBe(true);
		});

		test("returns true for erDiagram", () => {
			expect(isRawMermaid("erDiagram\n  USER ||--o{ ORDER : places")).toBe(
				true,
			);
		});

		test("returns true for gantt", () => {
			expect(isRawMermaid("gantt\n  title A Gantt Diagram")).toBe(true);
		});

		test("returns true for pie", () => {
			expect(isRawMermaid('pie title Pets\n  "Dogs" : 386')).toBe(true);
		});

		test("returns true for mindmap", () => {
			expect(isRawMermaid("mindmap\n  root((mindmap))")).toBe(true);
		});

		test("returns true for timeline", () => {
			expect(isRawMermaid("timeline\n  title History")).toBe(true);
		});

		test("returns true for journey", () => {
			expect(isRawMermaid("journey\n  title My working day")).toBe(true);
		});

		test("returns true for gitGraph", () => {
			expect(isRawMermaid("gitGraph\n  commit")).toBe(true);
		});

		test("returns true for C4Context", () => {
			expect(isRawMermaid("C4Context\n  title System Context")).toBe(true);
		});

		test("returns true for quadrantChart", () => {
			expect(isRawMermaid("quadrantChart\n  title Reach and engagement")).toBe(
				true,
			);
		});

		test("returns true for xychart", () => {
			expect(isRawMermaid('xychart-beta\n  x-axis "Jan"')).toBe(true);
		});

		test("returns true for sankey", () => {
			expect(isRawMermaid("sankey-beta\n  A,B,5")).toBe(true);
		});

		test("returns true for block-beta", () => {
			expect(isRawMermaid("block-beta\n  columns 3")).toBe(true);
		});

		test("returns true for zenuml", () => {
			expect(isRawMermaid("zenuml\n  title Order Service")).toBe(true);
		});

		test("returns false for plain text", () => {
			expect(isRawMermaid("This is just some text")).toBe(false);
		});

		test("returns false for markdown content", () => {
			expect(isRawMermaid("# Heading\n\nSome paragraph")).toBe(false);
		});

		test("returns false for empty string", () => {
			expect(isRawMermaid("")).toBe(false);
		});

		test("returns false for markdown with mermaid fences", () => {
			expect(isRawMermaid("```mermaid\ngraph TD\n```")).toBe(false);
		});

		test("handles whitespace before diagram declaration", () => {
			expect(isRawMermaid("  flowchart TD\n  A --> B")).toBe(true);
		});

		test("case insensitive for diagram types", () => {
			expect(isRawMermaid("FLOWCHART TD\n  A --> B")).toBe(true);
			expect(isRawMermaid("Graph LR\n  A --> B")).toBe(true);
		});
	});

	describe("extractMermaidBlocks", () => {
		test("extracts single mermaid block", () => {
			const markdown = `# Document

Some text.

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

More text.
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(1);
			expect(result[0].index).toBe(0);
			expect(result[0].content).toBe("graph TD\n  A --> B");
			expect(result[0].startLine).toBe(6);
		});

		test("extracts multiple mermaid blocks", () => {
			const markdown = `# Document

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

Some text between.

\`\`\`mermaid
sequenceDiagram
  Alice->>Bob: Hello
\`\`\`

End.
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(2);
			expect(result[0].index).toBe(0);
			expect(result[0].content).toBe("graph TD\n  A --> B");
			expect(result[1].index).toBe(1);
			expect(result[1].content).toBe("sequenceDiagram\n  Alice->>Bob: Hello");
		});

		test("returns empty array when no mermaid blocks found", () => {
			const markdown = `# Document

Just some text without diagrams.

\`\`\`javascript
const x = 1;
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(0);
		});

		test("ignores non-mermaid code blocks", () => {
			const markdown = `\`\`\`javascript
const x = 1;
\`\`\`

\`\`\`mermaid
graph TD
  A --> B
\`\`\`

\`\`\`python
print("hello")
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe("graph TD\n  A --> B");
		});

		test("handles raw mermaid input (no fences)", () => {
			const rawMermaid = `flowchart TD
  A --> B
  B --> C`;

			const result = expectRight(extractMermaidBlocks(rawMermaid));

			expect(result).toHaveLength(1);
			expect(result[0].index).toBe(0);
			expect(result[0].content).toBe("flowchart TD\n  A --> B\n  B --> C");
			expect(result[0].startLine).toBe(1);
		});

		test("preserves line number offset for first block", () => {
			const markdown = `line 1
line 2
line 3
\`\`\`mermaid
graph TD
  A --> B
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result[0].startLine).toBe(5);
		});

		test("calculates correct line numbers for multiple blocks", () => {
			const markdown = `\`\`\`mermaid
graph TD
\`\`\`

\`\`\`mermaid
pie
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result[0].startLine).toBe(2);
			expect(result[1].startLine).toBe(6);
		});

		test("calculates endLine correctly", () => {
			const markdown = `\`\`\`mermaid
graph TD
  A --> B
  B --> C
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result[0].startLine).toBe(2);
			expect(result[0].endLine).toBe(5);
		});

		test("trims content whitespace", () => {
			const markdown = `\`\`\`mermaid

graph TD
  A --> B

\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result[0].content).toBe("graph TD\n  A --> B");
		});

		test("handles Windows-style line endings (CRLF)", () => {
			const markdown = "```mermaid\r\ngraph TD\r\n  A --> B\r\n```\r\n";
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(1);
			expect(result[0].content).toContain("graph TD");
		});

		test("handles empty mermaid blocks", () => {
			const markdown = `\`\`\`mermaid
\`\`\`
`;
			const result = expectRight(extractMermaidBlocks(markdown));

			expect(result).toHaveLength(1);
			expect(result[0].content).toBe("");
		});

		test("returns Right with Either result", () => {
			const markdown = "```mermaid\ngraph TD\n```";
			const result = extractMermaidBlocks(markdown);

			expect(E.isRight(result)).toBe(true);
		});
	});
});
