/**
 * Progress tracking utilities for the init workflow.
 * Provides visual feedback during multi-step initialization.
 */

import { createSpinner, type Spinner } from "../../shared/spinner.js";
import type { InitStepInfo, StepStatus } from "./models.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Visual icons for each step status.
 * Used in TTY mode for visual progress indication.
 * @deprecated Kept for backward compatibility. Use the spinner utility directly.
 */
export const STEP_ICONS: Record<StepStatus, string> = {
	pending: "○",
	running: "◐",
	completed: "✓",
	failed: "✗",
	skipped: "−",
} as const;

// ============================================================================
// InitProgress Class
// ============================================================================

/**
 * Progress tracker for multi-step init workflow.
 * Provides visual feedback using the Spinner utility.
 * TTY-aware: uses animated spinners in TTY, console.log in non-TTY.
 */
export class InitProgress {
	private steps: InitStepInfo[] = [];
	private currentIndex = -1;
	private readonly spinner: Spinner;

	/**
	 * Create a new progress tracker.
	 *
	 * @param isTTY - Whether we're in a TTY environment
	 */
	constructor(isTTY: boolean) {
		this.spinner = createSpinner(isTTY);
	}

	/**
	 * Register steps for tracking.
	 * Call this at the start of the init workflow.
	 *
	 * @param steps - Array of step definitions with name and description
	 */
	registerSteps(
		steps: ReadonlyArray<{ name: string; description: string }>,
	): void {
		this.steps = steps.map((s) => ({
			...s,
			status: "pending" as StepStatus,
		}));
		this.currentIndex = -1;
	}

	/**
	 * Start executing a step.
	 * Updates the step status to "running" and shows a spinner.
	 *
	 * @param name - The name of the step to start
	 */
	startStep(name: string): void {
		const index = this.steps.findIndex((s) => s.name === name);
		if (index === -1) {
			return;
		}

		this.currentIndex = index;
		this.steps[index] = { ...this.steps[index], status: "running" };
		this.render();
	}

	/**
	 * Mark current step as completed.
	 * Updates the step status and shows success indicator.
	 */
	completeStep(): void {
		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		this.steps[this.currentIndex] = {
			...this.steps[this.currentIndex],
			status: "completed",
		};
		this.render();
	}

	/**
	 * Mark current step as failed.
	 * Updates the step status and shows failure indicator.
	 */
	failStep(): void {
		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		this.steps[this.currentIndex] = {
			...this.steps[this.currentIndex],
			status: "failed",
		};
		this.render();
	}

	/**
	 * Mark current step as skipped.
	 * Updates the step status and shows skip indicator.
	 */
	skipStep(): void {
		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		this.steps[this.currentIndex] = {
			...this.steps[this.currentIndex],
			status: "skipped",
		};
		this.render();
	}

	/**
	 * Pause the current step's spinner.
	 * Use this before showing interactive prompts to prevent spinner interference.
	 * Call resumeStep() to restart the spinner, or completeStep()/failStep() to finish.
	 */
	pauseStep(): void {
		this.spinner.stop();
	}

	/**
	 * Resume the current step's spinner after a pause.
	 * Use this after interactive prompts complete if the step is still in progress.
	 */
	resumeStep(): void {
		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		const current = this.steps[this.currentIndex];
		if (current.status === "running") {
			this.spinner.start(current.description);
		}
	}

	/**
	 * Get the current state of all steps.
	 * Useful for generating summary information.
	 *
	 * @returns Readonly array of step information
	 */
	getSteps(): readonly InitStepInfo[] {
		return this.steps;
	}

	/**
	 * Get summary counts of step statuses.
	 *
	 * @returns Object with counts for each status
	 */
	getSummary(): {
		completed: number;
		failed: number;
		skipped: number;
		pending: number;
	} {
		return {
			completed: this.steps.filter((s) => s.status === "completed").length,
			failed: this.steps.filter((s) => s.status === "failed").length,
			skipped: this.steps.filter((s) => s.status === "skipped").length,
			pending: this.steps.filter((s) => s.status === "pending").length,
		};
	}

	/**
	 * Render current step progress.
	 * Uses Spinner for visual feedback with in-place line replacement.
	 */
	private render(): void {
		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		const current = this.steps[this.currentIndex];

		switch (current.status) {
			case "running":
				this.spinner.start(current.description);
				break;
			case "completed":
				this.spinner.succeed(current.description);
				break;
			case "failed":
				this.spinner.fail(current.description);
				break;
			case "skipped":
				this.spinner.info(`Skipped: ${current.description}`);
				break;
			case "pending":
				break;
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new progress tracker.
 * Convenience factory function.
 *
 * @param isTTY - Whether we're in a TTY environment
 * @returns A new InitProgress instance
 */
export const createProgress = (isTTY: boolean): InitProgress => {
	return new InitProgress(isTTY);
};
