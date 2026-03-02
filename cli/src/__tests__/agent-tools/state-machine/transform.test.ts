/**
 * Unit tests for state machine transform module.
 * Tests mermaid-ast AST to StateMachine domain model conversion.
 */

import { describe, expect, test } from "bun:test";
import { parseAndTransform } from "../../../agent-tools/state-machine/transform.js";
import { expectLeft, expectRight } from "../../helpers/index.js";

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

describe("transform", () => {
	describe("parseAndTransform", () => {
		test("converts build workflow into StateMachine with correct states", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			expect(machine.id).toBe("build");
			expect(machine.states.size).toBe(6);
			expect(machine.states.has("requirements")).toBe(true);
			expect(machine.states.has("design")).toBe(true);
			expect(machine.states.has("tasks")).toBe(true);
			expect(machine.states.has("build")).toBe(true);
			expect(machine.states.has("verify")).toBe(true);
			expect(machine.states.has("archive")).toBe(true);
		});

		test("does not include [*] marker as a state", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			expect(machine.states.has("[*]")).toBe(false);
		});

		test("identifies initial states from [*] transitions", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			expect(machine.initialStates).toEqual(["requirements"]);
			const reqState = machine.states.get("requirements");
			expect(reqState?.isInitial).toBe(true);
		});

		test("identifies terminal states from transitions to [*]", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			expect(machine.terminalStates).toEqual(["archive"]);
			const archiveState = machine.states.get("archive");
			expect(archiveState?.isTerminal).toBe(true);
		});

		test("extracts transitions with labels", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			expect(machine.transitions).toHaveLength(6);

			const reqToDesign = machine.transitions.find(
				(t) => t.sourceId === "requirements" && t.targetId === "design",
			);
			expect(reqToDesign).toBeDefined();
			expect(reqToDesign?.label).toBe("reqs_complete");
		});

		test("excludes [*] marker transitions from transition list", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			const starTransitions = machine.transitions.filter(
				(t) => t.sourceId === "[*]" || t.targetId === "[*]",
			);
			expect(starTransitions).toHaveLength(0);
		});

		test("handles cyclic transitions (retry loops)", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			const retryTransition = machine.transitions.find(
				(t) => t.sourceId === "verify" && t.targetId === "build",
			);
			expect(retryTransition).toBeDefined();
			expect(retryTransition?.label).toBe("verify_failed");
		});

		test("converts build-fast workflow correctly", () => {
			const machine = expectRight(
				parseAndTransform("build-fast", buildFastWorkflow),
			);

			expect(machine.id).toBe("build-fast");
			expect(machine.states.size).toBe(3);
			expect(machine.initialStates).toEqual(["plan"]);
			expect(machine.terminalStates).toEqual(["review"]);
			expect(machine.transitions).toHaveLength(2);
		});

		test("maps state labels from descriptions", () => {
			const input = `stateDiagram-v2
    requirements : Gather Requirements
    [*] --> requirements
    requirements --> done
    done --> [*]
`;
			const machine = expectRight(parseAndTransform("test", input));

			const reqState = machine.states.get("requirements");
			expect(reqState?.label).toBe("Gather Requirements");
		});

		test("sets null label for states without description", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			const reqState = machine.states.get("requirements");
			expect(reqState?.label).toBeNull();
		});

		test("auto-creates states referenced in transitions but not declared", () => {
			const input = `stateDiagram-v2
    [*] --> step_a
    step_a --> step_b : next
    step_b --> [*]
`;
			const machine = expectRight(parseAndTransform("test", input));

			expect(machine.states.has("step_a")).toBe(true);
			expect(machine.states.has("step_b")).toBe(true);
		});

		test("handles single state workflow", () => {
			const input = `stateDiagram-v2
    [*] --> only_state
    only_state --> [*]
`;
			const machine = expectRight(parseAndTransform("single", input));

			expect(machine.states.size).toBe(1);
			expect(machine.initialStates).toEqual(["only_state"]);
			expect(machine.terminalStates).toEqual(["only_state"]);
			const state = machine.states.get("only_state");
			expect(state?.isInitial).toBe(true);
			expect(state?.isTerminal).toBe(true);
		});

		test("handles multiple initial states", () => {
			const input = `stateDiagram-v2
    [*] --> path_a
    [*] --> path_b
    path_a --> done
    path_b --> done
    done --> [*]
`;
			const machine = expectRight(parseAndTransform("multi-init", input));

			expect(machine.initialStates).toHaveLength(2);
			expect(machine.initialStates).toContain("path_a");
			expect(machine.initialStates).toContain("path_b");
		});

		test("non-initial non-terminal states have correct flags", () => {
			const machine = expectRight(parseAndTransform("build", buildWorkflow));

			const designState = machine.states.get("design");
			expect(designState?.isInitial).toBe(false);
			expect(designState?.isTerminal).toBe(false);
		});

		test("transitions without labels have null label", () => {
			const input = `stateDiagram-v2
    [*] --> a
    a --> b
    b --> [*]
`;
			const machine = expectRight(parseAndTransform("test", input));

			const aToB = machine.transitions.find(
				(t) => t.sourceId === "a" && t.targetId === "b",
			);
			expect(aToB?.label).toBeNull();
		});
	});

	describe("error handling", () => {
		test("returns ParseError for invalid Mermaid syntax", () => {
			const error = expectLeft(
				parseAndTransform("bad", "this is not valid mermaid"),
			);

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.file).toBe("bad");
				expect(error.message).toContain("Parse error");
			}
		});

		test("returns ParseError when no initial state is defined", () => {
			const input = `stateDiagram-v2
    a --> b
    b --> [*]
`;
			const error = expectLeft(parseAndTransform("no-init", input));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.file).toBe("no-init");
				expect(error.message).toContain("No initial state defined");
			}
		});

		test("rejects fork states as unsupported", () => {
			const input = `stateDiagram-v2
    state fork_state <<fork>>
    [*] --> fork_state
    fork_state --> a
    fork_state --> b
    a --> [*]
    b --> [*]
`;
			const error = expectLeft(parseAndTransform("fork-test", input));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.message).toContain("fork");
			}
		});

		test("rejects join states as unsupported", () => {
			const input = `stateDiagram-v2
    state join_state <<join>>
    [*] --> a
    a --> join_state
    join_state --> [*]
`;
			const error = expectLeft(parseAndTransform("join-test", input));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.message).toContain("join");
			}
		});

		test("rejects nested/composite states as unsupported", () => {
			const input = `stateDiagram-v2
    state Parent {
        [*] --> inner
        inner --> [*]
    }
    [*] --> Parent
`;
			const error = expectLeft(parseAndTransform("nested-test", input));

			expect(error._tag).toBe("ParseError");
			if (error._tag === "ParseError") {
				expect(error.message).toContain("nested");
			}
		});

		test("returns ParseError for empty input", () => {
			const error = expectLeft(parseAndTransform("empty", ""));

			expect(error._tag).toBe("ParseError");
		});
	});
});
