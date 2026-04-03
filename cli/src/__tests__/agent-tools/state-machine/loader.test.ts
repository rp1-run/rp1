/**
 * Unit tests for state machine loader module.
 * Tests filesystem loading, caching, error handling, and workflow listing.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import {
	clearCache,
	listWorkflows,
	loadStateMachine,
} from "../../../agent-tools/state-machine/loader.js";
import { expectTaskLeft, expectTaskRight } from "../../helpers/index.js";

describe("loader", () => {
	beforeEach(() => {
		clearCache();
	});

	describe("loadStateMachine", () => {
		test("loads build workflow from filesystem", async () => {
			const machine = await expectTaskRight(loadStateMachine("build"));

			expect(machine.id).toBe("build");
			expect(machine.states.size).toBe(6);
			expect(machine.initialStates).toEqual(["requirements"]);
			expect(machine.terminalStates).toEqual(["archive"]);
		});

		test("loads build-fast workflow from filesystem", async () => {
			const machine = await expectTaskRight(loadStateMachine("build-fast"));

			expect(machine.id).toBe("build-fast");
			expect(machine.states.size).toBe(3);
			expect(machine.initialStates).toEqual(["plan"]);
		});

		test("loads pr-review workflow from filesystem", async () => {
			const machine = await expectTaskRight(loadStateMachine("pr-review"));

			expect(machine.id).toBe("pr-review");
			expect(machine.states.size).toBe(2);
			expect(machine.initialStates).toEqual(["reviewing"]);
		});

		test("returns cached result on second load", async () => {
			const first = await expectTaskRight(loadStateMachine("build"));
			const second = await expectTaskRight(loadStateMachine("build"));

			expect(first).toBe(second);
		});

		test("returns NotFoundError for nonexistent workflow", async () => {
			const error = await expectTaskLeft(loadStateMachine("does-not-exist"));

			expect(error._tag).toBe("NotFoundError");
			if (error._tag === "NotFoundError") {
				expect(error.resource).toContain("does-not-exist");
			}
		});

		test("cache hit is fast (under 1ms threshold)", async () => {
			await expectTaskRight(loadStateMachine("build"));

			const start = performance.now();
			await expectTaskRight(loadStateMachine("build"));
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(1);
		});
	});

	describe("listWorkflows", () => {
		test("lists all available workflows from filesystem", async () => {
			const workflows = await expectTaskRight(listWorkflows());

			expect(workflows).toContain("build");
			expect(workflows).toContain("build-fast");
			expect(workflows).toContain("pr-review");
			expect(workflows).toContain("deep-research");
			expect(workflows).toContain("blueprint");
		});

		test("does not include skills without embedded state machines", async () => {
			const workflows = await expectTaskRight(listWorkflows());

			expect(workflows).not.toContain("code-check");
			expect(workflows).not.toContain("code-audit");
		});
	});

	describe("clearCache", () => {
		test("clears cache so subsequent loads re-read from filesystem", async () => {
			const first = await expectTaskRight(loadStateMachine("build"));

			clearCache();

			const second = await expectTaskRight(loadStateMachine("build"));

			expect(first).not.toBe(second);
			expect(first.id).toBe(second.id);
			expect(first.states.size).toBe(second.states.size);
		});
	});
});
