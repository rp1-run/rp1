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
});
