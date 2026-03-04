/**
 * Unit tests for state machine mermaid extraction from markdown files.
 * Tests edge cases: section present/absent, mermaid type, multiple blocks, whitespace.
 */

import { describe, expect, test } from "bun:test";
import { extractStateMachineMermaid } from "../../../agent-tools/state-machine/extractor.js";

const validSkillMd = `---
name: build
description: "Build workflow"
---

# Build Skill

Some content here.

## STATE-MACHINE

\`\`\`mermaid
stateDiagram-v2
    [*] --> requirements
    requirements --> design : reqs_complete
    design --> [*] : done
\`\`\`

**On each transition**, report via CLI.

## Next Section

More content.
`;

const validAgentMd = `---
name: task-builder
---

# Task Builder Agent

## STATE-MACHINE

\`\`\`mermaid
stateDiagram-v2
    [*] --> building
    building --> completed : build_success
    building --> failed : build_error
    completed --> [*]
    failed --> [*]
\`\`\`

## Implementation
`;

describe("extractStateMachineMermaid", () => {
	test("extracts stateDiagram-v2 from valid ## STATE-MACHINE section", () => {
		const result = extractStateMachineMermaid(validSkillMd);

		expect(result).not.toBeNull();
		expect(result).toContain("stateDiagram-v2");
		expect(result).toContain("[*] --> requirements");
		expect(result).toContain("requirements --> design : reqs_complete");
	});

	test("extracts from agent markdown file", () => {
		const result = extractStateMachineMermaid(validAgentMd);

		expect(result).not.toBeNull();
		expect(result).toContain("stateDiagram-v2");
		expect(result).toContain("[*] --> building");
		expect(result).toContain("building --> completed : build_success");
	});

	test("returns null when no STATE-MACHINE section exists", () => {
		const md = `# Some File\n\n## Other Section\n\nContent here.\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).toBeNull();
	});

	test("returns null for old section sign header format", () => {
		const md = `## \u00a7STATE-MACHINE\n\n\`\`\`mermaid\nstateDiagram-v2\n    [*] --> s1\n\`\`\`\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).toBeNull();
	});

	test("returns null when section exists but has no mermaid block", () => {
		const md = `## STATE-MACHINE\n\nSome text but no mermaid block.\n\n## Next\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).toBeNull();
	});

	test("returns null when mermaid block is not stateDiagram-v2", () => {
		const md = `## STATE-MACHINE\n\n\`\`\`mermaid\ngraph TD\n    A --> B\n\`\`\`\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).toBeNull();
	});

	test("uses first stateDiagram-v2 block when multiple mermaid blocks exist", () => {
		const md = `## STATE-MACHINE

\`\`\`mermaid
stateDiagram-v2
    [*] --> first
    first --> [*]
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> second
    second --> [*]
\`\`\`

## Next
`;
		const result = extractStateMachineMermaid(md);

		expect(result).not.toBeNull();
		expect(result).toContain("[*] --> first");
		expect(result).not.toContain("[*] --> second");
	});

	test("skips non-stateDiagram mermaid block and finds stateDiagram-v2 block", () => {
		const md = `## STATE-MACHINE

\`\`\`mermaid
graph TD
    A --> B
\`\`\`

\`\`\`mermaid
stateDiagram-v2
    [*] --> correct
    correct --> [*]
\`\`\`
`;
		const result = extractStateMachineMermaid(md);

		expect(result).not.toBeNull();
		expect(result).toContain("[*] --> correct");
	});

	test("handles section at end of file (no next section)", () => {
		const md = `# Title\n\n## STATE-MACHINE\n\n\`\`\`mermaid\nstateDiagram-v2\n    [*] --> s1\n    s1 --> [*]\n\`\`\`\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).not.toBeNull();
		expect(result).toContain("[*] --> s1");
	});

	test("returns content without fence markers", () => {
		const result = extractStateMachineMermaid(validSkillMd);

		expect(result).not.toBeNull();
		expect(result).not.toContain("```mermaid");
		expect(result).not.toContain("```");
	});

	test("returned content ends with newline", () => {
		const result = extractStateMachineMermaid(validSkillMd);

		expect(result).not.toBeNull();
		expect(result?.endsWith("\n")).toBe(true);
	});

	test("handles empty markdown content", () => {
		const result = extractStateMachineMermaid("");

		expect(result).toBeNull();
	});

	test("handles whitespace after section header", () => {
		const md = `## STATE-MACHINE   \n\n\`\`\`mermaid\nstateDiagram-v2\n    [*] --> s1\n    s1 --> [*]\n\`\`\`\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).not.toBeNull();
		expect(result).toContain("[*] --> s1");
	});

	test("does not match level 3 heading ### STATE-MACHINE", () => {
		const md = `### STATE-MACHINE\n\n\`\`\`mermaid\nstateDiagram-v2\n    [*] --> s1\n\`\`\`\n`;
		const result = extractStateMachineMermaid(md);

		expect(result).toBeNull();
	});

	test("extracted content is parseable by parseAndTransform", async () => {
		const { parseAndTransform } = await import(
			"../../../agent-tools/state-machine/transform.js"
		);

		const result = extractStateMachineMermaid(validSkillMd);
		expect(result).not.toBeNull();

		if (result === null) throw new Error("Expected non-null result");
		const parseResult = parseAndTransform("test", result);
		expect(parseResult._tag).toBe("Right");
	});
});
