/**
 * Integration tests for the pr-cartography-validate tool.
 * Validator internals are covered by cli/src/__tests__/shared/pr-cartography.test.ts.
 */

import { describe, expect, it } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { execute } from "../../../agent-tools/pr-cartography-validate/index.js";

const validCartographyJson = (): string =>
	JSON.stringify({
		version: "1.0",
		kind: "pr-cartography",
		source: {
			source: "github_pr",
			target: "482",
			reviewId: "pr-482",
			baseRef: "main",
			headRef: "feat/cartography",
		},
		evidenceIndex: [
			{
				id: "E-DIFF-001",
				kind: "diff",
				source: "plugins/dev/skills/pr-walkthrough/SKILL.md",
				summary: "The walkthrough validates cartography before reporting.",
			},
		],
		files: [
			{
				id: "file-skill",
				path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
				evidenceIds: ["E-DIFF-001"],
			},
		],
		fragments: [
			{
				id: "frag-validation",
				fileId: "file-skill",
				path: "plugins/dev/skills/pr-walkthrough/SKILL.md",
				line: 1,
				lineEnd: 20,
				evidenceIds: ["E-DIFF-001"],
			},
		],
		boundaries: [
			{
				id: "boundary-validation",
				label: "Validation boundary",
				summary: "Cartography validation gates reporter dispatch.",
				fragmentIds: ["frag-validation"],
				contractIds: ["contract-cartography"],
				evidenceIds: ["E-DIFF-001"],
				confidence: "supported",
			},
		],
		contracts: [
			{
				id: "contract-cartography",
				label: "PR cartography contract",
				kind: "workflow-input",
				producer: "pr-cartographer",
				consumer: "pr-walkthrough-reporter",
				fragmentIds: ["frag-validation"],
				evidenceIds: ["E-DIFF-001"],
			},
		],
		entities: [],
		sideEffects: [],
		riskSurfaces: [
			{
				id: "risk-grounding",
				label: "Grounding",
				question: "Are all claims backed by supplied evidence references?",
				fragmentIds: ["frag-validation"],
				evidenceIds: ["E-DIFF-001"],
				confidence: "question",
			},
		],
		relationships: [
			{
				from: "boundary-validation",
				to: "contract-cartography",
				kind: "uses-contract",
				evidenceIds: ["E-DIFF-001"],
			},
		],
	});

describe("pr-cartography-validate integration", () => {
	it("returns a success envelope with the parsed document for valid stdin content", async () => {
		const result = await execute(validCartographyJson(), {
			inputSource: "stdin",
		})();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(true);
		expect(envelope.tool).toBe("pr-cartography-validate");
		expect(envelope.errors).toBeUndefined();
		expect(envelope.data?.version).toBe("1.0");
		expect(envelope.data?.kind).toBe("pr-cartography");
	});

	it("reports validation failures preserving JSON path and message", async () => {
		const mutated = JSON.parse(validCartographyJson());
		mutated.relationships[0].to = "missing-contract";
		mutated.riskSurfaces[0].question = "Should this PR be approved?";

		const result = await execute(JSON.stringify(mutated), {
			inputSource: "file",
			filePath: "cartography.json",
		})();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(false);
		expect(envelope.data).toBeNull();
		expect(envelope.errors).toContainEqual({
			context: "$.relationships[0].to",
			message: 'Unknown cartography relationship endpoint "missing-contract"',
		});
		expect(envelope.errors).toContainEqual({
			context: "$.riskSurfaces[0].question",
			message:
				"Risk surfaces must be phrased as reviewer focus or open questions; remove approval language",
		});
	});
});
