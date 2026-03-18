/**
 * Graph query adapter for state machine definitions.
 *
 * Provides transition validation, BFS-based step ordering,
 * reachability checks, and state lookups over the StateMachine model.
 */

import type {
	OrderedStep,
	SMTransition,
	StateMachine,
	TransitionValidation,
} from "./models.js";

/**
 * Get all outgoing transitions from a given state.
 */
export const getTransitionsFrom = (
	machine: StateMachine,
	stateId: string,
): readonly SMTransition[] =>
	machine.transitions.filter((t) => t.sourceId === stateId);

/**
 * Get list of valid next state IDs from current state.
 */
export const getValidNextStates = (
	machine: StateMachine,
	stateId: string,
): readonly string[] =>
	getTransitionsFrom(machine, stateId).map((t) => t.targetId);

/**
 * Validate a single transition from one state to another.
 *
 * Returns a TransitionValidation result indicating whether the transition
 * is valid, along with the list of valid next states for error messaging.
 */
export const validateTransition = (
	machine: StateMachine,
	fromState: string,
	toState: string,
): TransitionValidation => {
	const validNexts = getValidNextStates(machine, fromState);
	const valid = validNexts.includes(toState);

	if (valid) {
		return {
			valid: true,
			currentState: fromState,
			targetState: toState,
			validNextStates: validNexts,
		};
	}

	return {
		valid: false,
		currentState: fromState,
		targetState: toState,
		validNextStates: validNexts,
		error: `Invalid transition from '${fromState}' to '${toState}'. Valid next states: ${validNexts.length > 0 ? validNexts.join(", ") : "(none)"}`,
	};
};

/**
 * Derive ordered step sequence via BFS from initial states.
 *
 * Visits states in breadth-first order starting from initial states.
 * Handles cycles (retry loops) via a visited set -- already-visited
 * states are skipped. Returns steps in visit order with sequential indices.
 */
export const deriveOrderedSteps = (
	machine: StateMachine,
): readonly OrderedStep[] => {
	const visited = new Set<string>();
	const steps: OrderedStep[] = [];
	const queue: string[] = [...machine.initialStates];

	for (const stateId of queue) {
		if (visited.has(stateId)) continue;
		visited.add(stateId);
	}

	let head = 0;
	while (head < queue.length) {
		const stateId = queue[head++];
		const state = machine.states.get(stateId);
		steps.push({
			id: stateId,
			label: state?.label ?? stateId,
			index: steps.length,
		});

		const nextStates = getValidNextStates(machine, stateId);
		for (const nextId of nextStates) {
			if (!visited.has(nextId)) {
				visited.add(nextId);
				queue.push(nextId);
			}
		}
	}

	return steps;
};

/**
 * Check if target state is reachable from source state via graph traversal.
 *
 * Uses BFS to explore all reachable states from the source. Returns true
 * if the target is found in the reachable set.
 */
/**
 * Get all direct predecessor states that have a transition TO the given state.
 * Inverts the transition graph: for each transition where targetId === stateId,
 * returns the sourceId.
 */
export const getDirectPredecessors = (
	machine: StateMachine,
	stateId: string,
): readonly string[] => [
	...new Set(
		machine.transitions
			.filter((t) => t.targetId === stateId)
			.map((t) => t.sourceId),
	),
];

/**
 * Check if target state is reachable from source state via graph traversal.
 *
 * Uses BFS to explore all reachable states from the source. Returns true
 * if the target is found in the reachable set.
 */
export const isReachable = (
	machine: StateMachine,
	fromState: string,
	toState: string,
): boolean => {
	if (fromState === toState) return true;

	const visited = new Set<string>([fromState]);
	const queue = [fromState];
	let head = 0;

	while (head < queue.length) {
		const current = queue[head++];
		const nextStates = getValidNextStates(machine, current);

		for (const nextId of nextStates) {
			if (nextId === toState) return true;
			if (!visited.has(nextId)) {
				visited.add(nextId);
				queue.push(nextId);
			}
		}
	}

	return false;
};
