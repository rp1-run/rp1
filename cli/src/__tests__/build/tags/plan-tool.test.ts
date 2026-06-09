/**
 * Unit tests for the plan_tool semantic tag.
 * Tests output correctness for all three platforms and planning mode detection.
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

describe("plan_tool tag", () => {
	describe("basic directive", () => {
		const template = '{% plan_tool "Track implementation progress" %}';

		test("CC: renders TodoWrite", async () => {
			const output = await render(template, "claude-code");
			expect(output).toBe("TodoWrite: Track implementation progress");
		});

		test("OpenCode: renders manage_todos", async () => {
			const output = await render(template, "opencode");
			expect(output).toBe("manage_todos: Track implementation progress");
		});

		test("Codex: renders update_plan", async () => {
			const output = await render(template, "codex");
			expect(output).toBe("update_plan: Track implementation progress");
		});

		test("Copilot: renders directive with no-tool note", async () => {
			const output = await render(template, "copilot");
			expect(output).toContain("Track implementation progress");
			expect(output).toContain("No dedicated planning tool");
			expect(output).toContain("markdown file");
		});

		test("Goose: renders directive with markdown fallback and no approval wait", async () => {
			const output = await render(template, "goose");
			expect(output).toContain("Track implementation progress");
			expect(output).toContain("no dedicated planning or task-tracking tool");
			expect(output).toContain("markdown task list");
			expect(output).toContain(
				"do not wait for interactive plan-mode approval",
			);
		});
	});

	describe("planning mode directive", () => {
		test("CC: includes EnterPlanMode/ExitPlanMode for planning mode reference", async () => {
			const template = '{% plan_tool "Enter planning mode to create a plan" %}';
			const output = await render(template, "claude-code");
			expect(output).toContain("TodoWrite:");
			expect(output).toContain("EnterPlanMode");
			expect(output).toContain("ExitPlanMode");
		});

		test("CC: includes plan mode guidance for 'start planning'", async () => {
			const template = '{% plan_tool "Start planning the implementation" %}';
			const output = await render(template, "claude-code");
			expect(output).toContain("EnterPlanMode");
		});

		test("OpenCode: does not include plan mode constructs", async () => {
			const template = '{% plan_tool "Enter planning mode to create a plan" %}';
			const output = await render(template, "opencode");
			expect(output).not.toContain("EnterPlanMode");
			expect(output).not.toContain("ExitPlanMode");
			expect(output).toContain("manage_todos:");
		});

		test("Codex: does not include plan mode constructs", async () => {
			const template = '{% plan_tool "Enter planning mode to create a plan" %}';
			const output = await render(template, "codex");
			expect(output).not.toContain("EnterPlanMode");
			expect(output).toContain("update_plan:");
		});

		test("Copilot: does not include plan mode constructs", async () => {
			const template = '{% plan_tool "Enter planning mode to create a plan" %}';
			const output = await render(template, "copilot");
			expect(output).not.toContain("EnterPlanMode");
			expect(output).not.toContain("ExitPlanMode");
			expect(output).not.toContain("TodoWrite");
			expect(output).toContain("No dedicated planning tool");
		});

		test("CC: no plan mode guidance for non-planning directives", async () => {
			const template = '{% plan_tool "Add a task to the list" %}';
			const output = await render(template, "claude-code");
			expect(output).toBe("TodoWrite: Add a task to the list");
			expect(output).not.toContain("EnterPlanMode");
		});
	});
});
