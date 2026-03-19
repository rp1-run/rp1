/**
 * Serialization helpers for converting StateMachine to/from JSON.
 *
 * Used by the build pipeline to pre-parse Mermaid state machines into JSON
 * at build time, and by the loader to deserialize them at runtime.
 * This eliminates runtime Mermaid parsing cost for production builds.
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../../shared/errors.js";
import { parseError } from "../../../shared/errors.js";
import type { SMState, SMTransition, StateMachine } from "./models.js";

interface SerializedStateMachine {
	readonly id: string;
	readonly states: Record<string, SMState>;
	readonly transitions: readonly SMTransition[];
	readonly initialStates: readonly string[];
	readonly terminalStates: readonly string[];
}

/**
 * Serialize a StateMachine into a JSON string.
 *
 * Converts the ReadonlyMap<string, SMState> to a plain Record<string, SMState>
 * so the result is JSON-safe.
 */
export const serializeStateMachine = (machine: StateMachine): string => {
	const serialized: SerializedStateMachine = {
		id: machine.id,
		states: Object.fromEntries(machine.states),
		transitions: machine.transitions,
		initialStates: machine.initialStates,
		terminalStates: machine.terminalStates,
	};
	return JSON.stringify(serialized);
};

/**
 * Deserialize a JSON string back into a StateMachine.
 *
 * Parses the JSON, reconstructs the Map<string, SMState> from the plain object,
 * and returns Either<CLIError, StateMachine>.
 */
export const deserializeStateMachine = (
	json: string,
): E.Either<CLIError, StateMachine> => {
	try {
		const parsed: SerializedStateMachine = JSON.parse(json);

		const states = new Map<string, SMState>();
		for (const [key, value] of Object.entries(parsed.states)) {
			states.set(key, value);
		}

		const machine: StateMachine = {
			id: parsed.id,
			states,
			transitions: parsed.transitions,
			initialStates: parsed.initialStates,
			terminalStates: parsed.terminalStates,
		};

		return E.right(machine);
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Unknown parse error";
		return E.left(
			parseError(
				"state-machine-json",
				`Failed to deserialize state machine JSON: ${message}`,
			),
		);
	}
};
