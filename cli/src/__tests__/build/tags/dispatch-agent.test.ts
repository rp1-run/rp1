/**
 * Unit tests for the dispatch_agent semantic tag.
 * Tests output correctness for all three platforms, dispatch modes,
 * and both inline and block syntax.
 */

import { describe, expect, test } from "bun:test";
import { Liquid } from "liquidjs";
import { registerTags } from "../../../build/tags/index.js";

function createLiquid(): Liquid {
	const liquid = new Liquid({
		strictVariables: false,
		strictFilters: false,
	});
	registerTags(liquid);
	return liquid;
}

async function render(template: string, platform: string): Promise<string> {
	const liquid = createLiquid();
	return (await liquid.parseAndRender(template, { platform })).trim();
}

describe("dispatch_agent tag", () => {
	describe("inline syntax", () => {
		const template =
			'{% dispatch_agent "rp1-dev:code-writer", "Write the implementation" %}';

		describe("claude-code", () => {
			test("renders Task tool format with correct subagent_type", async () => {
				const output = await render(template, "claude-code");
				expect(output).toContain("Task tool:");
				expect(output).toContain("subagent_type: rp1-dev:code-writer");
				expect(output).toContain('prompt: "Write the implementation"');
			});

			test("preserves CC-native colon namespace", async () => {
				const output = await render(template, "claude-code");
				expect(output).toContain("rp1-dev:code-writer");
				expect(output).not.toContain("@rp1-dev/");
				expect(output).not.toContain("rp1-dev-code-writer");
			});
		});

		describe("opencode", () => {
			test("renders task tool format with @-prefix namespace", async () => {
				const output = await render(template, "opencode");
				expect(output).toContain("task tool:");
				expect(output).toContain("subagent_type: @rp1-dev/code-writer");
				expect(output).toContain('prompt: "Write the implementation"');
			});

			test("uses lowercase 'task tool' (not 'Task tool')", async () => {
				const output = await render(template, "opencode");
				expect(output).toMatch(/^task tool:/);
			});
		});

		describe("codex (foreground)", () => {
			test("renders full spawn/wait protocol", async () => {
				const output = await render(template, "codex");
				expect(output).toContain("Spawn agent:");
				expect(output).toContain("agent_type: rp1-dev-code-writer");
				expect(output).toContain('prompt: "Write the implementation"');
				expect(output).toContain("Wait for the spawned agent to complete");
				expect(output).toContain("Do NOT proceed until the agent has finished");
			});

			test("uses hyphen namespace format", async () => {
				const output = await render(template, "codex");
				expect(output).toContain("rp1-dev-code-writer");
				expect(output).not.toContain("rp1-dev:");
				expect(output).not.toContain("@rp1-dev/");
			});
		});

		describe("codex (background)", () => {
			const bgTemplate =
				'{% dispatch_agent "rp1-dev:code-writer", "Write code", background %}';

			test("renders spawn with background indicator", async () => {
				const output = await render(bgTemplate, "codex");
				expect(output).toContain("Spawn agent (background):");
				expect(output).toContain("agent_type: rp1-dev-code-writer");
			});

			test("includes continue-working instructions instead of wait", async () => {
				const output = await render(bgTemplate, "codex");
				expect(output).toContain("This agent runs in the background");
				expect(output).not.toContain("Wait for the spawned agent to complete");
			});

			test("background mode does not affect CC output", async () => {
				const output = await render(bgTemplate, "claude-code");
				expect(output).toContain("Task tool:");
				expect(output).not.toContain("background");
			});
		});

		describe("all plugin prefixes", () => {
			test("handles rp1-base: prefix", async () => {
				const t = '{% dispatch_agent "rp1-base:knowledge-load", "Load KB" %}';

				const cc = await render(t, "claude-code");
				expect(cc).toContain("rp1-base:knowledge-load");

				const oc = await render(t, "opencode");
				expect(oc).toContain("@rp1-base/knowledge-load");

				const cx = await render(t, "codex");
				expect(cx).toContain("rp1-base-knowledge-load");
			});

			test("handles rp1-utils: prefix", async () => {
				const t = '{% dispatch_agent "rp1-utils:tersify-prompt", "Optimize" %}';

				const cc = await render(t, "claude-code");
				expect(cc).toContain("rp1-utils:tersify-prompt");

				const oc = await render(t, "opencode");
				expect(oc).toContain("@rp1-utils/tersify-prompt");

				const cx = await render(t, "codex");
				expect(cx).toContain("rp1-utils-tersify-prompt");
			});
		});
	});

	describe("block syntax", () => {
		const blockTemplate = `{% dispatch_agent "rp1-dev:feature-architect" %}
FEATURE_ID=my-feature, AFK=false, UPDATE_MODE=false, RP1_ROOT=/path/to/root
{% enddispatch_agent %}`;

		describe("claude-code", () => {
			test("renders Task tool with multi-line prompt", async () => {
				const output = await render(blockTemplate, "claude-code");
				expect(output).toContain("Task tool:");
				expect(output).toContain("subagent_type: rp1-dev:feature-architect");
				expect(output).toContain("FEATURE_ID=my-feature");
				expect(output).toContain("RP1_ROOT=/path/to/root");
			});

			test("does not quote multi-line prompt", async () => {
				const output = await render(blockTemplate, "claude-code");
				expect(output).not.toMatch(/prompt: "FEATURE_ID/);
				expect(output).toContain("prompt:");
				expect(output).toContain("FEATURE_ID=my-feature");
			});
		});

		describe("opencode", () => {
			test("renders task tool with @-prefix namespace", async () => {
				const output = await render(blockTemplate, "opencode");
				expect(output).toContain("task tool:");
				expect(output).toContain("subagent_type: @rp1-dev/feature-architect");
				expect(output).toContain("FEATURE_ID=my-feature");
			});
		});

		describe("codex", () => {
			test("renders spawn/wait with multi-line prompt", async () => {
				const output = await render(blockTemplate, "codex");
				expect(output).toContain("Spawn agent:");
				expect(output).toContain("agent_type: rp1-dev-feature-architect");
				expect(output).toContain("FEATURE_ID=my-feature");
				expect(output).toContain("Wait for the spawned agent to complete");
			});
		});

		test("block with background mode", async () => {
			const bgBlock = `{% dispatch_agent "rp1-dev:code-writer", background %}
Write all the code for feature X
{% enddispatch_agent %}`;
			const output = await render(bgBlock, "codex");
			expect(output).toContain("Spawn agent (background):");
			expect(output).toContain("Write all the code for feature X");
			expect(output).toContain("This agent runs in the background");
		});

		test("block preserves template variable placeholders", async () => {
			const tplBlock = `{% dispatch_agent "rp1-dev:builder" %}
FEATURE_ID=test, RP1_ROOT=@@RP1_OUTPUTTAG_0@@
{% enddispatch_agent %}`;
			const output = await render(tplBlock, "claude-code");
			expect(output).toContain("@@RP1_OUTPUTTAG_0@@");
		});

		test("block with complex multi-line prompt", async () => {
			const complexBlock = `{% dispatch_agent "rp1-dev:feature-requirement-gatherer" %}
FEATURE_ID=templated-spawns, REQUIREMENTS=Add templated rendering, AFK=false, RP1_ROOT=/root, WORKFLOW=build, RUN_ID=abc-123
{% enddispatch_agent %}`;
			const cc = await render(complexBlock, "claude-code");
			expect(cc).toContain("Task tool:");
			expect(cc).toContain("FEATURE_ID=templated-spawns");
			expect(cc).toContain("RUN_ID=abc-123");

			const cx = await render(complexBlock, "codex");
			expect(cx).toContain("Spawn agent:");
			expect(cx).toContain("rp1-dev-feature-requirement-gatherer");
		});
	});
});
