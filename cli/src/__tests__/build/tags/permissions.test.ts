/**
 * Unit tests for the permissions semantic tag.
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

describe("permissions tag", () => {
	const template = '{% permissions "restrict shell access" %}';

	test("CC: references allowed-tools with Bash(pattern) format", async () => {
		const output = await render(template, "claude-code");
		expect(output).toContain("allowed-tools");
		expect(output).toContain("Bash(pattern)");
		expect(output).toContain("restrict shell access");
	});

	test("OpenCode: references permission map", async () => {
		const output = await render(template, "opencode");
		expect(output).toContain("permission map");
		expect(output).toContain("tool-level granularity");
		expect(output).toContain("restrict shell access");
	});

	test("Codex: references sandbox execution policy", async () => {
		const output = await render(template, "codex");
		expect(output).toContain("sandbox execution policy");
		expect(output).toContain("restrict shell access");
	});

	test("renders consistently across all platforms", async () => {
		const directive = "control file system access";
		const t = `{% permissions "${directive}" %}`;

		const cc = await render(t, "claude-code");
		const oc = await render(t, "opencode");
		const cx = await render(t, "codex");

		expect(cc).toContain(directive);
		expect(oc).toContain(directive);
		expect(cx).toContain(directive);
	});
});
