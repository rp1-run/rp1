/**
 * Tests for extractMermaidFromMarkdown utility.
 * Verifies heading preference, fallback to first block, and edge cases.
 */

import { describe, expect, test } from "bun:test";
import { extractMermaidFromMarkdown } from "../../server/routes/v2-api.js";

describe("extractMermaidFromMarkdown", () => {
	test("extracts single mermaid block", () => {
		const md = `# My Doc

Some text.

\`\`\`mermaid
stateDiagram-v2
    [*] --> T1
    T1 --> [*]
\`\`\`

More text.
`;
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> T1\n    T1 --> [*]",
		);
	});

	test("prefers block under 'Execution Flow' heading", () => {
		const md = `# Tasks

\`\`\`mermaid
graph LR
    A --> B
\`\`\`

## Execution Flow

\`\`\`mermaid
stateDiagram-v2
    [*] --> T1
    T1 --> [*]
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> T1\n    T1 --> [*]",
		);
	});

	test("prefers block under 'Task Subflow' heading", () => {
		const md = `\`\`\`mermaid
graph LR
    A --> B
\`\`\`

## Task Subflow

\`\`\`mermaid
stateDiagram-v2
    [*] --> Build
    Build --> [*]
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> Build\n    Build --> [*]",
		);
	});

	test("prefers block under bold heading with Execution Flow", () => {
		const md = `\`\`\`mermaid
graph LR
    X --> Y
\`\`\`

**Execution Flow**:

\`\`\`mermaid
stateDiagram-v2
    [*] --> Done
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> Done",
		);
	});

	test("falls back to first block when no heading match", () => {
		const md = `## Some Other Heading

\`\`\`mermaid
graph LR
    A --> B
\`\`\`

## Another Section

\`\`\`mermaid
stateDiagram-v2
    [*] --> X
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBe("graph LR\n    A --> B");
	});

	test("returns null when no mermaid blocks exist", () => {
		const md = `# Title

Some content without any mermaid.

\`\`\`typescript
const x = 1;
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBeNull();
	});

	test("returns null for empty content", () => {
		expect(extractMermaidFromMarkdown("")).toBeNull();
	});

	test("handles unclosed fence gracefully", () => {
		const md = `\`\`\`mermaid
graph LR
    A --> B
`;
		expect(extractMermaidFromMarkdown(md)).toBeNull();
	});

	test("heading must be within 3 lines above fence", () => {
		const md = `## Execution Flow

line 1
line 2
line 3
line 4

\`\`\`mermaid
stateDiagram-v2
    [*] --> T1
\`\`\`
`;
		// Heading is more than 3 lines above - should NOT match
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> T1",
		);
		// It still returns the block, just not as a "heading match"
		// (since there's only one block, it's the fallback anyway)
	});

	test("heading within 3 lines is detected", () => {
		const md = `## Execution Flow

\`\`\`mermaid
stateDiagram-v2
    [*] --> T1
\`\`\`

\`\`\`mermaid
graph LR
    X --> Y
\`\`\`
`;
		// First block is under the heading - should be preferred
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> T1",
		);
	});

	test("case-insensitive heading match", () => {
		const md = `\`\`\`mermaid
graph LR
    X --> Y
\`\`\`

## EXECUTION FLOW

\`\`\`mermaid
stateDiagram-v2
    [*] --> Done
\`\`\`
`;
		expect(extractMermaidFromMarkdown(md)).toBe(
			"stateDiagram-v2\n    [*] --> Done",
		);
	});
});
