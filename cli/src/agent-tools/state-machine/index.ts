/**
 * State machine module public API.
 *
 * Provides parsing, transformation, loading, graph queries, and domain
 * model types for Mermaid stateDiagram-v2 workflow definitions.
 */

export {
	deriveOrderedSteps,
	getDirectPredecessors,
	getTransitionsFrom,
	getValidNextStates,
	isReachable,
	validateTransition,
} from "./adapter.js";
export { extractStateMachineMermaid } from "./extractor.js";
export { clearCache, listWorkflows, loadStateMachine } from "./loader.js";
export type {
	OrderedStep,
	SMState,
	SMTransition,
	StateMachine,
	TransitionValidation,
} from "./models.js";
export {
	deserializeStateMachine,
	serializeStateMachine,
} from "./serialization.js";
export { parseAndTransform, transformAstToStateMachine } from "./transform.js";
