/**
 * Unit tests for the platform conditional pre-processor.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { preprocessConditionals } from "../../build/preprocessor.js";
import { expectRight } from "../helpers/index.js";

describe("preprocessConditionals", () => {
	describe("platform inclusion with if", () => {
		test("includes content when platform matches", async () => {
			const content = [
				"Common content.",
				'{% if platform == "codex" %}',
				"Codex only content.",
				"{% endif %}",
				"More common.",
			].join("\n");

			const result = await preprocessConditionals(content, "codex");
			const output = expectRight(result);

			expect(output).toContain("Common content.");
			expect(output).toContain("Codex only content.");
			expect(output).toContain("More common.");
		});

		test("excludes content when platform does not match", async () => {
			const content = [
				"Common content.",
				'{% if platform == "codex" %}',
				"Codex only content.",
				"{% endif %}",
				"More common.",
			].join("\n");

			const result = await preprocessConditionals(content, "opencode");
			const output = expectRight(result);

			expect(output).toContain("Common content.");
			expect(output).not.toContain("Codex only content.");
			expect(output).toContain("More common.");
		});

		test("handles claude-code platform value", async () => {
			const content = [
				"Start.",
				'{% if platform == "claude-code" %}',
				"CC specific.",
				"{% endif %}",
				"End.",
			].join("\n");

			const included = expectRight(
				await preprocessConditionals(content, "claude-code"),
			);
			expect(included).toContain("CC specific.");

			const excluded = expectRight(
				await preprocessConditionals(content, "opencode"),
			);
			expect(excluded).not.toContain("CC specific.");
		});
	});

	describe("platform exclusion with unless", () => {
		test("includes content when platform does not match", async () => {
			const content = [
				"Start.",
				'{% unless platform == "claude-code" %}',
				"Not for CC.",
				"{% endunless %}",
				"End.",
			].join("\n");

			const result = await preprocessConditionals(content, "opencode");
			const output = expectRight(result);

			expect(output).toContain("Not for CC.");
		});

		test("excludes content when platform matches", async () => {
			const content = [
				"Start.",
				'{% unless platform == "claude-code" %}',
				"Not for CC.",
				"{% endunless %}",
				"End.",
			].join("\n");

			const result = await preprocessConditionals(content, "claude-code");
			const output = expectRight(result);

			expect(output).not.toContain("Not for CC.");
		});
	});

	describe("case/when syntax", () => {
		test("selects matching when branch", async () => {
			const content = [
				"Start.",
				"{% case platform %}",
				'{% when "opencode" %}',
				"OpenCode instructions.",
				'{% when "codex" %}',
				"Codex instructions.",
				'{% when "claude-code" %}',
				"CC instructions.",
				"{% endcase %}",
				"End.",
			].join("\n");

			const ocResult = expectRight(
				await preprocessConditionals(content, "opencode"),
			);
			expect(ocResult).toContain("OpenCode instructions.");
			expect(ocResult).not.toContain("Codex instructions.");
			expect(ocResult).not.toContain("CC instructions.");

			const cxResult = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(cxResult).toContain("Codex instructions.");
			expect(cxResult).not.toContain("OpenCode instructions.");
		});
	});

	describe("code block protection", () => {
		test("preserves Liquid-like syntax inside fenced code blocks", async () => {
			const content = [
				"Some text.",
				"```liquid",
				'{% if platform == "codex" %}',
				"This is a code example.",
				"{% endif %}",
				"```",
				"After code block.",
			].join("\n");

			const result = await preprocessConditionals(content, "opencode");
			const output = expectRight(result);

			// The code block content should be preserved verbatim
			expect(output).toContain('{% if platform == "codex" %}');
			expect(output).toContain("This is a code example.");
			expect(output).toContain("{% endif %}");
			expect(output).toContain("```liquid");
		});

		test("protects {{ variable }} syntax in code blocks", async () => {
			const content = [
				"Text before.",
				"```typescript",
				"const x = {{ someVar }};",
				"```",
				"Text after.",
			].join("\n");

			const result = await preprocessConditionals(content, "codex");
			const output = expectRight(result);

			expect(output).toContain("{{ someVar }}");
		});

		test("handles multiple code blocks", async () => {
			const content = [
				"Intro.",
				"```",
				"{% if foo %}block1{% endif %}",
				"```",
				'{% if platform == "codex" %}',
				"Codex section.",
				"{% endif %}",
				"```bash",
				"echo {{ value }}",
				"```",
				"End.",
			].join("\n");

			const result = await preprocessConditionals(content, "codex");
			const output = expectRight(result);

			expect(output).toContain("{% if foo %}block1{% endif %}");
			expect(output).toContain("Codex section.");
			expect(output).toContain("echo {{ value }}");
		});
	});

	describe("nested conditionals", () => {
		test("handles nested if blocks", async () => {
			const content = [
				"Start.",
				'{% if platform == "codex" %}',
				"Codex outer.",
				'{% if platform == "codex" %}',
				"Codex inner.",
				"{% endif %}",
				"{% endif %}",
				"End.",
			].join("\n");

			const result = await preprocessConditionals(content, "codex");
			const output = expectRight(result);

			expect(output).toContain("Codex outer.");
			expect(output).toContain("Codex inner.");
		});

		test("handles if/else blocks", async () => {
			const content = [
				"Start.",
				'{% if platform == "codex" %}',
				"Codex content.",
				"{% else %}",
				"Other content.",
				"{% endif %}",
				"End.",
			].join("\n");

			const codexResult = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(codexResult).toContain("Codex content.");
			expect(codexResult).not.toContain("Other content.");

			const ocResult = expectRight(
				await preprocessConditionals(content, "opencode"),
			);
			expect(ocResult).not.toContain("Codex content.");
			expect(ocResult).toContain("Other content.");
		});
	});

	describe("no-op for files without conditionals", () => {
		test("passes through content without Liquid tags unchanged", async () => {
			const content = [
				"# My Skill",
				"",
				"This is a regular skill file.",
				"It has no platform conditionals.",
				"",
				"## Instructions",
				"",
				"Do the thing.",
			].join("\n");

			const result = await preprocessConditionals(content, "opencode");
			const output = expectRight(result);

			expect(output).toBe(content);
		});

		test("preserves empty content", async () => {
			const result = await preprocessConditionals("", "codex");
			const output = expectRight(result);

			expect(output).toBe("");
		});
	});

	describe("semantic tag integration", () => {
		test("dispatch_agent tag evaluates during preprocessing", async () => {
			const content = [
				"Start.",
				'{% dispatch_agent "rp1-dev:code-writer", "Write code" %}',
				"End.",
			].join("\n");

			const ccResult = expectRight(
				await preprocessConditionals(content, "claude-code"),
			);
			expect(ccResult).toContain("Task tool:");
			expect(ccResult).toContain("subagent_type: rp1-dev:code-writer");
			expect(ccResult).not.toContain("dispatch_agent");

			const ocResult = expectRight(
				await preprocessConditionals(content, "opencode"),
			);
			expect(ocResult).toContain("task tool:");
			expect(ocResult).toContain("@rp1-dev/code-writer");

			const cxResult = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(cxResult).toContain("Spawn agent:");
			expect(cxResult).toContain("rp1-dev-code-writer");
		});

		test("semantic tags work alongside platform conditionals", async () => {
			const content = [
				"Common intro.",
				'{% if platform == "codex" %}',
				"Codex-specific preamble.",
				"{% endif %}",
				'{% edit_model "update the config" %}',
				"Common outro.",
			].join("\n");

			const ccResult = expectRight(
				await preprocessConditionals(content, "claude-code"),
			);
			expect(ccResult).toContain("Common intro.");
			expect(ccResult).not.toContain("Codex-specific preamble.");
			expect(ccResult).toContain("Edit tool");
			expect(ccResult).toContain("Common outro.");

			const cxResult = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(cxResult).toContain("Codex-specific preamble.");
			expect(cxResult).toContain("apply_patch tool");
		});

		test("semantic tags inside code blocks are preserved", async () => {
			const content = [
				"Text before.",
				"```markdown",
				'{% dispatch_agent "rp1-dev:writer", "example" %}',
				"```",
				"Text after.",
			].join("\n");

			const result = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(result).toContain("{% dispatch_agent");
			expect(result).toContain("Text before.");
			expect(result).toContain("Text after.");
		});

		test("ask_user tag evaluates during preprocessing", async () => {
			const content = '{% ask_user "Pick one", options: "A", "B" %}';

			const cxResult = expectRight(
				await preprocessConditionals(content, "codex"),
			);
			expect(cxResult).toContain("request_user_input");
			expect(cxResult).toContain('"A"');
			expect(cxResult).toContain('"B"');
		});
	});

	describe("error handling", () => {
		test("returns Left on malformed Liquid syntax", async () => {
			const content = ["Start.", "{% if %}", "Bad syntax.", "{% endif %}"].join(
				"\n",
			);

			const result = await preprocessConditionals(content, "codex");

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("GenerationError");
			}
		});
	});
});
