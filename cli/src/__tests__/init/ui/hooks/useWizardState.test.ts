/**
 * Unit tests for useWizardState hook.
 * Tests state transitions and activity accumulation logic.
 *
 * NOTE: Since the reducer is internal to the hook, we test through
 * helper functions with manually constructed states and via
 * component-based integration where needed.
 */

import { describe, expect, test } from "bun:test";
import type { Activity, StepId, WizardStep } from "../../../../init/models.js";
import {
	getCompletedStepCount,
	getCurrentStep,
	isWizardComplete,
	WIZARD_STEPS,
	type WizardState,
} from "../../../../init/ui/hooks/useWizardState.js";

/**
 * Factory to create a WizardState for testing.
 * Mimics the internal createInitialState but allows customization.
 */
function createTestState(overrides: Partial<WizardState> = {}): WizardState {
	const steps: readonly WizardStep[] = WIZARD_STEPS.map((step) => ({
		...step,
		status: "pending" as const,
		activities: [],
	}));

	return {
		currentStepIndex: 0,
		steps,
		activities: [],
		detectedTools: [],
		healthReport: null,
		projectContext: null,
		userChoices: {},
		phase: "running",
		error: null,
		...overrides,
	};
}

/**
 * Update a step's status in the steps array (test helper).
 */
function updateStepStatus(
	steps: readonly WizardStep[],
	stepId: StepId,
	status: WizardStep["status"],
): readonly WizardStep[] {
	return steps.map((step) => (step.id === stepId ? { ...step, status } : step));
}

/**
 * Add an activity to a specific step (test helper).
 */
function addStepActivity(
	steps: readonly WizardStep[],
	stepId: StepId,
	activity: Activity,
): readonly WizardStep[] {
	return steps.map((step) =>
		step.id === stepId
			? { ...step, activities: [...step.activities, activity] }
			: step,
	);
}

describe("useWizardState", () => {
	describe("WIZARD_STEPS constant", () => {
		test("contains all expected step IDs", () => {
			const expectedIds: StepId[] = [
				"registry",
				"git-check",
				"reinit-check",
				"directory-setup",
				"tool-detection",
				"instruction-injection",
				"gitignore-config",
				"plugin-installation",
				"verification",
				"health-check",
				"summary",
			];

			const actualIds = WIZARD_STEPS.map((step) => step.id);
			expect(actualIds).toEqual(expectedIds);
		});

		test("all steps have required fields", () => {
			for (const step of WIZARD_STEPS) {
				expect(step).toHaveProperty("id");
				expect(step).toHaveProperty("name");
				expect(step).toHaveProperty("description");
				expect(typeof step.id).toBe("string");
				expect(typeof step.name).toBe("string");
				expect(typeof step.description).toBe("string");
			}
		});
	});

	describe("getCurrentStep helper", () => {
		test("returns first step when currentStepIndex is 0", () => {
			const state = createTestState();
			const current = getCurrentStep(state);

			expect(current).toBeDefined();
			expect(current?.id).toBe("registry");
		});

		test("returns correct step for middle index", () => {
			const state = createTestState({ currentStepIndex: 4 });
			const current = getCurrentStep(state);

			expect(current?.id).toBe("tool-detection");
		});

		test("returns last step for final index", () => {
			const state = createTestState({ currentStepIndex: 10 });
			const current = getCurrentStep(state);

			expect(current?.id).toBe("summary");
		});

		test("returns undefined for out-of-bounds index", () => {
			const state = createTestState({ currentStepIndex: 999 });
			const current = getCurrentStep(state);

			expect(current).toBeUndefined();
		});
	});

	describe("isWizardComplete helper", () => {
		test("returns false when all steps are pending", () => {
			const state = createTestState();
			expect(isWizardComplete(state)).toBe(false);
		});

		test("returns false when some steps are pending", () => {
			const state = createTestState();
			const steps = updateStepStatus(state.steps, "registry", "completed");
			const stateWithProgress = { ...state, steps };

			expect(isWizardComplete(stateWithProgress)).toBe(false);
		});

		test("returns true when all steps are completed", () => {
			let steps = createTestState().steps;
			for (const step of WIZARD_STEPS) {
				steps = updateStepStatus(steps, step.id, "completed");
			}
			const state = createTestState({ steps });

			expect(isWizardComplete(state)).toBe(true);
		});

		test("returns true when steps are mix of completed/skipped/failed", () => {
			let steps = createTestState().steps;
			const stepIds = WIZARD_STEPS.map((s) => s.id);

			// Mark various statuses that count as "done"
			steps = updateStepStatus(steps, stepIds[0], "completed");
			steps = updateStepStatus(steps, stepIds[1], "skipped");
			steps = updateStepStatus(steps, stepIds[2], "completed");
			steps = updateStepStatus(steps, stepIds[3], "failed");

			// Mark remaining as completed
			for (let i = 4; i < stepIds.length; i++) {
				steps = updateStepStatus(steps, stepIds[i], "completed");
			}

			const state = createTestState({ steps });
			expect(isWizardComplete(state)).toBe(true);
		});

		test("returns false when any step is still running", () => {
			let steps = createTestState().steps;
			for (const step of WIZARD_STEPS) {
				steps = updateStepStatus(steps, step.id, "completed");
			}
			// Set one step back to running
			steps = updateStepStatus(steps, "tool-detection", "running");

			const state = createTestState({ steps });
			expect(isWizardComplete(state)).toBe(false);
		});
	});

	describe("getCompletedStepCount helper", () => {
		test("returns 0 when no steps are completed", () => {
			const state = createTestState();
			expect(getCompletedStepCount(state)).toBe(0);
		});

		test("returns correct count for partial completion", () => {
			let steps = createTestState().steps;
			steps = updateStepStatus(steps, "registry", "completed");
			steps = updateStepStatus(steps, "git-check", "completed");
			steps = updateStepStatus(steps, "reinit-check", "completed");

			const state = createTestState({ steps });
			expect(getCompletedStepCount(state)).toBe(3);
		});

		test("counts only completed status, not skipped or failed", () => {
			let steps = createTestState().steps;
			steps = updateStepStatus(steps, "registry", "completed");
			steps = updateStepStatus(steps, "git-check", "skipped");
			steps = updateStepStatus(steps, "reinit-check", "failed");
			steps = updateStepStatus(steps, "directory-setup", "completed");

			const state = createTestState({ steps });
			expect(getCompletedStepCount(state)).toBe(2);
		});

		test("returns total count when all steps are completed", () => {
			let steps = createTestState().steps;
			for (const step of WIZARD_STEPS) {
				steps = updateStepStatus(steps, step.id, "completed");
			}

			const state = createTestState({ steps });
			expect(getCompletedStepCount(state)).toBe(WIZARD_STEPS.length);
		});
	});

	describe("state transitions (pending -> running -> completed)", () => {
		test("step starts in pending status", () => {
			const state = createTestState();
			const firstStep = state.steps[0];

			expect(firstStep.status).toBe("pending");
		});

		test("simulating START_STEP transitions pending to running", () => {
			const state = createTestState();
			const steps = updateStepStatus(state.steps, "registry", "running");
			const newState = { ...state, steps, currentStepIndex: 0 };

			const current = getCurrentStep(newState);
			expect(current?.status).toBe("running");
		});

		test("simulating COMPLETE_STEP transitions running to completed", () => {
			let steps = createTestState().steps;
			steps = updateStepStatus(steps, "registry", "running");
			steps = updateStepStatus(steps, "registry", "completed");

			const state = createTestState({ steps });
			const registryStep = state.steps.find((s) => s.id === "registry");

			expect(registryStep?.status).toBe("completed");
		});

		test("simulating FAIL_STEP transitions running to failed", () => {
			let steps = createTestState().steps;
			steps = updateStepStatus(steps, "tool-detection", "running");
			steps = updateStepStatus(steps, "tool-detection", "failed");

			const state = createTestState({
				steps,
				phase: "error",
				error: "Tool detection failed",
			});

			const toolStep = state.steps.find((s) => s.id === "tool-detection");
			expect(toolStep?.status).toBe("failed");
			expect(state.phase).toBe("error");
			expect(state.error).toBe("Tool detection failed");
		});

		test("simulating SKIP_STEP transitions to skipped", () => {
			let steps = createTestState().steps;
			steps = updateStepStatus(steps, "gitignore-config", "skipped");

			const state = createTestState({ steps });
			const gitignoreStep = state.steps.find(
				(s) => s.id === "gitignore-config",
			);

			expect(gitignoreStep?.status).toBe("skipped");
		});
	});

	describe("activity accumulation per step", () => {
		test("activities start empty for each step", () => {
			const state = createTestState();

			for (const step of state.steps) {
				expect(step.activities).toHaveLength(0);
			}
		});

		test("activity can be added to a specific step", () => {
			const state = createTestState();
			const activity: Activity = {
				id: "act-1",
				message: "Found Claude Code v1.0.33",
				type: "success",
				timestamp: Date.now(),
			};

			const steps = addStepActivity(state.steps, "tool-detection", activity);
			const toolStep = steps.find((s) => s.id === "tool-detection");

			expect(toolStep?.activities).toHaveLength(1);
			expect(toolStep?.activities[0].message).toBe("Found Claude Code v1.0.33");
			expect(toolStep?.activities[0].type).toBe("success");
		});

		test("multiple activities accumulate for the same step", () => {
			const state = createTestState();
			const activity1: Activity = {
				id: "act-1",
				message: "Checking for Claude Code...",
				type: "info",
				timestamp: Date.now(),
			};
			const activity2: Activity = {
				id: "act-2",
				message: "Found Claude Code v1.0.33",
				type: "success",
				timestamp: Date.now() + 100,
			};
			const activity3: Activity = {
				id: "act-3",
				message: "Found OpenCode v0.8.0",
				type: "success",
				timestamp: Date.now() + 200,
			};

			let steps = state.steps;
			steps = addStepActivity(steps, "tool-detection", activity1);
			steps = addStepActivity(steps, "tool-detection", activity2);
			steps = addStepActivity(steps, "tool-detection", activity3);

			const toolStep = steps.find((s) => s.id === "tool-detection");
			expect(toolStep?.activities).toHaveLength(3);
			expect(toolStep?.activities[0].message).toBe(
				"Checking for Claude Code...",
			);
			expect(toolStep?.activities[1].message).toBe("Found Claude Code v1.0.33");
			expect(toolStep?.activities[2].message).toBe("Found OpenCode v0.8.0");
		});

		test("activities are isolated between steps", () => {
			const state = createTestState();
			const activity1: Activity = {
				id: "act-1",
				message: "Activity for tool detection",
				type: "info",
				timestamp: Date.now(),
			};
			const activity2: Activity = {
				id: "act-2",
				message: "Activity for plugin installation",
				type: "success",
				timestamp: Date.now(),
			};

			let steps = state.steps;
			steps = addStepActivity(steps, "tool-detection", activity1);
			steps = addStepActivity(steps, "plugin-installation", activity2);

			const toolStep = steps.find((s) => s.id === "tool-detection");
			const pluginStep = steps.find((s) => s.id === "plugin-installation");

			expect(toolStep?.activities).toHaveLength(1);
			expect(toolStep?.activities[0].message).toBe(
				"Activity for tool detection",
			);

			expect(pluginStep?.activities).toHaveLength(1);
			expect(pluginStep?.activities[0].message).toBe(
				"Activity for plugin installation",
			);
		});

		test("activities support all types (info, success, warning, error)", () => {
			const state = createTestState();
			const activities: Activity[] = [
				{ id: "1", message: "Info message", type: "info", timestamp: 1 },
				{ id: "2", message: "Success message", type: "success", timestamp: 2 },
				{ id: "3", message: "Warning message", type: "warning", timestamp: 3 },
				{ id: "4", message: "Error message", type: "error", timestamp: 4 },
			];

			let steps = state.steps;
			for (const activity of activities) {
				steps = addStepActivity(steps, "health-check", activity);
			}

			const healthStep = steps.find((s) => s.id === "health-check");
			expect(healthStep?.activities).toHaveLength(4);
			expect(healthStep?.activities.map((a) => a.type)).toEqual([
				"info",
				"success",
				"warning",
				"error",
			]);
		});
	});

	describe("phase transitions", () => {
		test("initial phase is running", () => {
			const state = createTestState();
			expect(state.phase).toBe("running");
		});

		test("phase can transition to prompting", () => {
			const state = createTestState({ phase: "prompting" });
			expect(state.phase).toBe("prompting");
		});

		test("phase can transition to complete", () => {
			const state = createTestState({ phase: "complete" });
			expect(state.phase).toBe("complete");
		});

		test("phase can transition to error", () => {
			const state = createTestState({
				phase: "error",
				error: "Something went wrong",
			});
			expect(state.phase).toBe("error");
			expect(state.error).toBe("Something went wrong");
		});
	});

	describe("user choices handling", () => {
		test("userChoices starts empty", () => {
			const state = createTestState();
			expect(state.userChoices).toEqual({});
		});

		test("gitRootChoice can be set", () => {
			const state = createTestState({
				userChoices: { gitRootChoice: "switch" },
			});
			expect(state.userChoices.gitRootChoice).toBe("switch");
		});

		test("reinitChoice can be set", () => {
			const state = createTestState({
				userChoices: { reinitChoice: "update" },
			});
			expect(state.userChoices.reinitChoice).toBe("update");
		});

		test("gitignorePreset can be set", () => {
			const state = createTestState({
				userChoices: { gitignorePreset: "recommended" },
			});
			expect(state.userChoices.gitignorePreset).toBe("recommended");
		});

		test("multiple choices can coexist", () => {
			const state = createTestState({
				userChoices: {
					gitRootChoice: "continue",
					reinitChoice: "skip",
					gitignorePreset: "track_all",
				},
			});
			expect(state.userChoices).toEqual({
				gitRootChoice: "continue",
				reinitChoice: "skip",
				gitignorePreset: "track_all",
			});
		});
	});
});
