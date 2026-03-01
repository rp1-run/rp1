/**
 * State machine module public API.
 *
 * Provides parsing, transformation, and domain model types for
 * Mermaid stateDiagram-v2 workflow definitions.
 */

export type {
	OrderedStep,
	SMState,
	SMTransition,
	StateMachine,
	TransitionValidation,
} from "./models.js";

export { parseAndTransform, transformAstToStateMachine } from "./transform.js";
