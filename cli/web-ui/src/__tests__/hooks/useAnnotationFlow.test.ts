import { describe, expect, test } from "bun:test";
import {
	type AnnotationFlowState,
	annotationFlowReducer,
} from "../../hooks/useAnnotationFlow";
import type { SelectionPosition } from "../../hooks/useTextSelection";
import type { TextSelectionAnchor } from "../../types/annotations";

const mockSelection: TextSelectionAnchor = {
	type: "text-selection",
	startOffset: 0,
	endOffset: 10,
	selectedText: "hello world",
	contextBefore: "",
	contextAfter: " more text",
};

const mockPosition: SelectionPosition = {
	x: 100,
	y: 200,
	anchorRect: { left: 80, right: 120, top: 195, bottom: 215 },
};

const idle: AnnotationFlowState = { state: "idle" };

const selected: AnnotationFlowState = {
	state: "selected",
	selection: mockSelection,
	position: mockPosition,
};

const indicatorVisible: AnnotationFlowState = {
	state: "indicator_visible",
	selection: mockSelection,
	position: mockPosition,
};

const formOpen: AnnotationFlowState = {
	state: "form_open",
	selection: mockSelection,
	position: mockPosition,
};

const viewingAnnotation: AnnotationFlowState = {
	state: "viewing_annotation",
	annotationId: "ann-123",
	position: mockPosition,
};

describe("annotationFlowReducer", () => {
	describe("valid transitions", () => {
		test("idle -> selected via TEXT_SELECTED", () => {
			const result = annotationFlowReducer(idle, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			expect(result).toEqual(selected);
		});

		test("selected -> indicator_visible via SELECTION_LOCKED", () => {
			const result = annotationFlowReducer(selected, {
				type: "SELECTION_LOCKED",
			});
			expect(result).toEqual(indicatorVisible);
		});

		test("SELECTION_LOCKED preserves selection and position from selected state", () => {
			const result = annotationFlowReducer(selected, {
				type: "SELECTION_LOCKED",
			});
			expect(result.state).toBe("indicator_visible");
			if (result.state === "indicator_visible") {
				expect(result.selection).toEqual(mockSelection);
				expect(result.position).toEqual(mockPosition);
			}
		});

		test("indicator_visible -> form_open via INDICATOR_CLICKED", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "INDICATOR_CLICKED",
			});
			expect(result).toEqual(formOpen);
		});

		test("INDICATOR_CLICKED preserves selection and position", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "INDICATOR_CLICKED",
			});
			if (result.state === "form_open") {
				expect(result.selection).toEqual(mockSelection);
				expect(result.position).toEqual(mockPosition);
			}
		});

		test("form_open -> idle via FORM_SUBMITTED", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "FORM_SUBMITTED",
			});
			expect(result).toEqual(idle);
		});

		test("form_open -> idle via FORM_CANCELLED", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "FORM_CANCELLED",
			});
			expect(result).toEqual(idle);
		});

		test("idle -> viewing_annotation via ANNOTATION_CLICKED", () => {
			const result = annotationFlowReducer(idle, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-456",
				position: mockPosition,
			});
			expect(result).toEqual({
				state: "viewing_annotation",
				annotationId: "ann-456",
				position: mockPosition,
			});
		});

		test("ANNOTATION_CLICKED carries annotationId and position for panel-click-to-view", () => {
			const panelPosition: SelectionPosition = {
				x: 50,
				y: 300,
				anchorRect: { left: 40, right: 60, top: 290, bottom: 310 },
			};
			const result = annotationFlowReducer(idle, {
				type: "ANNOTATION_CLICKED",
				annotationId: "panel-ann-789",
				position: panelPosition,
			});
			expect(result.state).toBe("viewing_annotation");
			if (result.state === "viewing_annotation") {
				expect(result.annotationId).toBe("panel-ann-789");
				expect(result.position).toEqual(panelPosition);
			}
		});

		test("viewing_annotation -> idle via POPOVER_CLOSED", () => {
			const result = annotationFlowReducer(viewingAnnotation, {
				type: "POPOVER_CLOSED",
			});
			expect(result).toEqual(idle);
		});

		test("indicator_visible -> idle via CLICK_OUTSIDE", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "CLICK_OUTSIDE",
			});
			expect(result).toEqual(idle);
		});

		test("form_open -> idle via CLICK_OUTSIDE", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "CLICK_OUTSIDE",
			});
			expect(result).toEqual(idle);
		});

		test("viewing_annotation -> idle via CLICK_OUTSIDE", () => {
			const result = annotationFlowReducer(viewingAnnotation, {
				type: "CLICK_OUTSIDE",
			});
			expect(result).toEqual(idle);
		});

		test("indicator_visible -> idle via ESCAPE", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "ESCAPE",
			});
			expect(result).toEqual(idle);
		});

		test("form_open -> idle via ESCAPE", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "ESCAPE",
			});
			expect(result).toEqual(idle);
		});

		test("viewing_annotation -> idle via ESCAPE", () => {
			const result = annotationFlowReducer(viewingAnnotation, {
				type: "ESCAPE",
			});
			expect(result).toEqual(idle);
		});
	});

	describe("invalid transitions (no-ops)", () => {
		test("INDICATOR_CLICKED in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "INDICATOR_CLICKED",
			});
			expect(result).toBe(idle);
		});

		test("INDICATOR_CLICKED in selected returns current state", () => {
			const result = annotationFlowReducer(selected, {
				type: "INDICATOR_CLICKED",
			});
			expect(result).toBe(selected);
		});

		test("INDICATOR_CLICKED in form_open returns current state", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "INDICATOR_CLICKED",
			});
			expect(result).toBe(formOpen);
		});

		test("TEXT_SELECTED in selected returns current state", () => {
			const result = annotationFlowReducer(selected, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			expect(result).toBe(selected);
		});

		test("TEXT_SELECTED in indicator_visible returns current state", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			expect(result).toBe(indicatorVisible);
		});

		test("TEXT_SELECTED in form_open returns current state", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			expect(result).toBe(formOpen);
		});

		test("SELECTION_LOCKED in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "SELECTION_LOCKED",
			});
			expect(result).toBe(idle);
		});

		test("SELECTION_LOCKED in indicator_visible returns current state", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "SELECTION_LOCKED",
			});
			expect(result).toBe(indicatorVisible);
		});

		test("FORM_SUBMITTED in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "FORM_SUBMITTED",
			});
			expect(result).toBe(idle);
		});

		test("FORM_SUBMITTED in indicator_visible returns current state", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "FORM_SUBMITTED",
			});
			expect(result).toBe(indicatorVisible);
		});

		test("FORM_CANCELLED in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "FORM_CANCELLED",
			});
			expect(result).toBe(idle);
		});

		test("ANNOTATION_CLICKED in selected returns current state", () => {
			const result = annotationFlowReducer(selected, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-123",
				position: mockPosition,
			});
			expect(result).toBe(selected);
		});

		test("ANNOTATION_CLICKED in indicator_visible returns current state", () => {
			const result = annotationFlowReducer(indicatorVisible, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-123",
				position: mockPosition,
			});
			expect(result).toBe(indicatorVisible);
		});

		test("ANNOTATION_CLICKED in form_open returns current state", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-123",
				position: mockPosition,
			});
			expect(result).toBe(formOpen);
		});

		test("ANNOTATION_CLICKED in viewing_annotation returns current state", () => {
			const result = annotationFlowReducer(viewingAnnotation, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-999",
				position: mockPosition,
			});
			expect(result).toBe(viewingAnnotation);
		});

		test("POPOVER_CLOSED in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "POPOVER_CLOSED",
			});
			expect(result).toBe(idle);
		});

		test("POPOVER_CLOSED in form_open returns current state", () => {
			const result = annotationFlowReducer(formOpen, {
				type: "POPOVER_CLOSED",
			});
			expect(result).toBe(formOpen);
		});

		test("CLICK_OUTSIDE in idle returns current state", () => {
			const result = annotationFlowReducer(idle, {
				type: "CLICK_OUTSIDE",
			});
			expect(result).toBe(idle);
		});

		test("CLICK_OUTSIDE in selected returns current state", () => {
			const result = annotationFlowReducer(selected, {
				type: "CLICK_OUTSIDE",
			});
			expect(result).toBe(selected);
		});

		test("ESCAPE in idle returns current state", () => {
			const result = annotationFlowReducer(idle, { type: "ESCAPE" });
			expect(result).toBe(idle);
		});

		test("ESCAPE in selected returns current state", () => {
			const result = annotationFlowReducer(selected, { type: "ESCAPE" });
			expect(result).toBe(selected);
		});
	});

	describe("full flow sequences", () => {
		test("complete annotation creation flow: idle -> selected -> indicator_visible -> form_open -> idle", () => {
			let state: AnnotationFlowState = idle;

			state = annotationFlowReducer(state, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			expect(state.state).toBe("selected");

			state = annotationFlowReducer(state, { type: "SELECTION_LOCKED" });
			expect(state.state).toBe("indicator_visible");

			state = annotationFlowReducer(state, { type: "INDICATOR_CLICKED" });
			expect(state.state).toBe("form_open");

			state = annotationFlowReducer(state, { type: "FORM_SUBMITTED" });
			expect(state.state).toBe("idle");
		});

		test("annotation viewing flow: idle -> viewing_annotation -> idle", () => {
			let state: AnnotationFlowState = idle;

			state = annotationFlowReducer(state, {
				type: "ANNOTATION_CLICKED",
				annotationId: "ann-abc",
				position: mockPosition,
			});
			expect(state.state).toBe("viewing_annotation");
			if (state.state === "viewing_annotation") {
				expect(state.annotationId).toBe("ann-abc");
			}

			state = annotationFlowReducer(state, { type: "POPOVER_CLOSED" });
			expect(state.state).toBe("idle");
		});

		test("panel-click-to-view flow: sidebar dispatches ANNOTATION_CLICKED from idle", () => {
			const panelPosition: SelectionPosition = {
				x: 200,
				y: 400,
				anchorRect: { left: 180, right: 220, top: 390, bottom: 410 },
			};

			let state: AnnotationFlowState = idle;

			state = annotationFlowReducer(state, {
				type: "ANNOTATION_CLICKED",
				annotationId: "sidebar-ann-001",
				position: panelPosition,
			});

			expect(state.state).toBe("viewing_annotation");
			if (state.state === "viewing_annotation") {
				expect(state.annotationId).toBe("sidebar-ann-001");
				expect(state.position).toEqual(panelPosition);
			}
		});

		test("escape cancellation flow: idle -> selected -> indicator_visible -> idle (via ESCAPE)", () => {
			let state: AnnotationFlowState = idle;

			state = annotationFlowReducer(state, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			state = annotationFlowReducer(state, { type: "SELECTION_LOCKED" });
			expect(state.state).toBe("indicator_visible");

			state = annotationFlowReducer(state, { type: "ESCAPE" });
			expect(state.state).toBe("idle");
		});

		test("click-outside cancellation from form_open: returns to idle", () => {
			let state: AnnotationFlowState = idle;

			state = annotationFlowReducer(state, {
				type: "TEXT_SELECTED",
				selection: mockSelection,
				position: mockPosition,
			});
			state = annotationFlowReducer(state, { type: "SELECTION_LOCKED" });
			state = annotationFlowReducer(state, { type: "INDICATOR_CLICKED" });
			expect(state.state).toBe("form_open");

			state = annotationFlowReducer(state, { type: "CLICK_OUTSIDE" });
			expect(state.state).toBe("idle");
		});
	});

	describe("state exclusivity", () => {
		test("exactly five state names exist in the union", () => {
			const stateNames = [
				"idle",
				"selected",
				"indicator_visible",
				"form_open",
				"viewing_annotation",
			] as const;

			for (const name of stateNames) {
				const state = { state: name } as AnnotationFlowState;
				expect(state.state).toBe(name);
			}
			expect(stateNames).toHaveLength(5);
		});
	});
});
