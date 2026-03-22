import { useCallback, useEffect, useReducer, useRef } from "react";
import {
	type SelectionPosition,
	type UseTextSelectionOptions,
	useTextSelection,
} from "@/hooks/useTextSelection";
import type { TextSelectionAnchor } from "@/types/annotations";

/**
 * Annotation flow state machine states.
 *
 * Exactly five named states govern the annotation interaction lifecycle.
 * Only one state is active at a time -- no combination of boolean flags.
 */
export type AnnotationFlowState =
	| { readonly state: "idle" }
	| {
			readonly state: "selected";
			readonly selection: TextSelectionAnchor;
			readonly position: SelectionPosition;
	  }
	| {
			readonly state: "indicator_visible";
			readonly selection: TextSelectionAnchor;
			readonly position: SelectionPosition;
	  }
	| {
			readonly state: "form_open";
			readonly selection: TextSelectionAnchor;
			readonly position: SelectionPosition;
	  }
	| {
			readonly state: "viewing_annotation";
			readonly annotationId: string;
			readonly position: SelectionPosition;
	  };

/**
 * Actions that trigger state transitions in the annotation flow.
 */
export type AnnotationFlowAction =
	| {
			readonly type: "TEXT_SELECTED";
			readonly selection: TextSelectionAnchor;
			readonly position: SelectionPosition;
	  }
	| { readonly type: "SELECTION_LOCKED" }
	| { readonly type: "INDICATOR_CLICKED" }
	| { readonly type: "FORM_SUBMITTED" }
	| { readonly type: "FORM_CANCELLED" }
	| {
			readonly type: "ANNOTATION_CLICKED";
			readonly annotationId: string;
			readonly position: SelectionPosition;
	  }
	| { readonly type: "POPOVER_CLOSED" }
	| { readonly type: "CLICK_OUTSIDE" }
	| { readonly type: "ESCAPE" };

const IDLE_STATE: AnnotationFlowState = { state: "idle" };

/**
 * Pure reducer implementing the annotation flow state machine.
 *
 * Invalid transitions return the current state unchanged (no-op).
 * Valid transitions follow the state diagram in design.md section 2.
 */
export function annotationFlowReducer(
	current: AnnotationFlowState,
	action: AnnotationFlowAction,
): AnnotationFlowState {
	switch (action.type) {
		case "TEXT_SELECTED":
			if (current.state !== "idle") return current;
			return {
				state: "selected",
				selection: action.selection,
				position: action.position,
			};

		case "SELECTION_LOCKED":
			if (current.state !== "selected") return current;
			return {
				state: "indicator_visible",
				selection: current.selection,
				position: current.position,
			};

		case "INDICATOR_CLICKED":
			if (current.state !== "indicator_visible") return current;
			return {
				state: "form_open",
				selection: current.selection,
				position: current.position,
			};

		case "FORM_SUBMITTED":
		case "FORM_CANCELLED":
			if (current.state !== "form_open") return current;
			return IDLE_STATE;

		case "ANNOTATION_CLICKED":
			if (current.state !== "idle") return current;
			return {
				state: "viewing_annotation",
				annotationId: action.annotationId,
				position: action.position,
			};

		case "POPOVER_CLOSED":
			if (current.state !== "viewing_annotation") return current;
			return IDLE_STATE;

		case "CLICK_OUTSIDE":
			if (
				current.state !== "indicator_visible" &&
				current.state !== "form_open" &&
				current.state !== "viewing_annotation"
			) {
				return current;
			}
			return IDLE_STATE;

		case "ESCAPE":
			if (
				current.state !== "indicator_visible" &&
				current.state !== "form_open" &&
				current.state !== "viewing_annotation"
			) {
				return current;
			}
			return IDLE_STATE;

		default:
			return current;
	}
}

export interface UseAnnotationFlowOptions {
	readonly containerRef?: React.RefObject<HTMLElement | null>;
	readonly enabled?: boolean;
}

export interface UseAnnotationFlowResult {
	readonly flowState: AnnotationFlowState;
	readonly dispatch: (action: AnnotationFlowAction) => void;
	readonly isIdle: boolean;
}

/**
 * Hook implementing the annotation flow state machine.
 *
 * Internally composes useTextSelection to automatically dispatch
 * TEXT_SELECTED and SELECTION_LOCKED actions, encapsulating the
 * full text selection lifecycle.
 *
 * Exposes flowState (current state), dispatch (action dispatcher),
 * and isIdle (convenience boolean).
 */
export function useAnnotationFlow(
	options: UseAnnotationFlowOptions = {},
): UseAnnotationFlowResult {
	const { containerRef, enabled = true } = options;

	const [flowState, dispatch] = useReducer(annotationFlowReducer, IDLE_STATE);

	const flowStateRef = useRef(flowState);
	flowStateRef.current = flowState;

	const textSelectionOptions: UseTextSelectionOptions = {
		containerRef: containerRef as React.RefObject<HTMLElement> | undefined,
		enabled: enabled && flowState.state === "idle",
	};

	const { selection, selectionPosition, lockSelection, clearSelection } =
		useTextSelection(textSelectionOptions);

	useEffect(() => {
		if (
			selection &&
			selectionPosition &&
			flowStateRef.current.state === "idle"
		) {
			dispatch({
				type: "TEXT_SELECTED",
				selection,
				position: selectionPosition,
			});
		}
	}, [selection, selectionPosition]);

	useEffect(() => {
		if (flowState.state === "selected") {
			lockSelection();
			dispatch({ type: "SELECTION_LOCKED" });
		}
	}, [flowState.state, lockSelection]);

	const prevStateRef = useRef(flowState.state);
	useEffect(() => {
		if (prevStateRef.current !== "idle" && flowState.state === "idle") {
			clearSelection();
		}
		prevStateRef.current = flowState.state;
	}, [flowState.state, clearSelection]);

	const wrappedDispatch = useCallback((action: AnnotationFlowAction) => {
		dispatch(action);
	}, []);

	return {
		flowState,
		dispatch: wrappedDispatch,
		isIdle: flowState.state === "idle",
	};
}
