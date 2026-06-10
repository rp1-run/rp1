/**
 * Unit tests for the ask_user semantic tag.
 * Tests output correctness for all three platforms, options handling,
 * and Codex-specific constraints.
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

describe("ask_user tag", () => {
	describe("without options", () => {
		const template = '{% ask_user "What is your preference?" %}';

		test("CC: renders AskUserQuestion", async () => {
			const output = await render(template, "claude-code");
			expect(output).toBe('AskUserQuestion: "What is your preference?"');
		});

		test("OpenCode: renders ask_user", async () => {
			const output = await render(template, "opencode");
			expect(output).toBe('ask_user: "What is your preference?"');
		});

		test("Codex: renders request_user_input with placeholder options", async () => {
			const output = await render(template, "codex");
			expect(output).toContain(
				'request_user_input: "What is your preference?"',
			);
			expect(output).toContain("options:");
			expect(output).toContain("(provide appropriate options)");
			expect(output).toContain(
				"User input is unavailable in subagent contexts on Codex",
			);
		});
	});

	describe("copilot without options", () => {
		const template = '{% ask_user "What is your preference?" %}';

		test("renders ask_user format", async () => {
			const output = await render(template, "copilot");
			expect(output).toBe('ask_user: "What is your preference?"');
		});
	});

	describe("goose without options", () => {
		const template = '{% ask_user "What is your preference?" %}';

		test("renders direct unsupported elicitation guidance", async () => {
			const output = await render(template, "goose");
			expect(output).toContain("Goose unsupported capability");
			expect(output).toContain("interactive user input and elicitation");
			expect(output).toContain("Do not wait for headless approval");
			expect(output).toContain(
				'Stop and ask the user directly: "What is your preference?"',
			);
		});
	});

	describe("goose with options", () => {
		const template = '{% ask_user "Pick one", options: "Yes", "No", "Maybe" %}';

		test("preserves options in direct unsupported elicitation guidance", async () => {
			const output = await render(template, "goose");
			expect(output).toContain("Goose unsupported capability");
			expect(output).toContain('Stop and ask the user directly: "Pick one"');
			expect(output).toContain('Available options: "Yes", "No", "Maybe"');
		});
	});

	describe("copilot with options", () => {
		const template = '{% ask_user "Pick one", options: "Yes", "No", "Maybe" %}';

		test("renders ask_user with options list", async () => {
			const output = await render(template, "copilot");
			expect(output).toContain('ask_user: "Pick one"');
			expect(output).toContain("Options:");
			expect(output).toContain("- Yes");
			expect(output).toContain("- No");
			expect(output).toContain("- Maybe");
		});

		test("does not include Codex-specific sections", async () => {
			const output = await render(template, "copilot");
			expect(output).not.toContain("request_user_input");
			expect(output).not.toContain("**Checkpoint**:");
			expect(output).not.toContain("**Plain-text fallback**:");
			expect(output).not.toContain("subagent contexts");
		});
	});

	describe("with options", () => {
		const template = '{% ask_user "Pick one", options: "Yes", "No", "Maybe" %}';

		test("CC: renders AskUserQuestion with options list", async () => {
			const output = await render(template, "claude-code");
			expect(output).toContain('AskUserQuestion: "Pick one"');
			expect(output).toContain("Options:");
			expect(output).toContain("- Yes");
			expect(output).toContain("- No");
			expect(output).toContain("- Maybe");
		});

		test("OpenCode: renders ask_user with options list", async () => {
			const output = await render(template, "opencode");
			expect(output).toContain('ask_user: "Pick one"');
			expect(output).toContain("Options:");
			expect(output).toContain("- Yes");
		});

		test("Codex: renders request_user_input with options array", async () => {
			const output = await render(template, "codex");
			expect(output).toContain('request_user_input: "Pick one"');
			expect(output).toContain('options: ["Yes", "No", "Maybe"]');
			expect(output).toContain(
				"User input is unavailable in subagent contexts on Codex",
			);
		});
	});

	describe("with single option", () => {
		const template = '{% ask_user "Continue?", options: "OK" %}';

		test("CC: renders single option in list", async () => {
			const output = await render(template, "claude-code");
			expect(output).toContain("- OK");
		});

		test("Codex: renders single option in array", async () => {
			const output = await render(template, "codex");
			expect(output).toContain('options: ["OK"]');
		});
	});

	describe("codex enrichment sections", () => {
		const template =
			'{% ask_user "Approve the design?", options: "Yes", "No", "Revise" %}';

		test("includes checkpoint section with persistence guidance", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("**Checkpoint**:");
			expect(output).toContain("Current workflow phase and step name");
			expect(output).toContain("Paths to any artifacts produced so far");
			expect(output).toContain("Pending work remaining in the workflow");
		});

		test("includes stop directive", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("**Stop**:");
			expect(output).toContain(
				"Do NOT continue the workflow beyond this point",
			);
		});

		test("includes resume instructions", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("**Resume**:");
			expect(output).toContain("read the checkpoint file");
			expect(output).toContain("process the user's reply");
		});

		test("preserves subagent unavailability note at end", async () => {
			const output = await render(template, "codex");
			expect(output).toContain(
				"User input is unavailable in subagent contexts on Codex",
			);
			const noteIndex = output.indexOf(
				"User input is unavailable in subagent contexts on Codex",
			);
			const resumeIndex = output.indexOf("**Resume**:");
			expect(noteIndex).toBeGreaterThan(resumeIndex);
		});

		test("sections appear in correct order", async () => {
			const output = await render(template, "codex");
			const checkpointIdx = output.indexOf("**Checkpoint**:");
			const stopIdx = output.indexOf("**Stop**:");
			const resumeIdx = output.indexOf("**Resume**:");
			const noteIdx = output.indexOf(
				"User input is unavailable in subagent contexts on Codex",
			);

			expect(checkpointIdx).toBeGreaterThan(-1);
			expect(stopIdx).toBeGreaterThan(checkpointIdx);
			expect(resumeIdx).toBeGreaterThan(stopIdx);
			expect(noteIdx).toBeGreaterThan(resumeIdx);
		});
	});

	describe("codex plain-text fallback", () => {
		const template = '{% ask_user "Ready to proceed?", options: "Yes", "No" %}';

		test("includes plain-text fallback section", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("**Plain-text fallback**:");
			expect(output).toContain("If `request_user_input` is unavailable");
		});

		test("fallback includes question text in natural language", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("**Ready to proceed?**");
			expect(output).toContain("I need your input before continuing.");
		});

		test("fallback includes options in natural language", async () => {
			const output = await render(template, "codex");
			expect(output).toContain("Please respond with one of the following:");
			expect(output).not.toContain("freeform feedback");
			expect(output).toContain("- Yes");
			expect(output).toContain("- No");
		});

		test("fallback appears before checkpoint section", async () => {
			const output = await render(template, "codex");
			const fallbackIdx = output.indexOf("**Plain-text fallback**:");
			const checkpointIdx = output.indexOf("**Checkpoint**:");
			expect(fallbackIdx).toBeGreaterThan(-1);
			expect(checkpointIdx).toBeGreaterThan(fallbackIdx);
		});

		test("fallback coexists with structured request_user_input", async () => {
			const output = await render(template, "codex");
			expect(output).toContain('request_user_input: "Ready to proceed?"');
			expect(output).toContain('options: ["Yes", "No"]');
			expect(output).toContain("**Plain-text fallback**:");
		});

		test("checkpoint/stop/resume are inside fallback block, not unconditional", async () => {
			const output = await render(template, "codex");
			const fallbackStart = output.indexOf("**Plain-text fallback**:");
			const firstDivider = output.indexOf("---", fallbackStart);
			const secondDivider = output.indexOf("---", firstDivider + 3);
			const checkpointIdx = output.indexOf("**Checkpoint**:");
			const stopIdx = output.indexOf("**Stop**:");
			const resumeIdx = output.indexOf("**Resume**:");

			// All three sections must be between the two --- dividers
			expect(checkpointIdx).toBeGreaterThan(firstDivider);
			expect(checkpointIdx).toBeLessThan(secondDivider);
			expect(stopIdx).toBeGreaterThan(firstDivider);
			expect(stopIdx).toBeLessThan(secondDivider);
			expect(resumeIdx).toBeGreaterThan(firstDivider);
			expect(resumeIdx).toBeLessThan(secondDivider);
		});
	});

	describe("regression: CC and OC renderings unchanged", () => {
		const template = '{% ask_user "Pick one", options: "Yes", "No", "Maybe" %}';

		test("CC rendering does not include Codex-specific sections", async () => {
			const output = await render(template, "claude-code");
			expect(output).not.toContain("**Checkpoint**:");
			expect(output).not.toContain("**Stop**:");
			expect(output).not.toContain("**Resume**:");
			expect(output).not.toContain("request_user_input");
			expect(output).not.toContain("**Plain-text fallback**:");
		});

		test("OC rendering does not include Codex-specific sections", async () => {
			const output = await render(template, "opencode");
			expect(output).not.toContain("**Checkpoint**:");
			expect(output).not.toContain("**Stop**:");
			expect(output).not.toContain("**Resume**:");
			expect(output).not.toContain("request_user_input");
			expect(output).not.toContain("**Plain-text fallback**:");
		});

		test("CC rendering matches expected format exactly", async () => {
			const template2 = '{% ask_user "What is your preference?" %}';
			const output = await render(template2, "claude-code");
			expect(output).toBe('AskUserQuestion: "What is your preference?"');
		});

		test("OC rendering matches expected format exactly", async () => {
			const template2 = '{% ask_user "What is your preference?" %}';
			const output = await render(template2, "opencode");
			expect(output).toBe('ask_user: "What is your preference?"');
		});
	});
});
