/**
 * Shared spinner utility wrapping the ora library.
 * Provides TTY-aware spinner functionality with fallback to console logging.
 */

import ora, { type Ora } from "ora";

// ============================================================================
// Constants
// ============================================================================

/**
 * Visual icons for spinner states.
 * Consistent with STEP_ICONS in init/progress.ts.
 */
const SPINNER_ICONS = {
	success: "\u2713", // checkmark
	fail: "\u2717", // x mark
	info: "\u2139", // info symbol
	warn: "\u26A0", // warning symbol
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Spinner interface providing TTY-aware progress indication.
 */
export interface Spinner {
	/**
	 * Start the spinner with a message.
	 * In non-TTY mode, logs the message with a spinner prefix.
	 */
	start(message: string): void;

	/**
	 * Stop spinner with success status.
	 * Shows checkmark icon.
	 */
	succeed(message?: string): void;

	/**
	 * Stop spinner with failure status.
	 * Shows X icon.
	 */
	fail(message?: string): void;

	/**
	 * Show info message.
	 * Shows info icon.
	 */
	info(message: string): void;

	/**
	 * Show warning message.
	 * Shows warning icon.
	 */
	warn(message: string): void;

	/**
	 * Stop spinner without status indicator.
	 */
	stop(): void;

	/**
	 * Update spinner text while running.
	 */
	set text(message: string);
}

// ============================================================================
// TTY Spinner Implementation
// ============================================================================

/**
 * TTY-aware spinner using ora.
 */
class TTYSpinner implements Spinner {
	private spinner: Ora;
	private currentMessage: string = "";

	constructor() {
		this.spinner = ora();
	}

	start(message: string): void {
		this.currentMessage = message;
		this.spinner.start(message);
	}

	succeed(message?: string): void {
		this.spinner.succeed(message ?? this.currentMessage);
	}

	fail(message?: string): void {
		this.spinner.fail(message ?? this.currentMessage);
	}

	info(message: string): void {
		this.spinner.info(message);
	}

	warn(message: string): void {
		this.spinner.warn(message);
	}

	stop(): void {
		this.spinner.stop();
	}

	set text(message: string) {
		this.currentMessage = message;
		this.spinner.text = message;
	}
}

// ============================================================================
// Non-TTY Spinner Implementation
// ============================================================================

/**
 * Non-TTY spinner that uses console.log with prefixes.
 * Provides consistent output in CI/CD and piped environments.
 */
class NonTTYSpinner implements Spinner {
	private currentMessage: string = "";

	start(message: string): void {
		this.currentMessage = message;
		console.log(`... ${message}`);
	}

	succeed(message?: string): void {
		console.log(`${SPINNER_ICONS.success} ${message ?? this.currentMessage}`);
	}

	fail(message?: string): void {
		console.log(`${SPINNER_ICONS.fail} ${message ?? this.currentMessage}`);
	}

	info(message: string): void {
		console.log(`${SPINNER_ICONS.info} ${message}`);
	}

	warn(message: string): void {
		console.log(`${SPINNER_ICONS.warn} ${message}`);
	}

	stop(): void {
		// No-op in non-TTY mode
	}

	set text(message: string) {
		this.currentMessage = message;
		// In non-TTY mode, we don't update text dynamically
		// The next status call will use the updated message
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a spinner instance appropriate for the environment.
 *
 * @param isTTY - Whether the environment supports TTY (interactive terminal)
 * @returns A Spinner instance (TTY-aware ora wrapper or console.log fallback)
 *
 * @example
 * ```typescript
 * const spinner = createSpinner(process.stdout.isTTY ?? false);
 * spinner.start("Loading...");
 * // ... do work ...
 * spinner.succeed("Done!");
 * ```
 */
export function createSpinner(isTTY: boolean): Spinner {
	return isTTY ? new TTYSpinner() : new NonTTYSpinner();
}
