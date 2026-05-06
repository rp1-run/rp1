import { describe, expect, test } from "bun:test";
import {
	parseWalkthroughSlideSource,
	type WalkthroughSlideSourceArtifact,
	type WalkthroughSlideSourceFallbackReason,
} from "../../lib/walkthrough-slide-source";

const markdownArtifact: WalkthroughSlideSourceArtifact = {
	path: ".rp1/work/pr-walkthroughs/pr-42-walkthrough-001.md",
	type: "markdown",
	locationKind: "file",
};

const contractFrontmatter = `---
rp1_contract: pr-walkthrough-slide-source
rp1_contract_version: "1.0.0"
rp1_review_id: pr-42
rp1_evidence_ids:
  - E-PR-001
  - E-FILE-001
---
`;

function parse(markdown: string) {
	return parseWalkthroughSlideSource({
		artifact: markdownArtifact,
		markdown,
	});
}

describe("parseWalkthroughSlideSource", () => {
	test("parses a valid slide-source contract into grouped slides and notes", () => {
		const markdown = `${contractFrontmatter}
# PR Walkthrough: Checkout Reader

Plain markdown intro remains fallback-readable.

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 0
evidence: [E-PR-001]
-->
## At A Glance

- Purpose cites E-PR-001.

<!-- rp1-notes -->
Notes:

- Speaker notes preserve E-PR-001.

<!-- rp1-slide: vertical -->
<!-- rp1-slide-meta
id: slide-001-detail-001
role: implementation-depth
depth: 1
evidence: [E-DIFF-001]
-->
### Implementation Depth

Nested detail cites E-DIFF-001.

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-002
role: reviewer-focus
depth: 0
evidence: [E-FILE-001]
-->
## Reviewer Focus

Start in the changed files. E-FILE-001
`;

		const result = parse(markdown);

		expect(result.kind).toBe("deck");
		if (result.kind !== "deck") throw new Error(result.message);

		expect(result.sourceMarkdown).toBe(markdown);
		expect(result.deck.title).toBe("PR Walkthrough: Checkout Reader");
		expect(result.deck.reviewId).toBe("pr-42");
		expect(result.deck.evidenceIds).toEqual([
			"E-PR-001",
			"E-FILE-001",
			"E-DIFF-001",
		]);
		expect(result.deck.slides).toHaveLength(2);

		const firstGroup = result.deck.slides[0];
		expect(firstGroup.horizontal).toMatchObject({
			id: "slide-001",
			role: "at-a-glance",
			depth: 0,
			evidenceIds: ["E-PR-001"],
			markdown: "## At A Glance\n\n- Purpose cites E-PR-001.",
			notesMarkdown: "Notes:\n\n- Speaker notes preserve E-PR-001.",
		});
		expect(firstGroup.vertical).toHaveLength(1);
		expect(firstGroup.vertical[0]).toMatchObject({
			id: "slide-001-detail-001",
			role: "implementation-depth",
			depth: 1,
			evidenceIds: ["E-DIFF-001"],
			notesMarkdown: null,
		});
		expect(result.deck.slides[1].horizontal.id).toBe("slide-002");
	});

	test("ignores marker-like text inside fenced code blocks", () => {
		const markdown = `${contractFrontmatter}
# PR Walkthrough: Marker Safety

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: marker-safety
depth: 0
evidence: [E-PR-001]
-->
## Marker Safety

Inline prose can mention <!-- rp1-slide: vertical --> without becoming a slide.

\`\`\`markdown
<!-- rp1-slide: horizontal -->
<!-- rp1-notes -->
<!-- rp1-slide: vertical -->
\`\`\`

<!-- rp1-notes -->
Notes:

- Only this notes marker is structural. E-PR-001

<!-- rp1-slide: vertical -->
<!-- rp1-slide-meta
id: slide-001-detail-001
role: detail
depth: 1
evidence: [E-FILE-001]
-->
### Detail

The only vertical slide is outside the code fence. E-FILE-001
`;

		const result = parse(markdown);

		expect(result.kind).toBe("deck");
		if (result.kind !== "deck") throw new Error(result.message);

		const firstSlide = result.deck.slides[0].horizontal;
		expect(result.deck.slides).toHaveLength(1);
		expect(result.deck.slides[0].vertical).toHaveLength(1);
		expect(firstSlide.markdown).toContain("```markdown");
		expect(firstSlide.markdown).toContain("<!-- rp1-slide: horizontal -->");
		expect(firstSlide.markdown).toContain("<!-- rp1-notes -->");
		expect(firstSlide.notesMarkdown).toBe(
			"Notes:\n\n- Only this notes marker is structural. E-PR-001",
		);
	});

	test("returns fallback reasons while preserving source markdown", () => {
		const cases: ReadonlyArray<{
			readonly name: string;
			readonly artifact: WalkthroughSlideSourceArtifact | null;
			readonly markdown: string;
			readonly reason: WalkthroughSlideSourceFallbackReason;
		}> = [
			{
				name: "url artifact",
				artifact: {
					path: "https://example.com/report",
					type: "link",
					locationKind: "url",
				},
				markdown: contractFrontmatter,
				reason: "non-file-artifact",
			},
			{
				name: "non-markdown artifact",
				artifact: {
					path: ".rp1/work/pr-walkthroughs/pr-42.json",
					type: "other",
					locationKind: "file",
				},
				markdown: contractFrontmatter,
				reason: "unsupported-artifact-type",
			},
			{
				name: "missing frontmatter",
				artifact: markdownArtifact,
				markdown: "# PR Review\n\nNo frontmatter.",
				reason: "missing-frontmatter",
			},
			{
				name: "ordinary markdown",
				artifact: markdownArtifact,
				markdown: "---\nrp1_contract: pr-review\n---\n# PR Review\n",
				reason: "unsupported-contract",
			},
			{
				name: "unsupported contract version",
				artifact: markdownArtifact,
				markdown:
					"---\nrp1_contract: pr-walkthrough-slide-source\nrp1_contract_version: 9.9.9\n---\n# PR Walkthrough\n",
				reason: "unsupported-contract-version",
			},
			{
				name: "no horizontal slide marker",
				artifact: markdownArtifact,
				markdown: `${contractFrontmatter}# PR Walkthrough\n\nBody only.\n`,
				reason: "missing-horizontal-slide",
			},
		];

		for (const testCase of cases) {
			const result = parseWalkthroughSlideSource({
				artifact: testCase.artifact,
				markdown: testCase.markdown,
			});

			expect(result.kind, testCase.name).toBe("fallback");
			if (result.kind !== "fallback") {
				throw new Error(`${testCase.name} unexpectedly parsed as a deck`);
			}
			expect(result.reason, testCase.name).toBe(testCase.reason);
			expect(result.sourceMarkdown, testCase.name).toBe(testCase.markdown);
			expect(result.message.length, testCase.name).toBeGreaterThan(0);
		}
	});

	test("rejects vertical slides before a horizontal parent", () => {
		const result = parse(`${contractFrontmatter}
# PR Walkthrough: Invalid Order

<!-- rp1-slide: vertical -->
<!-- rp1-slide-meta
id: slide-001-detail-001
role: detail
depth: 1
evidence: [E-PR-001]
-->
### Detail

This vertical slide has no parent.
`);

		expect(result.kind).toBe("fallback");
		if (result.kind !== "fallback") {
			throw new Error("Invalid slide order unexpectedly parsed as a deck");
		}
		expect(result.reason).toBe("vertical-without-horizontal");
	});

	test("rejects missing or incomplete slide metadata", () => {
		const missingMetadata = parse(`${contractFrontmatter}
# PR Walkthrough: Missing Metadata

<!-- rp1-slide: horizontal -->
## At A Glance
`);

		expect(missingMetadata.kind).toBe("fallback");
		if (missingMetadata.kind !== "fallback") {
			throw new Error("Missing metadata unexpectedly parsed as a deck");
		}
		expect(missingMetadata.reason).toBe("missing-slide-metadata");

		const incompleteMetadata = parse(`${contractFrontmatter}
# PR Walkthrough: Incomplete Metadata

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 0
-->
## At A Glance
`);

		expect(incompleteMetadata.kind).toBe("fallback");
		if (incompleteMetadata.kind !== "fallback") {
			throw new Error("Incomplete metadata unexpectedly parsed as a deck");
		}
		expect(incompleteMetadata.reason).toBe("invalid-slide-metadata");
	});

	test("rejects malformed slide markers, duplicate IDs, and invalid depths", () => {
		const cases: ReadonlyArray<{
			readonly name: string;
			readonly markdown: string;
			readonly reason: WalkthroughSlideSourceFallbackReason;
		}> = [
			{
				name: "unsupported direction",
				markdown: `${contractFrontmatter}
# PR Walkthrough: Bad Direction

<!-- rp1-slide: diagonal -->
<!-- rp1-slide-meta
id: slide-001
role: bad-direction
depth: 0
evidence: [E-PR-001]
-->
## Bad Direction
`,
				reason: "invalid-slide-marker",
			},
			{
				name: "duplicate slide IDs",
				markdown: `${contractFrontmatter}
# PR Walkthrough: Duplicate IDs

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: first
depth: 0
evidence: [E-PR-001]
-->
## First

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: second
depth: 0
evidence: [E-FILE-001]
-->
## Second
`,
				reason: "invalid-slide-metadata",
			},
			{
				name: "horizontal depth greater than zero",
				markdown: `${contractFrontmatter}
# PR Walkthrough: Bad Horizontal Depth

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 1
evidence: [E-PR-001]
-->
## At A Glance
`,
				reason: "invalid-slide-depth",
			},
			{
				name: "vertical depth zero",
				markdown: `${contractFrontmatter}
# PR Walkthrough: Bad Vertical Depth

<!-- rp1-slide: horizontal -->
<!-- rp1-slide-meta
id: slide-001
role: at-a-glance
depth: 0
evidence: [E-PR-001]
-->
## At A Glance

<!-- rp1-slide: vertical -->
<!-- rp1-slide-meta
id: slide-001-detail-001
role: detail
depth: 0
evidence: [E-FILE-001]
-->
### Detail
`,
				reason: "invalid-slide-depth",
			},
		];

		for (const testCase of cases) {
			const result = parse(testCase.markdown);

			expect(result.kind, testCase.name).toBe("fallback");
			if (result.kind !== "fallback") {
				throw new Error(`${testCase.name} unexpectedly parsed as a deck`);
			}
			expect(result.reason, testCase.name).toBe(testCase.reason);
			expect(result.sourceMarkdown, testCase.name).toBe(testCase.markdown);
		}
	});
});
