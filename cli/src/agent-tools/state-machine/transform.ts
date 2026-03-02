/**
 * Transform mermaid-ast StateDiagramAST into the StateMachine domain model.
 *
 * Walks the AST nodes to extract states, transitions, initial/terminal markers.
 * Returns Either<CLIError, StateMachine> following the fp-ts pattern.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { parseStateDiagram } from "mermaid-ast/parser";
import type { StateDiagramAST } from "mermaid-ast/types";
import type { CLIError } from "../../../shared/errors.js";
import { parseError } from "../../../shared/errors.js";
import type { SMState, SMTransition, StateMachine } from "./models.js";

const START_END_MARKER = "[*]";

/**
 * Parse raw Mermaid stateDiagram-v2 text and transform into a StateMachine.
 *
 * Pipeline: raw text -> mermaid-ast parseStateDiagram() -> AST -> transformAstToStateMachine()
 */
export const parseAndTransform = (
	id: string,
	source: string,
): E.Either<CLIError, StateMachine> =>
	pipe(
		parseMermaidSource(id, source),
		E.chain((ast) => transformAstToStateMachine(id, ast)),
	);

/**
 * Parse raw Mermaid text into a StateDiagramAST via mermaid-ast.
 */
const parseMermaidSource = (
	id: string,
	source: string,
): E.Either<CLIError, StateDiagramAST> => {
	try {
		return E.right(parseStateDiagram(source));
	} catch (error: unknown) {
		const message =
			error instanceof Error ? error.message : "Unknown parse error";
		return E.left(parseError(id, message));
	}
};

/**
 * Transform a mermaid-ast state diagram AST into our StateMachine domain model.
 *
 * Walks the AST to extract:
 * - State declarations (id, label)
 * - Transitions (source -> target, with optional label)
 * - Initial markers ([*] -> state)
 * - Terminal markers (state -> [*])
 *
 * Validates that only supported constructs are present.
 */
export const transformAstToStateMachine = (
	id: string,
	ast: StateDiagramAST,
): E.Either<CLIError, StateMachine> => {
	const unsupported = detectUnsupportedFeatures(ast);
	if (unsupported !== null) {
		return E.left(
			parseError(id, `Unsupported state diagram feature: ${unsupported}`),
		);
	}

	const initialStateIds: string[] = [];
	const terminalStateIds: string[] = [];
	const transitions: SMTransition[] = [];
	const stateLabels = new Map<string, string | null>();

	for (const [stateId, stateDef] of ast.states) {
		if (stateId === START_END_MARKER) continue;
		const desc = stateDef.description;
		const label =
			typeof desc === "string"
				? desc
				: Array.isArray(desc)
					? desc.join(" ")
					: null;
		stateLabels.set(stateId, label);
	}

	for (const transition of ast.transitions) {
		const sourceId = transition.state1.id;
		const targetId = transition.state2.id;
		const label = transition.description || null;

		if (sourceId === START_END_MARKER && targetId === START_END_MARKER) {
			continue;
		}

		if (sourceId === START_END_MARKER) {
			initialStateIds.push(targetId);
			if (!stateLabels.has(targetId)) {
				stateLabels.set(targetId, null);
			}
			continue;
		}

		if (targetId === START_END_MARKER) {
			terminalStateIds.push(sourceId);
			if (!stateLabels.has(sourceId)) {
				stateLabels.set(sourceId, null);
			}
			continue;
		}

		if (!stateLabels.has(sourceId)) {
			stateLabels.set(sourceId, null);
		}
		if (!stateLabels.has(targetId)) {
			stateLabels.set(targetId, null);
		}

		transitions.push({ sourceId, targetId, label });
	}

	if (initialStateIds.length === 0) {
		return E.left(
			parseError(
				id,
				"No initial state defined. Add a '[*] --> state_id' transition.",
			),
		);
	}

	const initialSet = new Set(initialStateIds);
	const terminalSet = new Set(terminalStateIds);

	const states = new Map<string, SMState>();
	for (const [stateId, label] of stateLabels) {
		states.set(stateId, {
			id: stateId,
			label,
			isInitial: initialSet.has(stateId),
			isTerminal: terminalSet.has(stateId),
		});
	}

	return E.right({
		id,
		states,
		transitions,
		initialStates: initialStateIds,
		terminalStates: terminalStateIds,
	});
};

/**
 * Detect unsupported features in the AST.
 * Returns a description of the unsupported feature, or null if all features are supported.
 */
const detectUnsupportedFeatures = (ast: StateDiagramAST): string | null => {
	for (const [, stateDef] of ast.states) {
		if (stateDef.id === START_END_MARKER) continue;

		if (stateDef.type === "fork") {
			return "fork state (<<fork>>)";
		}
		if (stateDef.type === "join") {
			return "join state (<<join>>)";
		}
		if (stateDef.doc !== undefined) {
			return "nested/composite state";
		}
		if (stateDef.note !== undefined) {
			return "state note";
		}
	}

	return null;
};
