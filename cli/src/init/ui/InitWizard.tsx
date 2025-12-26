/**
 * InitWizard - Main orchestrator component for the init wizard.
 * Manages the wizard flow by coordinating state, step execution, and UI rendering.
 *
 * @see design.md#3.2.1-initwizard-main-component
 */

import { Box, Text, useApp } from "ink";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CLIError } from "../../../shared/errors.js";
import type { ToolsRegistry } from "../../config/supported-tools.js";
import type {
	InitOptions,
	InitResult,
	StepId,
	UserChoices,
} from "../models.js";
import { FinalSummary } from "./components/FinalSummary.js";
import {
	gitignorePresetOptions,
	gitRootOptions,
	reinitOptions,
	SelectPrompt,
} from "./components/SelectPrompt.js";
import { StepList } from "./components/StepList.js";
import { WizardHeader } from "./components/WizardHeader.js";
import { useStepExecution } from "./hooks/useStepExecution.js";
import { getCurrentStep, useWizardState } from "./hooks/useWizardState.js";
import { colors, spacing } from "./styles/theme.js";

/**
 * Props for the InitWizard component.
 */
export interface InitWizardProps {
	/** Initialization options from CLI */
	readonly options: InitOptions;
	/** Tool registry for detecting AI tools */
	readonly registry: ToolsRegistry;
	/** Callback when initialization completes successfully */
	readonly onComplete: (result: InitResult) => void;
	/** Callback when initialization fails with an error */
	readonly onError: (error: CLIError) => void;
}

/**
 * Type of prompt currently being displayed.
 */
type PromptType = "git-root" | "reinit" | "gitignore" | null;

/**
 * Steps that may require user prompts.
 * Note: git-check is NOT listed here because we need to execute the step first
 * to determine if we're at the git root. The step execution itself will
 * trigger a prompt if needed.
 */
const PROMPTABLE_STEPS: Record<StepId, PromptType> = {
	registry: null,
	"git-check": null, // Handled by step execution - only prompts if not at root
	"reinit-check": "reinit",
	"directory-setup": null,
	"tool-detection": null,
	"instruction-injection": null,
	"gitignore-config": "gitignore",
	"plugin-installation": null,
	verification: null,
	"health-check": null,
	summary: null,
};

/**
 * Main wizard orchestrator component.
 * Manages step execution flow and renders appropriate UI based on state.
 *
 * The wizard progresses through steps sequentially, pausing for user input
 * when needed (prompting phase), and displays a summary when complete.
 */
export const InitWizard: React.FC<InitWizardProps> = ({
	options,
	registry: _registry,
	onComplete,
	onError,
}) => {
	const { exit } = useApp();
	const [state, dispatch] = useWizardState();
	const [activePrompt, setActivePrompt] = useState<PromptType>(null);

	// Track whether we've completed to prevent double calls
	const completedRef = useRef(false);
	const executingRef = useRef(false);

	// Note: registry is passed via props for future use but currently
	// the useStepExecution hook loads it internally during the registry step.
	// This keeps the interface consistent with the design spec.

	// Step execution hook
	/**
	 * Handle prompt requests from step execution.
	 * This allows steps to trigger prompts dynamically based on their results.
	 */
	const handlePromptRequest = useCallback(
		(request: { type: "git-root" | "reinit" | "gitignore" }) => {
			setActivePrompt(request.type);
			dispatch({ type: "SET_PHASE", phase: "prompting" });
		},
		[dispatch],
	);

	const executeStep = useStepExecution({
		dispatch,
		options,
		state,
		onPromptRequest: handlePromptRequest,
	});

	/**
	 * Determine if the current step needs a prompt.
	 * For now, we use non-interactive defaults (like --yes mode).
	 * Interactive prompts can be enabled by checking options.yes === false.
	 */
	const needsPrompt = useCallback(
		(stepId: StepId): boolean => {
			// If --yes flag is set or not interactive, skip prompts
			if (options.yes) {
				return false;
			}

			const promptType = PROMPTABLE_STEPS[stepId];
			if (!promptType) {
				return false;
			}

			// Check if we already have a choice for this prompt type
			const choices = state.userChoices;
			switch (promptType) {
				case "git-root":
					return choices.gitRootChoice === undefined;
				case "reinit":
					return choices.reinitChoice === undefined;
				case "gitignore":
					return choices.gitignorePreset === undefined;
				default:
					return false;
			}
		},
		[options.yes, state.userChoices],
	);

	/**
	 * Handle user choice from SelectPrompt.
	 */
	const handleChoice = useCallback(
		(value: string) => {
			if (!activePrompt) return;

			let key: keyof UserChoices;
			switch (activePrompt) {
				case "git-root":
					key = "gitRootChoice";
					break;
				case "reinit":
					key = "reinitChoice";
					break;
				case "gitignore":
					key = "gitignorePreset";
					break;
				default:
					return;
			}

			dispatch({
				type: "SET_USER_CHOICE",
				key,
				value: value as UserChoices[keyof UserChoices],
			});
			setActivePrompt(null);
			dispatch({ type: "SET_PHASE", phase: "running" });
		},
		[activePrompt, dispatch],
	);

	/**
	 * Step execution effect.
	 * Executes the current step when in running phase and not already executing.
	 */
	// Get current step for dependency tracking
	const currentStep = getCurrentStep(state);

	useEffect(() => {
		const runStep = async () => {
			// Don't run if not in running phase or already executing
			if (state.phase !== "running" || executingRef.current) {
				return;
			}

			if (!currentStep) {
				return;
			}

			// Check if this step is already completed/failed/skipped
			if (
				currentStep.status === "completed" ||
				currentStep.status === "failed" ||
				currentStep.status === "skipped"
			) {
				// Move to next step
				const nextIndex = state.currentStepIndex + 1;
				if (nextIndex < state.steps.length) {
					const nextStepId = state.steps[nextIndex]?.id;
					if (nextStepId) {
						dispatch({ type: "START_STEP", stepId: nextStepId });
					}
				}
				return;
			}

			// Check if we need a prompt first (for interactive mode)
			if (needsPrompt(currentStep.id) && !options.yes) {
				const promptType = PROMPTABLE_STEPS[currentStep.id];
				setActivePrompt(promptType);
				dispatch({ type: "SET_PHASE", phase: "prompting" });
				return;
			}

			// Execute the step
			executingRef.current = true;
			try {
				await executeStep(currentStep.id);
			} finally {
				executingRef.current = false;
			}
		};

		runStep();
	}, [
		state.phase,
		state.currentStepIndex,
		state.steps,
		currentStep,
		executeStep,
		dispatch,
		needsPrompt,
		options.yes,
	]);

	/**
	 * Auto-advance to next step after completion.
	 */
	useEffect(() => {
		if (state.phase !== "running") {
			return;
		}

		if (!currentStep) {
			return;
		}

		// If current step is done, advance to next
		if (
			currentStep.status === "completed" ||
			currentStep.status === "skipped"
		) {
			const nextIndex = state.currentStepIndex + 1;
			if (nextIndex < state.steps.length) {
				const nextStepId = state.steps[nextIndex]?.id;
				if (nextStepId) {
					// Small delay to let UI update
					const timer = setTimeout(() => {
						dispatch({ type: "START_STEP", stepId: nextStepId });
					}, 100);
					return () => clearTimeout(timer);
				}
			}
		}
	}, [state.phase, state.currentStepIndex, state.steps, currentStep, dispatch]);

	/**
	 * Handle completion and error states.
	 */
	useEffect(() => {
		if (completedRef.current) {
			return;
		}

		if (state.phase === "complete") {
			completedRef.current = true;

			// Build the InitResult from wizard state
			const result: InitResult = {
				actions: [],
				detectedTool: state.detectedTools[0] ?? null,
				warnings: [],
				healthReport: state.healthReport,
				nextSteps: [],
			};

			onComplete(result);

			// Exit after a short delay to let final render complete
			setTimeout(() => exit(), 500);
		} else if (state.phase === "error" && state.error) {
			completedRef.current = true;

			const error: CLIError = {
				_tag: "RuntimeError",
				message: `Init wizard failed: ${state.error}`,
			};

			onError(error);
			setTimeout(() => exit(), 500);
		}
	}, [
		state.phase,
		state.error,
		state.detectedTools,
		state.healthReport,
		onComplete,
		onError,
		exit,
	]);

	// Render completion state using FinalSummary component
	if (state.phase === "complete") {
		return <FinalSummary state={state} />;
	}

	// Render error state
	if (state.phase === "error") {
		return (
			<Box flexDirection="column" paddingY={spacing.small}>
				<WizardHeader
					currentStep={state.currentStepIndex + 1}
					totalSteps={state.steps.length}
				/>
				<StepList steps={state.steps} currentIndex={state.currentStepIndex} />
				<Box
					borderStyle="round"
					borderColor={colors.error}
					paddingX={spacing.medium}
					paddingY={spacing.small}
					marginTop={spacing.small}
				>
					<Text color={colors.error}>Error: {state.error}</Text>
				</Box>
			</Box>
		);
	}

	// Render active prompt if in prompting phase
	const renderPrompt = () => {
		if (state.phase !== "prompting" || !activePrompt) {
			return null;
		}

		switch (activePrompt) {
			case "git-root":
				return (
					<SelectPrompt
						message="You're not at the git root. Where would you like to initialize?"
						options={gitRootOptions}
						onSelect={
							handleChoice as (value: "continue" | "switch" | "cancel") => void
						}
					/>
				);
			case "reinit":
				return (
					<SelectPrompt
						message="rp1 is already configured. What would you like to do?"
						options={reinitOptions}
						onSelect={
							handleChoice as (
								value: "update" | "skip" | "reinitialize",
							) => void
						}
					/>
				);
			case "gitignore":
				return (
					<SelectPrompt
						message="How should rp1 files be tracked in git?"
						options={gitignorePresetOptions}
						onSelect={
							handleChoice as (
								value: "recommended" | "track_all" | "ignore_all",
							) => void
						}
					/>
				);
			default:
				return null;
		}
	};

	// Main running/prompting state render
	return (
		<Box flexDirection="column">
			<WizardHeader
				currentStep={state.currentStepIndex + 1}
				totalSteps={state.steps.length}
			/>
			<StepList steps={state.steps} currentIndex={state.currentStepIndex} />
			{renderPrompt()}
		</Box>
	);
};

export default InitWizard;
