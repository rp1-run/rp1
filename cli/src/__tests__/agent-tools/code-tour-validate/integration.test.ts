/**
 * Integration tests for the code-tour-validate tool.
 * Exercises the execute seam: envelope shape on success/failure and the
 * mapping of CodeTourValidationIssue path/message into ToolError.context/message.
 * Validator internals are covered by cli/src/__tests__/shared/code-tour.test.ts.
 */

import { beforeAll, describe, expect, it } from "bun:test";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { execute } from "../../../agent-tools/code-tour-validate/index.js";

const FIXTURE_PATH = path.join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"..",
	"..",
	"plugins",
	"base",
	"skills",
	"artifact-templates",
	"templates",
	"pr-walkthrough-reporter",
	"code-tour.json",
);

const TOOL_OPTIONS = { inputSource: "file" as const };

/**
 * Strip a leading `---`-delimited YAML frontmatter block, returning the JSON body.
 * parseCodeTourDocument calls JSON.parse directly, so the template header must go.
 */
const stripFrontmatter = (raw: string): string => {
	const match = raw.match(/^---\n[\s\S]*?\n---\n/);
	return match ? raw.slice(match[0].length) : raw;
};

describe("code-tour-validate integration", () => {
	let validJson: string;

	beforeAll(async () => {
		const raw = await Bun.file(FIXTURE_PATH).text();
		validJson = stripFrontmatter(raw);
	});

	it("returns a success envelope with the parsed document for a valid tour", async () => {
		const result = await execute(validJson, TOOL_OPTIONS)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(true);
		expect(envelope.tool).toBe("code-tour-validate");
		expect(envelope.errors).toBeUndefined();
		expect(envelope.data?.title).toBe("{PR_TITLE}");
		expect(envelope.data?.version).toBe("1.0");
	});

	it("reports an unsupported version as a failure envelope preserving path and message", async () => {
		const mutated = JSON.parse(validJson);
		mutated.version = "2.0";

		const result = await execute(JSON.stringify(mutated), TOOL_OPTIONS)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(false);
		expect(envelope.data).toBeNull();
		expect(envelope.errors).toContainEqual({
			context: "$.version",
			message: 'Unsupported Code Tour version "2.0"; expected "1.0"',
		});
	});

	it("reports a removed required field as a failure envelope preserving path and message", async () => {
		const mutated = JSON.parse(validJson);
		mutated.title = undefined;

		const result = await execute(JSON.stringify(mutated), TOOL_OPTIONS)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(false);
		expect(envelope.errors).toContainEqual({
			context: "$.title",
			message: "Required string is missing",
		});
	});

	it("reports an unresolved concept-to-fragment reference preserving path and message", async () => {
		const mutated = JSON.parse(validJson);
		mutated.concepts[0].fragments = ["missing-fragment"];

		const result = await execute(JSON.stringify(mutated), TOOL_OPTIONS)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(false);
		expect(envelope.errors).toContainEqual({
			context: "$.concepts[0].fragments[0]",
			message: 'Unknown fragment "missing-fragment"',
		});
	});

	it("reports malformed JSON as a failure envelope with the root path", async () => {
		const result = await execute("{not-json", TOOL_OPTIONS)();

		expect(E.isRight(result)).toBe(true);
		if (!E.isRight(result)) return;

		const envelope = result.right;
		expect(envelope.success).toBe(false);
		expect(envelope.data).toBeNull();
		expect(envelope.errors?.[0]?.context).toBe("$");
		expect(envelope.errors?.[0]?.message).toContain("Malformed JSON");
	});
});
