/**
 * Unit tests for the edit_model semantic tag.
 * Tests output correctness for all three platforms.
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

describe("edit_model tag", () => {
	const template = '{% edit_model "modify the configuration file" %}';

	test("CC: renders Edit tool with exact string replacement", async () => {
		const output = await render(template, "claude-code");
		expect(output).toBe(
			"Use the Edit tool (exact string replacement) to modify the configuration file",
		);
	});

	test("OpenCode: renders edit_file tool with exact string replacement", async () => {
		const output = await render(template, "opencode");
		expect(output).toBe(
			"Use the edit_file tool (exact string replacement) to modify the configuration file",
		);
	});

	test("Codex: renders apply_patch tool with unified diff format", async () => {
		const output = await render(template, "codex");
		expect(output).toBe(
			"Use the apply_patch tool (unified diff format) to modify the configuration file",
		);
	});

	test("Copilot: renders edit_file tool with parameter guidance", async () => {
		const output = await render(template, "copilot");
		expect(output).toContain("edit_file tool");
		expect(output).toContain("exact string replacement");
		expect(output).toContain("modify the configuration file");
		expect(output).toContain("old_string");
		expect(output).toContain("new_string");
	});

	test("renders consistently across all platforms", async () => {
		const directive = "update the import statements";
		const t = `{% edit_model "${directive}" %}`;

		const cc = await render(t, "claude-code");
		const oc = await render(t, "opencode");
		const cx = await render(t, "codex");
		const cp = await render(t, "copilot");

		expect(cc).toContain("Edit tool");
		expect(oc).toContain("edit_file tool");
		expect(cx).toContain("apply_patch tool");
		expect(cp).toContain("edit_file tool");

		expect(cc).toContain(directive);
		expect(oc).toContain(directive);
		expect(cx).toContain(directive);
		expect(cp).toContain(directive);
	});
});
