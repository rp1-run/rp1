/**
 * Step execution hook for the init wizard.
 * Executes wizard steps by delegating to existing business logic modules.
 *
 * @see design.md#3.3-step-execution-hook
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { nanoid } from "nanoid";
import { useCallback, useRef } from "react";
import type { Logger } from "../../../../shared/logger.js";
import {
	loadToolsRegistry,
	type ToolsRegistry,
} from "../../../config/supported-tools.js";
import {
	appendFencedContent,
	hasFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
} from "../../comment-fence.js";
import {
	detectProjectContext,
	type ProjectContext,
} from "../../context-detector.js";
import { detectGitRoot, type GitRootResult } from "../../git-root.js";
import type {
	Activity,
	ActivityType,
	GitignorePreset,
	HealthReport,
	InitOptions,
	PluginStatus,
	ReinitChoice,
	ReinitState,
	StepId,
} from "../../models.js";
import { GITIGNORE_PRESETS } from "../../models.js";
import {
	appendShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
} from "../../shell-fence.js";
import { performHealthCheck } from "../../steps/health-check.js";
import { executePluginInstallation } from "../../steps/plugin-installation.js";
import {
	checkRp1Readiness,
	type ReadinessResult,
} from "../../steps/readiness.js";
import { generateNextSteps } from "../../steps/summary.js";
import {
	verifyClaudeCodePlugins,
	verifyOpenCodePlugins,
} from "../../steps/verification.js";
import {
	AGENTS_TEMPLATE,
	CLAUDE_CODE_TEMPLATE,
} from "../../templates/index.js";
import {
	type DetectedTool,
	detectTools,
	formatDetectedTool,
	getOutdatedTools,
	getPrimaryTool,
	hasDetectedTools,
	type ToolDetectionResult,
} from "../../tool-detector.js";
import type { WizardAction, WizardState } from "./useWizardState.js";

/**
 * Function type for executing a single step.
 */
export type StepExecutor = (stepId: StepId) => Promise<void>;

/**
 * Add activity callback type for step execution.
 */
type AddActivityFn = (
	stepId: StepId,
	message: string,
	type: ActivityType,
) => void;

/**
 * Execution context stored across step executions.
 * Mutable data shared between steps.
 */
interface ExecutionContext {
	cwd: string;
	registry: ToolsRegistry | null;
	gitResult: GitRootResult | null;
	reinitState: ReinitState | null;
	projectContext: ProjectContext | null;
	toolDetectionResult: ToolDetectionResult | null;
	primaryTool: DetectedTool | null;
	readinessResult: ReadinessResult | null;
	pluginStatus: readonly PluginStatus[];
	healthReport: HealthReport | null;
	userChoices: {
		gitRootChoice?: "continue" | "switch" | "cancel";
		reinitChoice?: ReinitChoice;
		gitignorePreset?: GitignorePreset;
	};
}

/**
 * Prompt request for user interaction.
 * When a step needs user input, it sets this in the context.
 */
export interface PromptRequest {
	readonly type: "git-root" | "reinit" | "gitignore";
	readonly resolve: (value: string) => void;
}

/**
 * Props for the useStepExecution hook.
 */
export interface UseStepExecutionProps {
	readonly dispatch: React.Dispatch<WizardAction>;
	readonly options: InitOptions;
	readonly state: WizardState;
	readonly onPromptRequest?: (request: PromptRequest) => void;
}

async function fileExists(filePath: string): Promise<boolean> {
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

async function directoryExists(dirPath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(dirPath);
		return stat.isDirectory();
	} catch {
		return false;
	}
}

async function readFileContent(filePath: string): Promise<string | null> {
	try {
		return await fs.readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

async function writeFileContent(
	filePath: string,
	content: string,
): Promise<void> {
	const dir = path.dirname(filePath);
	await fs.mkdir(dir, { recursive: true });
	await fs.writeFile(filePath, content, "utf-8");
}

/**
 * Hook that executes wizard steps by delegating to existing business logic.
 * Provides activity callbacks to update UI during execution.
 *
 * @param props - Hook props containing dispatch, options, and state
 * @returns StepExecutor function for executing steps
 */
export const useStepExecution = ({
	dispatch,
	options,
	state,
	onPromptRequest,
}: UseStepExecutionProps): StepExecutor => {
	// Mutable execution context shared across steps
	const contextRef = useRef<ExecutionContext>({
		cwd: options.cwd ?? process.cwd(),
		registry: null,
		gitResult: null,
		reinitState: null,
		projectContext: null,
		toolDetectionResult: null,
		primaryTool: null,
		readinessResult: null,
		pluginStatus: [],
		healthReport: null,
		userChoices: {},
	});

	// Track whether a prompt was requested during step execution
	// When true, step should not be marked complete yet
	const promptRequestedRef = useRef(false);

	/**
	 * Add an activity to a step for UI display.
	 */
	const addActivity = useCallback(
		(stepId: StepId, message: string, type: ActivityType) => {
			const activity: Activity = {
				id: nanoid(),
				message,
				type,
				timestamp: Date.now(),
			};
			dispatch({
				type: "ADD_ACTIVITY",
				stepId,
				activity,
			});
		},
		[dispatch],
	);

	/**
	 * Execute the registry loading step.
	 */
	const executeRegistry = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			addAct("registry", "Loading tools registry...", "info");
			const registry = await loadToolsRegistry();
			contextRef.current.registry = registry;
			addAct(
				"registry",
				`Loaded ${registry.tools.length} supported tools`,
				"success",
			);
		},
		[],
	);

	/**
	 * Execute the git check step.
	 */
	const executeGitCheck = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;
			addAct("git-check", "Checking git repository...", "info");

			const gitResultEither = await detectGitRoot(ctx.cwd)();
			const gitResult = E.isRight(gitResultEither)
				? gitResultEither.right
				: {
						isGitRepo: false,
						gitRoot: null,
						currentDir: ctx.cwd,
						isAtRoot: false,
					};

			ctx.gitResult = gitResult;

			if (!gitResult.isGitRepo) {
				addAct("git-check", "Not in a git repository", "warning");
			} else if (gitResult.isAtRoot) {
				addAct("git-check", "At repository root", "success");
			} else {
				// Not at root - need to decide what to do
				addAct("git-check", `In subdirectory of ${gitResult.gitRoot}`, "info");

				const choice = state.userChoices.gitRootChoice;

				if (choice === undefined && !options.yes && onPromptRequest) {
					// Interactive mode and no choice yet - request prompt
					// Mark that we're waiting for user input so step isn't marked complete
					promptRequestedRef.current = true;
					onPromptRequest({ type: "git-root", resolve: () => {} });
					return; // Step will be re-executed after user makes a choice
				}

				// Apply the choice (or default to continue)
				if (choice === "switch" && gitResult.gitRoot) {
					ctx.cwd = gitResult.gitRoot;
					addAct("git-check", `Switched to ${gitResult.gitRoot}`, "success");
				} else if (choice === "cancel") {
					throw new Error("Initialization cancelled by user");
				}
				// Default (continue): stay in current directory
			}
		},
		[state.userChoices.gitRootChoice, options.yes, onPromptRequest],
	);

	/**
	 * Execute the reinit check step.
	 */
	const executeReinitCheck = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;
			addAct("reinit-check", "Checking for existing setup...", "info");

			// Detect project context (greenfield vs brownfield)
			const contextResultEither = await detectProjectContext(ctx.cwd)();
			if (E.isRight(contextResultEither)) {
				ctx.projectContext = contextResultEither.right.context;
			} else {
				ctx.projectContext = "brownfield"; // Default fallback
			}

			// Update wizard state with project context
			dispatch({
				type: "SET_PROJECT_CONTEXT",
				context: ctx.projectContext,
			});

			const reinitState = await detectReinitState(ctx.cwd, ctx.primaryTool);
			ctx.reinitState = reinitState;

			if (!reinitState.hasRp1Dir && !reinitState.hasFencedContent) {
				const contextLabel =
					ctx.projectContext === "greenfield" ? "greenfield" : "brownfield";
				addAct(
					"reinit-check",
					`Fresh installation (${contextLabel} project)`,
					"success",
				);
			} else {
				// rp1 is already configured - need user choice
				const details: string[] = [];
				if (reinitState.hasRp1Dir) details.push(".rp1/ exists");
				if (reinitState.hasFencedContent)
					details.push("instruction file configured");
				if (reinitState.hasKBContent) details.push("KB content exists");
				if (reinitState.hasWorkContent) details.push("work content exists");
				addAct("reinit-check", `Existing: ${details.join(", ")}`, "info");

				const choice = state.userChoices.reinitChoice;

				if (choice === undefined && !options.yes && onPromptRequest) {
					// Interactive mode and no choice yet - request prompt
					promptRequestedRef.current = true;
					onPromptRequest({ type: "reinit", resolve: () => {} });
					return; // Step will be re-executed after user makes a choice
				}

				// Handle reinit choice from state
				if (choice === "skip") {
					throw new Error("Re-initialization skipped by user");
				}
				// update or reinitialize both proceed
			}
		},
		[dispatch, state.userChoices.reinitChoice, options.yes, onPromptRequest],
	);

	/**
	 * Execute the directory setup step.
	 */
	const executeDirectorySetup = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;
			const rp1Root = process.env.RP1_ROOT || ".rp1";
			const rp1Dir = path.resolve(ctx.cwd, rp1Root);
			const contextDir = path.join(rp1Dir, "context");
			const workDir = path.join(rp1Dir, "work");

			// Skip if update mode and directory exists
			if (
				ctx.reinitState?.hasRp1Dir &&
				state.userChoices.reinitChoice === "update"
			) {
				addAct(
					"directory-setup",
					"Directory structure exists (update mode)",
					"info",
				);
				return;
			}

			let created = 0;

			if (!(await directoryExists(rp1Dir))) {
				await fs.mkdir(rp1Dir, { recursive: true });
				addAct("directory-setup", `Created ${rp1Root}/`, "success");
				created++;
			}

			if (!(await directoryExists(contextDir))) {
				await fs.mkdir(contextDir, { recursive: true });
				addAct("directory-setup", `Created ${rp1Root}/context/`, "success");
				created++;
			}

			if (!(await directoryExists(workDir))) {
				await fs.mkdir(workDir, { recursive: true });
				addAct("directory-setup", `Created ${rp1Root}/work/`, "success");
				created++;
			}

			if (created === 0) {
				addAct("directory-setup", "Directory structure exists", "success");
			}
		},
		[state.userChoices.reinitChoice],
	);

	/**
	 * Execute the tool detection step.
	 */
	const executeToolDetection = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			if (!ctx.registry) {
				throw new Error("Registry not loaded");
			}

			addAct("tool-detection", "Detecting AI tools...", "info");

			// Run tool detection and readiness check in parallel
			const [toolResultEither, readinessResult] = await Promise.all([
				detectTools(ctx.registry)(),
				checkRp1Readiness(ctx.cwd),
			]);

			const toolResult = E.isRight(toolResultEither)
				? toolResultEither.right
				: { detected: [], missing: [...ctx.registry.tools] };

			ctx.toolDetectionResult = toolResult;
			ctx.readinessResult = readinessResult;

			if (hasDetectedTools(toolResult)) {
				for (const detected of toolResult.detected) {
					addAct("tool-detection", formatDetectedTool(detected), "success");
				}

				// Check for outdated tools
				const outdated = getOutdatedTools(toolResult);
				for (const tool of outdated) {
					addAct(
						"tool-detection",
						`${tool.tool.name} below minimum ${tool.tool.min_version}`,
						"warning",
					);
				}

				ctx.primaryTool = getPrimaryTool(toolResult) ?? null;

				// Update state with detected tools
				dispatch({
					type: "SET_DETECTED_TOOLS",
					tools: toolResult.detected,
				});
			} else {
				addAct("tool-detection", "No supported AI tools detected", "warning");
			}
		},
		[dispatch],
	);

	/**
	 * Execute the instruction injection step.
	 */
	const executeInstructionInjection = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			// Determine instruction file and template
			let instructionFile: string;
			let template: string;

			if (ctx.primaryTool) {
				instructionFile = ctx.primaryTool.tool.instruction_file;
				template =
					instructionFile === "CLAUDE.md"
						? CLAUDE_CODE_TEMPLATE
						: AGENTS_TEMPLATE;
			} else {
				// Check for existing files, default to CLAUDE.md
				const claudePath = path.resolve(ctx.cwd, "CLAUDE.md");
				const agentsPath = path.resolve(ctx.cwd, "AGENTS.md");

				if (await fileExists(claudePath)) {
					instructionFile = "CLAUDE.md";
					template = CLAUDE_CODE_TEMPLATE;
				} else if (await fileExists(agentsPath)) {
					instructionFile = "AGENTS.md";
					template = AGENTS_TEMPLATE;
				} else {
					instructionFile = "CLAUDE.md";
					template = CLAUDE_CODE_TEMPLATE;
				}
			}

			const filePath = path.resolve(ctx.cwd, instructionFile);
			addAct(
				"instruction-injection",
				`Configuring ${instructionFile}...`,
				"info",
			);

			const exists = await fileExists(filePath);

			if (!exists) {
				const content = `${wrapWithFence(template)}\n`;
				await writeFileContent(filePath, content);
				addAct(
					"instruction-injection",
					`Created ${instructionFile}`,
					"success",
				);
				return;
			}

			const existingContent = await readFileContent(filePath);
			if (existingContent === null) {
				throw new Error(`Failed to read file: ${filePath}`);
			}

			const validation = validateFencing(existingContent);
			if (!validation.valid) {
				throw new Error(
					`Invalid fencing in ${instructionFile}: ${validation.error}`,
				);
			}

			if (hasFencedContent(existingContent)) {
				const newContent = replaceFencedContent(existingContent, template);
				await writeFileContent(filePath, newContent);
				addAct(
					"instruction-injection",
					`Updated ${instructionFile}`,
					"success",
				);
			} else {
				const newContent = appendFencedContent(existingContent, template);
				await writeFileContent(filePath, newContent);
				addAct(
					"instruction-injection",
					`Appended to ${instructionFile}`,
					"success",
				);
			}
		},
		[],
	);

	/**
	 * Execute the gitignore configuration step.
	 */
	const executeGitignoreConfig = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			// Skip if not in a git repo
			if (!ctx.gitResult?.isGitRepo) {
				addAct("gitignore-config", "Skipped (not a git repository)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "gitignore-config",
					reason: "Not a git repository",
				});
				return;
			}

			const gitignorePath = path.resolve(ctx.cwd, ".gitignore");
			const preset: GitignorePreset =
				state.userChoices.gitignorePreset ?? "recommended";

			addAct("gitignore-config", `Applying ${preset} preset...`, "info");

			const gitignoreContent = GITIGNORE_PRESETS[preset];
			const exists = await fileExists(gitignorePath);

			if (!exists) {
				const content = `# rp1:start\n${gitignoreContent}\n# rp1:end\n`;
				await writeFileContent(gitignorePath, content);
				addAct("gitignore-config", "Created .gitignore", "success");
				return;
			}

			const existingContent = await readFileContent(gitignorePath);
			if (existingContent === null) {
				throw new Error(`Failed to read file: ${gitignorePath}`);
			}

			const validation = validateShellFencing(existingContent);
			if (!validation.valid) {
				throw new Error(`Invalid fencing in .gitignore: ${validation.error}`);
			}

			if (hasShellFencedContent(existingContent)) {
				const newContent = replaceShellFencedContent(
					existingContent,
					gitignoreContent,
				);
				await writeFileContent(gitignorePath, newContent);
				addAct("gitignore-config", "Updated .gitignore", "success");
			} else {
				const newContent = appendShellFencedContent(
					existingContent,
					gitignoreContent,
				);
				await writeFileContent(gitignorePath, newContent);
				addAct(
					"gitignore-config",
					"Added rp1 entries to .gitignore",
					"success",
				);
			}
		},
		[dispatch, state.userChoices.gitignorePreset],
	);

	/**
	 * Execute the plugin installation step.
	 */
	const executePluginInstallation_step = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			// Skip if update mode
			if (state.userChoices.reinitChoice === "update") {
				addAct("plugin-installation", "Skipped (update mode)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "plugin-installation",
					reason: "Update mode - plugins already installed",
				});
				return;
			}

			if (!ctx.primaryTool) {
				addAct(
					"plugin-installation",
					"No AI tool detected - skipping plugin installation",
					"warning",
				);
				dispatch({
					type: "SKIP_STEP",
					stepId: "plugin-installation",
					reason: "No AI tool detected",
				});
				return;
			}

			addAct(
				"plugin-installation",
				`Installing plugins for ${ctx.primaryTool.tool.name}...`,
				"info",
			);

			// Create a minimal logger that routes to addAct
			const minimalLogger: Logger = {
				trace: () => {},
				debug: () => {},
				info: (msg: string) => addAct("plugin-installation", msg, "info"),
				warn: (msg: string) => addAct("plugin-installation", msg, "warning"),
				error: (msg: string) => addAct("plugin-installation", msg, "error"),
				start: () => {},
				success: (msg: string) => addAct("plugin-installation", msg, "success"),
				fail: (msg: string) => addAct("plugin-installation", msg, "error"),
				box: () => {},
			};

			const promptOptions = {
				isTTY: false, // Non-interactive for now
			};

			try {
				const result = await executePluginInstallation(
					ctx.primaryTool,
					promptOptions,
					minimalLogger,
				);

				if (result.result?.success) {
					addAct(
						"plugin-installation",
						`Installed: ${result.result.pluginsInstalled.join(", ")}`,
						"success",
					);
				} else if (result.result?.error) {
					addAct(
						"plugin-installation",
						"Plugin installation encountered issues",
						"warning",
					);
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				addAct("plugin-installation", `Error: ${errorMessage}`, "error");
				// Don't throw - plugin installation failures shouldn't block init
			}
		},
		[dispatch, state.userChoices.reinitChoice],
	);

	/**
	 * Execute the verification step.
	 */
	const executeVerification = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			if (
				!ctx.toolDetectionResult ||
				ctx.toolDetectionResult.detected.length === 0
			) {
				addAct("verification", "Skipped (no tools detected)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "verification",
					reason: "No AI tools detected",
				});
				return;
			}

			addAct("verification", "Verifying plugin installation...", "info");

			const allPluginStatus: PluginStatus[] = [];
			let allVerified = true;

			for (const detected of ctx.toolDetectionResult.detected) {
				let verificationResult: {
					verified: boolean;
					plugins: readonly PluginStatus[];
					issues: readonly string[];
				} | null = null;

				if (detected.tool.id === "claude-code") {
					verificationResult = await verifyClaudeCodePlugins();
				} else if (detected.tool.id === "opencode") {
					verificationResult = await verifyOpenCodePlugins();
				}

				if (verificationResult) {
					allPluginStatus.push(...verificationResult.plugins);

					if (verificationResult.verified) {
						addAct(
							"verification",
							`${detected.tool.name} plugins verified`,
							"success",
						);
					} else {
						allVerified = false;
						for (const issue of verificationResult.issues) {
							addAct("verification", issue, "warning");
						}
					}
				}
			}

			ctx.pluginStatus = allPluginStatus;

			if (!allVerified) {
				addAct(
					"verification",
					"Some plugins may need manual installation",
					"warning",
				);
			}
		},
		[dispatch],
	);

	/**
	 * Execute the health check step.
	 */
	const executeHealthCheck = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			addAct("health-check", "Running health check...", "info");

			const healthReport = await performHealthCheck(
				ctx.cwd,
				ctx.pluginStatus,
				ctx.readinessResult ?? undefined,
			);

			ctx.healthReport = healthReport;

			// Report health status
			const checks = [
				{ ok: healthReport.rp1DirExists, label: ".rp1/ directory" },
				{ ok: healthReport.instructionFileValid, label: "Instruction file" },
				{ ok: healthReport.gitignoreConfigured, label: ".gitignore" },
				{ ok: healthReport.pluginsInstalled, label: "Plugins" },
			];

			for (const check of checks) {
				addAct(
					"health-check",
					`${check.label}: ${check.ok ? "OK" : "Missing"}`,
					check.ok ? "success" : "warning",
				);
			}

			// Update state with health report
			dispatch({
				type: "SET_HEALTH_REPORT",
				report: healthReport,
			});
		},
		[dispatch],
	);

	/**
	 * Execute the summary step.
	 * This is mostly a no-op since the UI component renders the summary.
	 */
	const executeSummary = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			// Generate next steps for the state
			const nextSteps = generateNextSteps(
				ctx.healthReport,
				ctx.primaryTool,
				ctx.reinitState?.hasKBContent ?? false,
				ctx.healthReport?.charterExists ?? false,
				ctx.projectContext ?? undefined,
			);

			addAct("summary", `Generated ${nextSteps.length} next steps`, "success");

			// Summary is complete - the FinalSummary component will render the results
		},
		[],
	);

	/**
	 * Execute a step by its ID.
	 * Dispatches START_STEP before execution and COMPLETE_STEP/FAIL_STEP after.
	 */
	const executeStep = useCallback(
		async (stepId: StepId): Promise<void> => {
			// Reset prompt tracking for this execution
			promptRequestedRef.current = false;

			dispatch({ type: "START_STEP", stepId });

			// Create bound addActivity for this step
			const addAct: AddActivityFn = (sid, message, type) =>
				addActivity(sid, message, type);

			try {
				switch (stepId) {
					case "registry":
						await executeRegistry(addAct);
						break;
					case "git-check":
						await executeGitCheck(addAct);
						break;
					case "reinit-check":
						await executeReinitCheck(addAct);
						break;
					case "directory-setup":
						await executeDirectorySetup(addAct);
						break;
					case "tool-detection":
						await executeToolDetection(addAct);
						break;
					case "instruction-injection":
						await executeInstructionInjection(addAct);
						break;
					case "gitignore-config":
						await executeGitignoreConfig(addAct);
						break;
					case "plugin-installation":
						await executePluginInstallation_step(addAct);
						break;
					case "verification":
						await executeVerification(addAct);
						break;
					case "health-check":
						await executeHealthCheck(addAct);
						break;
					case "summary":
						await executeSummary(addAct);
						break;
					default: {
						// Exhaustive check - TypeScript will error if a case is missing
						const _exhaustive: never = stepId;
						throw new Error(`Unknown step: ${_exhaustive}`);
					}
				}

				// Only mark complete if we didn't request a prompt
				// When a prompt is requested, the step stays in "running" state
				// and will be re-executed after the user makes a choice
				if (!promptRequestedRef.current) {
					dispatch({ type: "COMPLETE_STEP", stepId });
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				dispatch({ type: "FAIL_STEP", stepId, error: errorMessage });
			}
		},
		[
			dispatch,
			addActivity,
			executeRegistry,
			executeGitCheck,
			executeReinitCheck,
			executeDirectorySetup,
			executeToolDetection,
			executeInstructionInjection,
			executeGitignoreConfig,
			executePluginInstallation_step,
			executeVerification,
			executeHealthCheck,
			executeSummary,
		],
	);

	return executeStep;
};

/**
 * Detect re-initialization state by checking for existing rp1 artifacts.
 */
async function detectReinitState(
	cwd: string,
	detectedTool: DetectedTool | null,
): Promise<ReinitState> {
	const rp1Root = process.env.RP1_ROOT || ".rp1";
	const rp1Dir = path.resolve(cwd, rp1Root);
	const contextDir = path.join(rp1Dir, "context");

	const hasRp1Dir = await directoryExists(rp1Dir);

	let hasFenced = false;
	const detectedToolInstructionFile =
		detectedTool?.tool.instruction_file ?? null;

	if (detectedToolInstructionFile) {
		const instrPath = path.resolve(cwd, detectedToolInstructionFile);
		const content = await readFileContent(instrPath);
		if (content) {
			hasFenced = hasFencedContent(content);
		}
	} else {
		for (const file of ["CLAUDE.md", "AGENTS.md"]) {
			const instrPath = path.resolve(cwd, file);
			const content = await readFileContent(instrPath);
			if (content && hasFencedContent(content)) {
				hasFenced = true;
				break;
			}
		}
	}

	const hasKB = await fileExists(path.join(contextDir, "index.md"));
	const workDir = path.join(rp1Dir, "work");
	const hasWork = await hasAnyFiles(workDir);

	return {
		hasRp1Dir,
		hasFencedContent: hasFenced,
		hasKBContent: hasKB,
		hasWorkContent: hasWork,
	};
}

/**
 * Check if a directory has any files (recursively).
 */
async function hasAnyFiles(dirPath: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.isFile()) {
				return true;
			}
			if (entry.isDirectory()) {
				const subPath = path.join(dirPath, entry.name);
				if (await hasAnyFiles(subPath)) {
					return true;
				}
			}
		}
		return false;
	} catch {
		return false;
	}
}
