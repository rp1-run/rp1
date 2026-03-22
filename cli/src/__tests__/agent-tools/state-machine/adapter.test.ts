/**
 * Unit tests for state machine graph query adapter.
 * Tests transition lookup, validation, BFS step ordering, and reachability.
 */

import { describe, expect, test } from "bun:test";
import {
	deriveOrderedSteps,
	getDirectPredecessors,
	getTransitionsFrom,
	getTransitivePredecessors,
	getValidNextStates,
	isReachable,
	validateTransition,
} from "../../../agent-tools/state-machine/adapter.js";
import type { StateMachine } from "../../../agent-tools/state-machine/models.js";
import { parseAndTransform } from "../../../agent-tools/state-machine/transform.js";
import { expectRight } from "../../helpers/index.js";

const buildWorkflow = `stateDiagram-v2
    [*] --> requirements
    requirements --> design : reqs_complete
    design --> tasks : design_complete
    tasks --> build : tasks_ready
    build --> verify : build_complete
    verify --> build : verify_failed
    verify --> archive : verify_passed
    archive --> [*] : done
`;

const buildFastWorkflow = `stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> review : build_complete
    review --> [*] : done
`;

const prReviewWorkflow = `stateDiagram-v2
    [*] --> split
    split --> review : split_complete
    review --> synthesize : review_complete
    synthesize --> post : synthesis_complete
    post --> [*] : done
`;

const multiInitWorkflow = `stateDiagram-v2
    [*] --> path_a
    [*] --> path_b
    path_a --> merge
    path_b --> merge
    merge --> done
    done --> [*]
`;

const singleStateWorkflow = `stateDiagram-v2
    [*] --> only_state
    only_state --> [*]
`;

const parseMachine = (id: string, source: string): StateMachine =>
	expectRight(parseAndTransform(id, source));

describe("adapter", () => {
	describe("getTransitionsFrom", () => {
		test("returns outgoing transitions for a state with one exit", () => {
			const machine = parseMachine("build", buildWorkflow);
			const transitions = getTransitionsFrom(machine, "requirements");

			expect(transitions).toHaveLength(1);
			expect(transitions[0].sourceId).toBe("requirements");
			expect(transitions[0].targetId).toBe("design");
			expect(transitions[0].label).toBe("reqs_complete");
		});

		test("returns multiple outgoing transitions for branching state", () => {
			const machine = parseMachine("build", buildWorkflow);
			const transitions = getTransitionsFrom(machine, "verify");

			expect(transitions).toHaveLength(2);
			const targets = transitions.map((t) => t.targetId).sort();
			expect(targets).toEqual(["archive", "build"]);
		});

		test("returns empty array for terminal state with no outgoing transitions", () => {
			const machine = parseMachine("build", buildWorkflow);
			const transitions = getTransitionsFrom(machine, "archive");

			expect(transitions).toHaveLength(0);
		});

		test("returns empty array for nonexistent state", () => {
			const machine = parseMachine("build", buildWorkflow);
			const transitions = getTransitionsFrom(machine, "nonexistent");

			expect(transitions).toHaveLength(0);
		});

		test("works for each state in build-fast workflow", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);

			expect(getTransitionsFrom(machine, "plan")).toHaveLength(1);
			expect(getTransitionsFrom(machine, "build")).toHaveLength(1);
			expect(getTransitionsFrom(machine, "review")).toHaveLength(0);
		});
	});

	describe("getValidNextStates", () => {
		test("returns single next state for linear progression", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getValidNextStates(machine, "requirements")).toEqual(["design"]);
			expect(getValidNextStates(machine, "design")).toEqual(["tasks"]);
			expect(getValidNextStates(machine, "tasks")).toEqual(["build"]);
			expect(getValidNextStates(machine, "build")).toEqual(["verify"]);
		});

		test("returns multiple next states for branching state", () => {
			const machine = parseMachine("build", buildWorkflow);
			const nextStates = getValidNextStates(machine, "verify");

			expect(nextStates).toHaveLength(2);
			expect(nextStates).toContain("build");
			expect(nextStates).toContain("archive");
		});

		test("returns empty array for terminal state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getValidNextStates(machine, "archive")).toEqual([]);
		});

		test("returns empty array for nonexistent state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getValidNextStates(machine, "nonexistent")).toEqual([]);
		});

		test("returns correct next states for each build-fast state", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);

			expect(getValidNextStates(machine, "plan")).toEqual(["build"]);
			expect(getValidNextStates(machine, "build")).toEqual(["review"]);
			expect(getValidNextStates(machine, "review")).toEqual([]);
		});
	});

	describe("validateTransition", () => {
		test("returns valid for a legal transition", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "requirements", "design");

			expect(result.valid).toBe(true);
			expect(result.currentState).toBe("requirements");
			expect(result.targetState).toBe("design");
			expect(result.validNextStates).toEqual(["design"]);
			expect(result.error).toBeUndefined();
		});

		test("returns valid for retry loop transition", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "verify", "build");

			expect(result.valid).toBe(true);
			expect(result.currentState).toBe("verify");
			expect(result.targetState).toBe("build");
		});

		test("returns invalid for skipping states", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "requirements", "verify");

			expect(result.valid).toBe(false);
			expect(result.currentState).toBe("requirements");
			expect(result.targetState).toBe("verify");
			expect(result.validNextStates).toEqual(["design"]);
			expect(result.error).toContain("Invalid transition");
			expect(result.error).toContain("requirements");
			expect(result.error).toContain("verify");
			expect(result.error).toContain("design");
		});

		test("returns invalid for backward transition not in graph", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "design", "requirements");

			expect(result.valid).toBe(false);
			expect(result.validNextStates).toEqual(["tasks"]);
		});

		test("returns invalid for transition from terminal state", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "archive", "requirements");

			expect(result.valid).toBe(false);
			expect(result.validNextStates).toEqual([]);
			expect(result.error).toContain("(none)");
		});

		test("returns invalid for transition from nonexistent state", () => {
			const machine = parseMachine("build", buildWorkflow);
			const result = validateTransition(machine, "nonexistent", "design");

			expect(result.valid).toBe(false);
			expect(result.validNextStates).toEqual([]);
		});

		test("validates all legal transitions in pr-review workflow", () => {
			const machine = parseMachine("pr-review", prReviewWorkflow);

			expect(validateTransition(machine, "split", "review").valid).toBe(true);
			expect(validateTransition(machine, "review", "synthesize").valid).toBe(
				true,
			);
			expect(validateTransition(machine, "synthesize", "post").valid).toBe(
				true,
			);
		});

		test("rejects all illegal transitions in pr-review workflow", () => {
			const machine = parseMachine("pr-review", prReviewWorkflow);

			expect(validateTransition(machine, "split", "post").valid).toBe(false);
			expect(validateTransition(machine, "post", "split").valid).toBe(false);
			expect(validateTransition(machine, "review", "split").valid).toBe(false);
		});
	});

	describe("deriveOrderedSteps", () => {
		test("derives correct linear ordering for build workflow", () => {
			const machine = parseMachine("build", buildWorkflow);
			const steps = deriveOrderedSteps(machine);

			expect(steps).toHaveLength(6);
			expect(steps[0]).toEqual({
				id: "requirements",
				label: "requirements",
				index: 0,
			});
			expect(steps[1]).toEqual({ id: "design", label: "design", index: 1 });
			expect(steps[2]).toEqual({ id: "tasks", label: "tasks", index: 2 });
			expect(steps[3]).toEqual({ id: "build", label: "build", index: 3 });
			expect(steps[4]).toEqual({ id: "verify", label: "verify", index: 4 });
			expect(steps[5]).toEqual({ id: "archive", label: "archive", index: 5 });
		});

		test("handles cyclic graph without infinite loop", () => {
			const machine = parseMachine("build", buildWorkflow);
			const steps = deriveOrderedSteps(machine);

			const ids = steps.map((s) => s.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);
		});

		test("derives correct ordering for build-fast workflow", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);
			const steps = deriveOrderedSteps(machine);

			expect(steps).toHaveLength(3);
			expect(steps.map((s) => s.id)).toEqual(["plan", "build", "review"]);
		});

		test("derives correct ordering for pr-review workflow", () => {
			const machine = parseMachine("pr-review", prReviewWorkflow);
			const steps = deriveOrderedSteps(machine);

			expect(steps).toHaveLength(4);
			expect(steps.map((s) => s.id)).toEqual([
				"split",
				"review",
				"synthesize",
				"post",
			]);
		});

		test("assigns sequential indices starting from 0", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);
			const steps = deriveOrderedSteps(machine);

			steps.forEach((step, i) => {
				expect(step.index).toBe(i);
			});
		});

		test("uses state label when available, falls back to id", () => {
			const input = `stateDiagram-v2
    requirements : Gather Requirements
    [*] --> requirements
    requirements --> done
    done --> [*]
`;
			const machine = parseMachine("label-test", input);
			const steps = deriveOrderedSteps(machine);

			expect(steps[0].label).toBe("Gather Requirements");
			expect(steps[1].label).toBe("done");
		});

		test("handles single state workflow", () => {
			const machine = parseMachine("single", singleStateWorkflow);
			const steps = deriveOrderedSteps(machine);

			expect(steps).toHaveLength(1);
			expect(steps[0]).toEqual({
				id: "only_state",
				label: "only_state",
				index: 0,
			});
		});

		test("handles multiple initial states in BFS order", () => {
			const machine = parseMachine("multi-init", multiInitWorkflow);
			const steps = deriveOrderedSteps(machine);

			const ids = steps.map((s) => s.id);
			expect(ids).toContain("path_a");
			expect(ids).toContain("path_b");
			expect(ids).toContain("merge");
			expect(ids).toContain("done");
			expect(ids.indexOf("path_a")).toBeLessThan(ids.indexOf("merge"));
			expect(ids.indexOf("path_b")).toBeLessThan(ids.indexOf("merge"));
			expect(ids.indexOf("merge")).toBeLessThan(ids.indexOf("done"));
		});
	});

	describe("getDirectPredecessors", () => {
		test("returns single predecessor for linear chain", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getDirectPredecessors(machine, "design")).toEqual([
				"requirements",
			]);
			expect(getDirectPredecessors(machine, "tasks")).toEqual(["design"]);
			expect(getDirectPredecessors(machine, "archive")).toEqual(["verify"]);
		});

		test("returns multiple predecessors at join points", () => {
			const machine = parseMachine("multi-init", multiInitWorkflow);
			const predecessors = getDirectPredecessors(machine, "merge");

			expect(predecessors).toHaveLength(2);
			expect(predecessors).toContain("path_a");
			expect(predecessors).toContain("path_b");
		});

		test("returns empty array for initial states", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getDirectPredecessors(machine, "requirements")).toEqual([]);
		});

		test("returns empty array for nonexistent state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getDirectPredecessors(machine, "nonexistent")).toEqual([]);
		});

		test("handles cycles correctly", () => {
			const machine = parseMachine("build", buildWorkflow);
			const predecessors = getDirectPredecessors(machine, "build");

			expect(predecessors).toContain("tasks");
			expect(predecessors).toContain("verify");
			expect(predecessors).toHaveLength(2);
		});

		test("deduplicates predecessors", () => {
			const machine = parseMachine("build", buildWorkflow);
			const predecessors = getDirectPredecessors(machine, "build");

			const unique = new Set(predecessors);
			expect(unique.size).toBe(predecessors.length);
		});

		test("returns correct predecessors for single state workflow", () => {
			const machine = parseMachine("single", singleStateWorkflow);

			expect(getDirectPredecessors(machine, "only_state")).toEqual([]);
		});

		test("returns correct predecessors for each build-fast state", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);

			expect(getDirectPredecessors(machine, "plan")).toEqual([]);
			expect(getDirectPredecessors(machine, "build")).toEqual(["plan"]);
			expect(getDirectPredecessors(machine, "review")).toEqual(["build"]);
		});
	});

	describe("getTransitivePredecessors", () => {
		test("returns all ancestors in a linear chain", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect([...getTransitivePredecessors(machine, "archive")].sort()).toEqual(
				["build", "design", "requirements", "tasks", "verify"].sort(),
			);
		});

		test("returns transitive predecessors beyond direct parents", () => {
			const machine = parseMachine("build", buildWorkflow);
			const preds = getTransitivePredecessors(machine, "tasks");

			expect(preds).toContain("design");
			expect(preds).toContain("requirements");
			expect(preds).toHaveLength(2);
		});

		test("returns empty array for initial state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(getTransitivePredecessors(machine, "requirements")).toEqual([]);
		});

		test("handles cycles without infinite loop", () => {
			const machine = parseMachine("build", buildWorkflow);
			const preds = getTransitivePredecessors(machine, "build");

			expect(preds).toContain("tasks");
			expect(preds).toContain("verify");
			expect(preds).toContain("requirements");
			expect(preds).toContain("design");
		});

		test("includes the state itself when reachable via cycle", () => {
			const machine = parseMachine("build", buildWorkflow);
			const preds = getTransitivePredecessors(machine, "verify");

			expect(preds).toContain("verify");
			expect(preds).toContain("build");
		});

		test("does not include the state itself when no cycle exists", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);
			const preds = getTransitivePredecessors(machine, "review");

			expect(preds).not.toContain("review");
			expect(preds).toContain("build");
			expect(preds).toContain("plan");
		});

		test("handles join points with multiple paths", () => {
			const machine = parseMachine("multi-init", multiInitWorkflow);
			const preds = getTransitivePredecessors(machine, "done");

			expect(preds).toContain("merge");
			expect(preds).toContain("path_a");
			expect(preds).toContain("path_b");
		});

		test("does not include states on separate branches", () => {
			const machine = parseMachine("multi-init", multiInitWorkflow);

			expect(getTransitivePredecessors(machine, "path_a")).toEqual([]);
			expect(getTransitivePredecessors(machine, "path_b")).toEqual([]);
		});
	});

	describe("isReachable", () => {
		test("returns true for directly connected states", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "requirements", "design")).toBe(true);
			expect(isReachable(machine, "build", "verify")).toBe(true);
		});

		test("returns true for transitively reachable states", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "requirements", "archive")).toBe(true);
			expect(isReachable(machine, "requirements", "verify")).toBe(true);
		});

		test("returns true for self-reachability", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "requirements", "requirements")).toBe(true);
			expect(isReachable(machine, "archive", "archive")).toBe(true);
		});

		test("returns false for unreachable states (backward)", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);

			expect(isReachable(machine, "review", "plan")).toBe(false);
			expect(isReachable(machine, "build", "plan")).toBe(false);
		});

		test("returns true for states reachable through cycle", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "verify", "build")).toBe(true);
			expect(isReachable(machine, "verify", "verify")).toBe(true);
		});

		test("returns false for nonexistent source state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "nonexistent", "design")).toBe(false);
		});

		test("returns false for nonexistent target state", () => {
			const machine = parseMachine("build", buildWorkflow);

			expect(isReachable(machine, "requirements", "nonexistent")).toBe(false);
		});

		test("returns true from any state to terminal in build-fast", () => {
			const machine = parseMachine("build-fast", buildFastWorkflow);

			expect(isReachable(machine, "plan", "review")).toBe(true);
			expect(isReachable(machine, "build", "review")).toBe(true);
		});

		test("handles multiple initial states reachability", () => {
			const machine = parseMachine("multi-init", multiInitWorkflow);

			expect(isReachable(machine, "path_a", "done")).toBe(true);
			expect(isReachable(machine, "path_b", "done")).toBe(true);
			expect(isReachable(machine, "path_a", "path_b")).toBe(false);
		});
	});
});
