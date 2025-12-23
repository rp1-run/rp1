/**
 * Progress tracking utilities for the init workflow.
 * Provides visual feedback during multi-step initialization.
 */

import type { Logger } from "../../shared/logger.js";
import type { InitStepInfo, StepStatus } from "./models.js";

// ============================================================================
// Constants
// ============================================================================

/**
 * Visual icons for each step status.
 * Used in TTY mode for visual progress indication.
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
 * Provides visual feedback using the Logger's start/success/fail methods.
 * TTY-aware: skips visual output in non-TTY environments.
 */
export class InitProgress {
	private steps: InitStepInfo[] = [];
	private currentIndex = -1;
	private readonly logger: Logger;
	private readonly isTTY: boolean;

	/**
	 * Create a new progress tracker.
	 *
	 * @param logger - Logger instance for output
	 * @param isTTY - Whether we're in a TTY environment
	 */
	constructor(logger: Logger, isTTY: boolean) {
		this.logger = logger;
		this.isTTY = isTTY;
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
			this.logger.debug(`Unknown step: ${name}`);
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
	 * Uses Logger's start/success/fail methods for visual feedback.
	 */
	private render(): void {
		if (!this.isTTY) {
			return;
		}

		if (this.currentIndex === -1 || this.currentIndex >= this.steps.length) {
			return;
		}

		const current = this.steps[this.currentIndex];

		switch (current.status) {
			case "running":
				this.logger.start(current.description);
				break;
			case "completed":
				this.logger.success(current.description);
				break;
			case "failed":
				this.logger.fail(current.description);
				break;
			case "skipped":
				this.logger.info(`Skipped: ${current.description}`);
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
 * @param logger - Logger instance for output
 * @param isTTY - Whether we're in a TTY environment
 * @returns A new InitProgress instance
 */
export const createProgress = (
	logger: Logger,
	isTTY: boolean,
): InitProgress => {
	return new InitProgress(logger, isTTY);
};
