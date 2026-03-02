/**
 * Typed domain interfaces for the state machine module.
 * Represents parsed state machine definitions with graph query support.
 */

/** A single state in the state machine */
export interface SMState {
	readonly id: string;
	readonly label: string | null;
	readonly isInitial: boolean;
	readonly isTerminal: boolean;
}

/** A transition between states */
export interface SMTransition {
	readonly sourceId: string;
	readonly targetId: string;
	readonly label: string | null;
}

/** Parsed state machine definition */
export interface StateMachine {
	readonly id: string;
	readonly states: ReadonlyMap<string, SMState>;
	readonly transitions: readonly SMTransition[];
	readonly initialStates: readonly string[];
	readonly terminalStates: readonly string[];
}

/** Result of a transition validation */
export interface TransitionValidation {
	readonly valid: boolean;
	readonly currentState: string;
	readonly targetState: string;
	readonly validNextStates: readonly string[];
	readonly error?: string;
}

/** Ordered step for dashboard rendering */
export interface OrderedStep {
	readonly id: string;
	readonly label: string;
	readonly index: number;
}
