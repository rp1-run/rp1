/**
 * Wizard state management hook using reducer pattern.
 * Provides predictable state transitions for the init wizard UI.
 *
 * @see design.md#3.1-state-management
 */

import { useReducer } from "react";
import type {
	Activity,
	HealthReport,
	StepId,
	StepStatus,
	UserChoices,
	WizardStep,
} from "../../models.js";
import type { DetectedTool } from "../../tool-detector.js";

/**
 * Wizard phase indicating overall wizard state.
 */
export type WizardPhase = "running" | "prompting" | "complete" | "error";

/**
 * Complete wizard state managed by the reducer.
 */
export interface WizardState {
	/** Index of the currently executing step */
	readonly currentStepIndex: number;
	/** All wizard steps with their current status */
	readonly steps: readonly WizardStep[];
	/** Global activities (not step-specific) */
	readonly activities: readonly Activity[];
	/** Detected AI tools */
	readonly detectedTools: readonly DetectedTool[];
	/** Health check report after completion */
	readonly healthReport: HealthReport | null;
	/** User choices from prompts */
	readonly userChoices: UserChoices;
	/** Current wizard phase */
	readonly phase: WizardPhase;
	/** Error message if phase is 'error' */
	readonly error: string | null;
}

/**
 * All possible wizard actions for the reducer.
 */
export type WizardAction =
	| { readonly type: "START_STEP"; readonly stepId: StepId }
	| {
			readonly type: "ADD_ACTIVITY";
			readonly stepId: StepId;
			readonly activity: Activity;
	  }
	| { readonly type: "COMPLETE_STEP"; readonly stepId: StepId }
	| {
			readonly type: "FAIL_STEP";
			readonly stepId: StepId;
			readonly error: string;
	  }
	| {
			readonly type: "SKIP_STEP";
			readonly stepId: StepId;
			readonly reason: string;
	  }
	| {
			readonly type: "SET_USER_CHOICE";
			readonly key: keyof UserChoices;
			readonly value: UserChoices[keyof UserChoices];
	  }
	| { readonly type: "SET_PHASE"; readonly phase: WizardPhase }
	| {
			readonly type: "SET_DETECTED_TOOLS";
			readonly tools: readonly DetectedTool[];
	  }
	| { readonly type: "SET_HEALTH_REPORT"; readonly report: HealthReport };

/**
 * Helper for exhaustive switch statements.
 * TypeScript will error if this is reachable with a non-never type.
 */
const assertNever = (x: never): never => {
	throw new Error(`Unexpected action: ${JSON.stringify(x)}`);
};

/**
 * Step definitions matching INIT_STEPS from index.ts.
 * Each step has an id, name, and description.
 */
export const WIZARD_STEPS: readonly Omit<
	WizardStep,
	"status" | "activities"
>[] = [
	{ id: "registry", name: "Registry", description: "Loading tools registry" },
	{
		id: "git-check",
		name: "Git Check",
		description: "Checking git repository",
	},
	{
		id: "reinit-check",
		name: "Reinit Check",
		description: "Checking existing setup",
	},
	{
		id: "directory-setup",
		name: "Directory Setup",
		description: "Setting up directories",
	},
	{
		id: "tool-detection",
		name: "Tool Detection",
		description: "Detecting AI tools",
	},
	{
		id: "instruction-injection",
		name: "Instruction File",
		description: "Configuring instruction file",
	},
	{
		id: "gitignore-config",
		name: "Gitignore",
		description: "Configuring .gitignore",
	},
	{
		id: "plugin-installation",
		name: "Plugin Install",
		description: "Installing plugins",
	},
	{
		id: "verification",
		name: "Verification",
		description: "Verifying installation",
	},
	{
		id: "health-check",
		name: "Health Check",
		description: "Performing health check",
	},
	{ id: "summary", name: "Summary", description: "Generating summary" },
];

/**
 * Create initial wizard state with all steps in pending status.
 */
const createInitialState = (): WizardState => ({
	currentStepIndex: 0,
	steps: WIZARD_STEPS.map((step) => ({
		...step,
		status: "pending" as StepStatus,
		activities: [],
	})),
	activities: [],
	detectedTools: [],
	healthReport: null,
	userChoices: {},
	phase: "running",
	error: null,
});

/**
 * Update a step's status in the steps array.
 */
const updateStepStatus = (
	steps: readonly WizardStep[],
	stepId: StepId,
	status: StepStatus,
): readonly WizardStep[] =>
	steps.map((step) => (step.id === stepId ? { ...step, status } : step));

/**
 * Add an activity to a specific step.
 */
const addStepActivity = (
	steps: readonly WizardStep[],
	stepId: StepId,
	activity: Activity,
): readonly WizardStep[] =>
	steps.map((step) =>
		step.id === stepId
			? { ...step, activities: [...step.activities, activity] }
			: step,
	);

/**
 * Find the index of a step by its ID.
 */
const findStepIndex = (steps: readonly WizardStep[], stepId: StepId): number =>
	steps.findIndex((step) => step.id === stepId);

/**
 * Wizard state reducer handling all action types.
 * Implements immutable state transitions.
 */
const wizardReducer = (
	state: WizardState,
	action: WizardAction,
): WizardState => {
	switch (action.type) {
		case "START_STEP": {
			const stepIndex = findStepIndex(state.steps, action.stepId);
			if (stepIndex === -1) return state;

			return {
				...state,
				currentStepIndex: stepIndex,
				steps: updateStepStatus(state.steps, action.stepId, "running"),
				phase: "running",
			};
		}

		case "ADD_ACTIVITY": {
			return {
				...state,
				steps: addStepActivity(state.steps, action.stepId, action.activity),
			};
		}

		case "COMPLETE_STEP": {
			const stepIndex = findStepIndex(state.steps, action.stepId);
			if (stepIndex === -1) return state;

			const newSteps = updateStepStatus(
				state.steps,
				action.stepId,
				"completed",
			);
			const isLastStep = stepIndex === state.steps.length - 1;

			return {
				...state,
				steps: newSteps,
				phase: isLastStep ? "complete" : state.phase,
			};
		}

		case "FAIL_STEP": {
			return {
				...state,
				steps: updateStepStatus(state.steps, action.stepId, "failed"),
				phase: "error",
				error: action.error,
			};
		}

		case "SKIP_STEP": {
			// Add a skip activity to the step
			const skipActivity: Activity = {
				id: `skip-${action.stepId}`,
				message: action.reason,
				type: "info",
				timestamp: Date.now(),
			};

			const stepsWithActivity = addStepActivity(
				state.steps,
				action.stepId,
				skipActivity,
			);
			const stepsWithStatus = updateStepStatus(
				stepsWithActivity,
				action.stepId,
				"skipped",
			);

			return {
				...state,
				steps: stepsWithStatus,
			};
		}

		case "SET_USER_CHOICE": {
			return {
				...state,
				userChoices: {
					...state.userChoices,
					[action.key]: action.value,
				},
			};
		}

		case "SET_PHASE": {
			return {
				...state,
				phase: action.phase,
			};
		}

		case "SET_DETECTED_TOOLS": {
			return {
				...state,
				detectedTools: action.tools,
			};
		}

		case "SET_HEALTH_REPORT": {
			return {
				...state,
				healthReport: action.report,
			};
		}

		default:
			// Exhaustive check - TypeScript will error if a case is missing
			return assertNever(action);
	}
};

/**
 * Hook for wizard state management.
 * Returns the current state and dispatch function for actions.
 *
 * @returns Tuple of [state, dispatch] for wizard state management
 *
 * @example
 * ```tsx
 * const [state, dispatch] = useWizardState();
 *
 * // Start a step
 * dispatch({ type: 'START_STEP', stepId: 'tool-detection' });
 *
 * // Add activity to current step
 * dispatch({
 *   type: 'ADD_ACTIVITY',
 *   stepId: 'tool-detection',
 *   activity: { id: '1', message: 'Found Claude Code', type: 'success', timestamp: Date.now() }
 * });
 *
 * // Complete the step
 * dispatch({ type: 'COMPLETE_STEP', stepId: 'tool-detection' });
 * ```
 */
export const useWizardState = (): readonly [
	WizardState,
	React.Dispatch<WizardAction>,
] => {
	return useReducer(wizardReducer, null, createInitialState);
};

/**
 * Get the current step from wizard state.
 */
export const getCurrentStep = (state: WizardState): WizardStep | undefined =>
	state.steps[state.currentStepIndex];

/**
 * Check if all steps are complete.
 */
export const isWizardComplete = (state: WizardState): boolean =>
	state.steps.every(
		(step) =>
			step.status === "completed" ||
			step.status === "skipped" ||
			step.status === "failed",
	);

/**
 * Get count of completed steps.
 */
export const getCompletedStepCount = (state: WizardState): number =>
	state.steps.filter((step) => step.status === "completed").length;
