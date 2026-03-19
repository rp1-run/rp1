/**
 * Unit tests for state machine serialization/deserialization.
 * Tests round-trip preservation, Map reconstruction, and malformed JSON handling.
 */

import { describe, expect, test } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import type { StateMachine } from "../../../agent-tools/state-machine/models.js";
import {
	deserializeStateMachine,
	serializeStateMachine,
} from "../../../agent-tools/state-machine/serialization.js";
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

const singleStateWorkflow = `stateDiagram-v2
    [*] --> only_state
    only_state --> [*]
`;

const multiInitWorkflow = `stateDiagram-v2
    [*] --> path_a
    [*] --> path_b
    path_a --> merge
    path_b --> merge
    merge --> done
    done --> [*]
`;

const parseMachine = (id: string, source: string): StateMachine =>
	expectRight(parseAndTransform(id, source));

describe("serializeStateMachine", () => {
	test("produces valid JSON string", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);

		expect(() => JSON.parse(json)).not.toThrow();
	});

	test("serialized JSON contains all top-level fields", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const parsed = JSON.parse(json);

		expect(parsed.id).toBe("build");
		expect(parsed.states).toBeDefined();
		expect(parsed.transitions).toBeDefined();
		expect(parsed.initialStates).toBeDefined();
		expect(parsed.terminalStates).toBeDefined();
	});

	test("converts Map to plain object in JSON", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const parsed = JSON.parse(json);

		expect(typeof parsed.states).toBe("object");
		expect(Array.isArray(parsed.states)).toBe(false);
		expect(parsed.states.requirements).toBeDefined();
		expect(parsed.states.design).toBeDefined();
	});
});

describe("deserializeStateMachine", () => {
	test("round-trip preserves machine id", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.id).toBe(machine.id);
	});

	test("round-trip preserves all states", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.states.size).toBe(machine.states.size);
		for (const [key, value] of machine.states) {
			const restoredState = restored.states.get(key);
			expect(restoredState).toBeDefined();
			expect(restoredState?.id).toBe(value.id);
			expect(restoredState?.label).toBe(value.label);
			expect(restoredState?.isInitial).toBe(value.isInitial);
			expect(restoredState?.isTerminal).toBe(value.isTerminal);
		}
	});

	test("round-trip preserves all transitions", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.transitions).toHaveLength(machine.transitions.length);
		for (let i = 0; i < machine.transitions.length; i++) {
			expect(restored.transitions[i].sourceId).toBe(
				machine.transitions[i].sourceId,
			);
			expect(restored.transitions[i].targetId).toBe(
				machine.transitions[i].targetId,
			);
			expect(restored.transitions[i].label).toBe(machine.transitions[i].label);
		}
	});

	test("round-trip preserves initial and terminal states", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect([...restored.initialStates]).toEqual([...machine.initialStates]);
		expect([...restored.terminalStates]).toEqual([...machine.terminalStates]);
	});

	test("reconstructs Map type from plain object", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.states).toBeInstanceOf(Map);
		expect(restored.states.has("requirements")).toBe(true);
		expect(restored.states.get("requirements")?.id).toBe("requirements");
	});

	test("handles single state workflow round-trip", () => {
		const machine = parseMachine("single", singleStateWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.states.size).toBe(1);
		expect(restored.states.has("only_state")).toBe(true);
		expect(restored.initialStates).toContain("only_state");
		expect(restored.terminalStates).toContain("only_state");
	});

	test("handles multiple initial states round-trip", () => {
		const machine = parseMachine("multi", multiInitWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.initialStates).toHaveLength(machine.initialStates.length);
		expect(restored.initialStates).toContain("path_a");
		expect(restored.initialStates).toContain("path_b");
	});

	test("returns Left for malformed JSON", () => {
		const result = deserializeStateMachine("not valid json {{{");
		expect(E.isLeft(result)).toBe(true);

		const error = expectLeft(result);
		expect(error._tag).toBe("ParseError");
	});

	test("returns Left for empty string", () => {
		const result = deserializeStateMachine("");
		expect(E.isLeft(result)).toBe(true);
	});
});

describe("serialization: pre-parsed JSON produces identical StateMachine to runtime parsing", () => {
	test("build workflow produces identical result via both paths", () => {
		const machine = parseMachine("build", buildWorkflow);
		const json = serializeStateMachine(machine);
		const restored = expectRight(deserializeStateMachine(json));

		expect(restored.id).toBe(machine.id);
		expect(restored.states.size).toBe(machine.states.size);
		expect(restored.transitions.length).toBe(machine.transitions.length);
		expect([...restored.initialStates]).toEqual([...machine.initialStates]);
		expect([...restored.terminalStates]).toEqual([...machine.terminalStates]);

		for (const [key] of machine.states) {
			expect(restored.states.has(key)).toBe(true);
		}
	});
});
