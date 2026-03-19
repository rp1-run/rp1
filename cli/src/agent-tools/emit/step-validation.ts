/**
 * Step validation for the emit pipeline.
 *
 * Validates that emitted step names are valid states in the workflow's
 * state machine. Namespaced steps (containing a colon) bypass validation.
 * Produces actionable error messages with valid transitions from the
 * current state to enable agent self-correction.
 */

import type { Database } from "bun:sqlite";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";
import type { RunRecord } from "../../../shared/events.js";
import {
	getValidNextStates,
	loadStateMachine,
} from "../state-machine/index.js";
import { getEmitDatabase } from "./database.js";
import type { EmitInput } from "./models.js";

/**
 * Check whether a step name is namespaced (contains a colon separator).
 * Namespaced steps belong to sub-agents and bypass parent state machine validation.
 */
export const isNamespacedStep = (step: string): boolean => step.includes(":");

/**
 * Query the most recent step-level status_change event for a run.
 * Returns the step name as the current state, or null if no events exist.
 */
export const getCurrentRunState = (
	db: Database,
	runId: string,
): string | null => {
	const row = db
		.prepare(
			`SELECT step FROM events
			 WHERE run_id = $runId
			   AND type = 'status_change'
			   AND step IS NOT NULL
			   AND unit IS NULL
			 ORDER BY id DESC
			 LIMIT 1`,
		)
		.get({ $runId: runId }) as { step: string } | null;

	return row?.step ?? null;
};

/**
 * Build an actionable error message for an invalid step name.
 * Includes the invalid step, workflow name, all valid state IDs,
 * and (when known) the current state and valid transitions from it.
 */
export const formatStepValidationError = (
	step: string,
	workflow: string,
	validStateIds: string[],
	currentState: string | null,
	validTransitions: string[] | null,
): string => {
	let msg = `step "${step}" is not a valid state in the "${workflow}" state machine. Valid states: [${validStateIds.join(", ")}].`;

	if (currentState !== null && validTransitions !== null) {
		msg += ` Current state: "${currentState}". Valid transitions from "${currentState}": [${validTransitions.join(", ")}].`;
	}

	return msg;
};

/**
 * Validate a step name against the workflow's state machine.
 *
 * Orchestrates the full validation flow:
 * 1. If no step provided, skip validation.
 * 2. If step is namespaced (contains colon), skip validation.
 * 3. If workflow is "unknown" or run flow is "unknown", skip validation.
 * 4. Load state machine for the workflow. On load failure: return error.
 * 5. Check if step exists in machine.states keys.
 * 6. If invalid: query current state, build error with valid states and transitions.
 * 7. If valid: return success.
 */
export const validateStepAgainstStateMachine = (
	input: EmitInput,
	run: RunRecord,
): TE.TaskEither<CLIError, void> => {
	const step = input.step;
	if (!step) {
		return TE.right(undefined);
	}

	if (isNamespacedStep(step)) {
		return TE.right(undefined);
	}

	const workflow = input.workflow ?? run.flow;
	if (workflow === "unknown" || run.flow === "unknown") {
		return TE.right(undefined);
	}

	return pipe(
		loadStateMachine(workflow),
		TE.chain((machine) => {
			if (machine.states.has(step)) {
				return TE.right(undefined);
			}

			return pipe(
				getEmitDatabase(),
				TE.chain((db) => {
					const currentState = getCurrentRunState(db, run.id);
					const validStateIds = [...machine.states.keys()];
					const validTransitions =
						currentState !== null
							? [...getValidNextStates(machine, currentState)]
							: null;

					const errorMsg = formatStepValidationError(
						step,
						workflow,
						validStateIds,
						currentState,
						validTransitions,
					);

					return TE.left(runtimeError(errorMsg));
				}),
			);
		}),
	);
};
