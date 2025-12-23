/**
 * Type definitions for the enhanced init workflow.
 * Provides types for actions, plugin status, health reporting,
 * next steps guidance, and progress tracking.
 */

import type { DetectedTool } from "./tool-detector.js";

// ============================================================================
// Action Types
// ============================================================================

/**
 * An action taken during initialization.
 * Extended with plugin installation and verification action types.
 */
export type InitAction =
	// Directory and file actions
	| { readonly type: "created_directory"; readonly path: string }
	| { readonly type: "created_file"; readonly path: string }
	| { readonly type: "updated_file"; readonly path: string }
	| { readonly type: "skipped"; readonly reason: string }
	// Legacy suggestion actions (for backward compatibility)
	| { readonly type: "plugin_install_suggested"; readonly tool: string }
	| { readonly type: "kb_build_suggested" }
	// Plugin installation actions
	| {
			readonly type: "plugin_installed";
			readonly name: string;
			readonly version: string;
	  }
	| {
			readonly type: "plugin_updated";
			readonly name: string;
			readonly version: string;
	  }
	| {
			readonly type: "plugin_install_failed";
			readonly name: string;
			readonly error: string;
	  }
	// Verification actions
	| { readonly type: "verification_passed"; readonly component: string }
	| {
			readonly type: "verification_failed";
			readonly component: string;
			readonly issue: string;
	  }
	// Health check actions
	| { readonly type: "health_check_passed" }
	| { readonly type: "health_check_warning"; readonly message: string };

// ============================================================================
// Plugin Status
// ============================================================================

/**
 * Plugin installation status.
 * Tracks whether a plugin is installed and its version/location.
 */
export interface PluginStatus {
	readonly name: string;
	readonly installed: boolean;
	readonly version: string | null;
	readonly location: string | null;
}

// ============================================================================
// Health Report
// ============================================================================

/**
 * Health check report for the rp1 setup.
 * Validates all components are correctly configured.
 */
export interface HealthReport {
	readonly rp1DirExists: boolean;
	readonly instructionFileValid: boolean;
	readonly gitignoreConfigured: boolean;
	readonly pluginsInstalled: boolean;
	readonly plugins: readonly PluginStatus[];
	readonly issues: readonly string[];
}

/**
 * Create an empty health report with all checks failing.
 * Useful as a default when health check cannot be performed.
 */
export const emptyHealthReport = (): HealthReport => ({
	rp1DirExists: false,
	instructionFileValid: false,
	gitignoreConfigured: false,
	pluginsInstalled: false,
	plugins: [],
	issues: ["Health check not performed"],
});

// ============================================================================
// Next Steps
// ============================================================================

/**
 * Next step guidance for the user.
 * Provides actionable instructions after init completes.
 */
export interface NextStep {
	readonly order: number;
	readonly action: string;
	readonly command?: string;
	readonly required: boolean;
}

// ============================================================================
// Verification Result
// ============================================================================

/**
 * Result of plugin verification.
 * Tracks which plugins were verified and any issues found.
 */
export interface VerificationResult {
	readonly verified: boolean;
	readonly plugins: readonly PluginStatus[];
	readonly issues: readonly string[];
}

// ============================================================================
// Plugin Install Result
// ============================================================================

/**
 * Result of plugin installation attempt.
 */
export interface PluginInstallResult {
	readonly success: boolean;
	readonly pluginsInstalled: readonly string[];
	readonly warnings: readonly string[];
	readonly error?: unknown;
}

// ============================================================================
// Progress Tracking
// ============================================================================

/**
 * Step execution status for progress tracking.
 */
export type StepStatus =
	| "pending"
	| "running"
	| "completed"
	| "failed"
	| "skipped";

/**
 * Individual step information for progress display.
 */
export interface InitStepInfo {
	readonly name: string;
	readonly description: string;
	readonly status: StepStatus;
}

// ============================================================================
// Enhanced Init Result
// ============================================================================

/**
 * Enhanced result of the initialization process.
 * Includes health report and next steps in addition to actions.
 */
export interface InitResult {
	/** All actions taken during initialization */
	readonly actions: readonly InitAction[];
	/** The primary detected tool (if any) */
	readonly detectedTool: DetectedTool | null;
	/** Warnings generated during initialization */
	readonly warnings: readonly string[];
	/** Health check report (null if health check was not performed) */
	readonly healthReport: HealthReport | null;
	/** Next steps for the user */
	readonly nextSteps: readonly NextStep[];
}

// ============================================================================
// Init Options and Context (re-exported for convenience)
// ============================================================================

/**
 * Options for the init command.
 */
export interface InitOptions {
	/** Current working directory (defaults to process.cwd()) */
	readonly cwd?: string;
	/** Force non-interactive mode (--yes flag) */
	readonly yes?: boolean;
	/** Force interactive mode even without TTY (--interactive flag) */
	readonly interactive?: boolean;
}

/**
 * Gitignore preset configurations.
 */
export const GITIGNORE_PRESETS = {
	/**
	 * Option A (Recommended): Track context, ignore work.
	 * Uses !.rp1/ to override global gitignore rules that may ignore .rp1/
	 */
	recommended: `!.rp1/
.rp1/*
!.rp1/context/
!.rp1/context/**
.rp1/context/meta.json`,

	/** Option B: Track everything except meta.json */
	track_all: `!.rp1/
.rp1/context/meta.json`,

	/** Option C: Ignore entire .rp1/ */
	ignore_all: `.rp1/`,
} as const;

export type GitignorePreset = keyof typeof GITIGNORE_PRESETS;

/**
 * Choice for re-initialization behavior.
 */
export type ReinitChoice = "update" | "skip" | "reinitialize";

/**
 * State detection for re-initialization.
 */
export interface ReinitState {
	/** Whether .rp1/ directory exists */
	readonly hasRp1Dir: boolean;
	/** Whether instruction file has fenced content */
	readonly hasFencedContent: boolean;
	/** Whether KB content exists (.rp1/context/index.md) */
	readonly hasKBContent: boolean;
	/** Whether work content exists (any files in .rp1/work/) */
	readonly hasWorkContent: boolean;
}
