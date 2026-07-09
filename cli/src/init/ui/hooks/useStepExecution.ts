/**
 * Step execution hook for the init wizard.
 * Executes wizard steps by delegating to existing business logic modules.
 *
 * @see design.md#3.3-step-execution-hook
 */

import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { nanoid } from "nanoid";
import { useCallback, useRef } from "react";
import { formatError } from "../../../../shared/errors.js";
import type { Logger } from "../../../../shared/logger.js";
import { ensureProjectId } from "../../../../shared/project-id.js";
import {
	loadToolsRegistry,
	type ToolsRegistry,
} from "../../../config/supported-tools.js";
import { LATEST_FENCE_VERSION } from "../../../lib/fence-version.js";
import {
	type InstallContext,
	installAllDetectedTools,
} from "../../../shared/install-core.js";
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
import {
	chooseInitDirectoryModel,
	detectAncestorProject,
	detectReinitState,
	type InitDirectoryModel,
	resolveInitDirectoryModel,
} from "../../directory-model.js";
import { detectGitRoot, type GitRootResult } from "../../git-root.js";
import { buildManagedGitignoreContent } from "../../gitignore.js";
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
import { buildSettingsTomlTemplate } from "../../settings-template.js";
import {
	appendShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
	wrapWithShellFence,
} from "../../shell-fence.js";
import {
	buildHarnessItems,
	getStableDefaults,
	writeHarnessSelection,
} from "../../steps/harness-selection.js";
import { performHealthCheck } from "../../steps/health-check.js";
import { checkPluginsInstalled } from "../../steps/plugin-installation.js";
import {
	checkRp1Readiness,
	type ReadinessResult,
} from "../../steps/readiness.js";
import { generateNextSteps } from "../../steps/summary.js";
import {
	verifyClaudeCodePlugins,
	verifyCopilotPlugins,
	verifyOpenCodePlugins,
} from "../../steps/verification.js";
import {
	AGENTS_REFERENCE_TEMPLATE,
	getInstructionFiles,
	getPrimaryInstructionTemplateTarget,
	resolveInstructionTemplate,
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

const DEFAULT_SETTINGS_TEMPLATE = buildSettingsTomlTemplate();

/**
 * Resolve the global settings file path.
 * Uses ~/.config/rp1/settings.toml to match the canonical TOML settings path.
 */
function resolveGlobalSettingsPath(): string {
	return path.join(homedir(), ".config", "rp1", "settings.toml");
}

/**
 * Resolve the local settings file path.
 */
function resolveLocalSettingsPath(
	cwd: string,
	directoriesOverride?: InitDirectoryModel,
): string {
	const directories = directoriesOverride ?? resolveInitDirectoryModel(cwd);
	return path.join(directories.rp1Dir, "settings.toml");
}

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
	forceLocalProject: boolean;
	/**
	 * Resolved directory model for this init run. Populated at the end of the
	 * git-check step after any ancestor-project decision is made, so all
	 * downstream helpers operate on the same project root.
	 */
	directories: InitDirectoryModel | null;
	userChoices: {
		gitRootChoice?: "continue" | "exit";
		ancestorProjectChoice?: "use-existing" | "create-nested";
		reinitChoice?: ReinitChoice;
		gitignorePreset?: GitignorePreset;
		enabledHarnesses?: readonly string[];
	};
}

/**
 * Prompt request for user interaction.
 * When a step needs user input, it sets this in the context.
 */
export interface PromptRequest {
	readonly type:
		| "git-root"
		| "reinit"
		| "gitignore"
		| "ancestor-project"
		| "harness-selection";
	readonly resolve: (value: string) => void;
	/** Current working directory (for git-root and ancestor-project prompts) */
	readonly cwd?: string;
	/** Ancestor project root (for ancestor-project prompt) */
	readonly ancestorRoot?: string;
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
		forceLocalProject: false,
		directories: null,
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
			} else {
				// In a git repo - confirm this is the right project root
				if (gitResult.isAtRoot) {
					addAct("git-check", "At repository root", "info");
				} else {
					addAct(
						"git-check",
						`In subdirectory of ${gitResult.gitRoot}`,
						"info",
					);
				}

				const choice = state.userChoices.gitRootChoice;

				if (choice === undefined && !options.yes && onPromptRequest) {
					// Interactive mode and no choice yet - request prompt
					promptRequestedRef.current = true;
					onPromptRequest({
						type: "git-root",
						resolve: () => {},
						cwd: gitResult.currentDir,
					});
					return; // Step will be re-executed after user makes a choice
				}

				// Apply the choice (or default to continue)
				if (choice === "exit") {
					throw new Error(
						"Navigate to your project directory and run 'rp1 init' again.",
					);
				}
				// Default (continue): user confirmed this is the right directory
				addAct("git-check", "Project root confirmed", "success");
			}

			// Check if an ancestor directory has an rp1 project
			const ancestorInfo = detectAncestorProject(ctx.cwd);
			if (ancestorInfo.isAncestor && ancestorInfo.ancestorRoot) {
				// --force-nested bypasses the prompt entirely
				if (options.forceNested) {
					addAct(
						"git-check",
						`Ancestor project at ${ancestorInfo.ancestorRoot} (creating nested project via --force-nested)`,
						"info",
					);
					ctx.forceLocalProject = true;
				} else {
					const ancestorChoice = state.userChoices.ancestorProjectChoice;

					if (ancestorChoice === undefined && !options.yes && onPromptRequest) {
						promptRequestedRef.current = true;
						onPromptRequest({
							type: "ancestor-project",
							resolve: () => {},
							cwd: ctx.cwd,
							ancestorRoot: ancestorInfo.ancestorRoot,
						});
						return;
					}

					if (ancestorChoice === undefined && options.yes) {
						// Non-interactive default: use existing project. This is a
						// valid outcome, not a failure -- exit the wizard cleanly.
						promptRequestedRef.current = true;
						dispatch({
							type: "CANCEL_WIZARD",
							reason:
								`An rp1 project already exists at ${ancestorInfo.ancestorRoot}. ` +
								"Using existing project (non-interactive mode). " +
								"To create a nested project here instead, re-run with --force-nested.",
						});
						return;
					}

					if (ancestorChoice === "use-existing") {
						// User picked the valid "reuse ancestor" option -- this is a
						// successful early exit, not an error.
						promptRequestedRef.current = true;
						dispatch({
							type: "CANCEL_WIZARD",
							reason: `Using existing rp1 project at ${ancestorInfo.ancestorRoot}.`,
						});
						return;
					}

					// create-nested
					addAct(
						"git-check",
						`Creating nested project (ancestor at ${ancestorInfo.ancestorRoot})`,
						"info",
					);
					ctx.forceLocalProject = true;
				}
			}

			// Finalize the directory model for the rest of the wizard. All
			// downstream steps must use this instead of re-resolving from cwd,
			// which would climb back to an ancestor project.
			ctx.directories = chooseInitDirectoryModel(
				ctx.cwd,
				ctx.forceLocalProject,
			);
		},
		[
			dispatch,
			state.userChoices.gitRootChoice,
			state.userChoices.ancestorProjectChoice,
			options.yes,
			options.forceNested,
			onPromptRequest,
		],
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

			const reinitState = await detectReinitState(
				ctx.cwd,
				ctx.primaryTool,
				ctx.directories ?? undefined,
			);
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

				if (choice === undefined && options.yes) {
					// Non-interactive mode: default to "update" to refresh fenced content idempotently
					addAct(
						"reinit-check",
						"Non-interactive mode: refreshing rp1 configuration",
						"info",
					);
					dispatch({
						type: "SET_USER_CHOICE",
						key: "reinitChoice",
						value: "update",
					});
					return;
				}

				if (choice === undefined && onPromptRequest) {
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
			const directories =
				ctx.directories ??
				chooseInitDirectoryModel(ctx.cwd, ctx.forceLocalProject);
			ctx.directories = directories;

			let created = 0;

			if (!(await directoryExists(directories.rp1Dir))) {
				await fs.mkdir(directories.rp1Dir, { recursive: true });
				addAct(
					"directory-setup",
					`Created ${formatDirectoryForDisplay(ctx.cwd, directories.rp1Dir)}`,
					"success",
				);
				created++;
			}

			if (!(await directoryExists(directories.contextDir))) {
				await fs.mkdir(directories.contextDir, { recursive: true });
				addAct(
					"directory-setup",
					`Created ${formatDirectoryForDisplay(ctx.cwd, directories.contextDir)}`,
					"success",
				);
				created++;
			}

			if (!(await directoryExists(directories.workDir))) {
				await fs.mkdir(directories.workDir, { recursive: true });
				addAct(
					"directory-setup",
					`Created ${formatDirectoryForDisplay(ctx.cwd, directories.workDir)}`,
					"success",
				);
				created++;
			}

			await ensureProjectId(directories.projectRoot);
			addAct("directory-setup", "Project ID ensured", "success");

			if (created === 0) {
				addAct("directory-setup", "Directory structure exists", "success");
			}
		},
		[],
	);

	/**
	 * Execute the settings setup step.
	 * Creates global and local settings files with safe defaults.
	 */
	const executeSettingsSetup = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			// Create or merge global settings file
			const globalPath = resolveGlobalSettingsPath();
			const globalDir = path.dirname(globalPath);
			if (!(await fileExists(globalPath))) {
				await fs.mkdir(globalDir, { recursive: true });
				await writeFileContent(globalPath, DEFAULT_SETTINGS_TEMPLATE);
				addAct("settings-setup", "Created global settings file", "success");
			} else {
				addAct(
					"settings-setup",
					"Global settings file exists (user values preserved)",
					"info",
				);
			}

			// Create or merge local settings file
			const localPath = resolveLocalSettingsPath(
				ctx.cwd,
				ctx.directories ?? undefined,
			);
			if (!(await fileExists(localPath))) {
				await writeFileContent(localPath, DEFAULT_SETTINGS_TEMPLATE);
				addAct("settings-setup", "Created local settings file", "success");
			} else {
				addAct(
					"settings-setup",
					"Local settings file exists (user values preserved)",
					"info",
				);
			}
		},
		[],
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
				checkRp1Readiness(ctx.cwd, undefined, ctx.directories ?? undefined),
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
	 * Execute the harness-selection step.
	 * In interactive mode, requests a multi-select prompt. In non-interactive
	 * mode (--yes), auto-selects all stable harnesses.
	 */
	const executeHarnessSelection = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			if (
				!ctx.toolDetectionResult ||
				ctx.toolDetectionResult.detected.length === 0
			) {
				addAct("harness-selection", "Skipped (no tools detected)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "harness-selection",
					reason: "No AI tools detected",
				});
				return;
			}

			const items = buildHarnessItems(ctx.toolDetectionResult.detected);

			if (items.length === 0) {
				addAct("harness-selection", "Skipped (no enabled tools)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "harness-selection",
					reason: "No enabled tools",
				});
				return;
			}

			if (options.yes) {
				// Non-interactive: select all stable harnesses
				const stableIds = getStableDefaults(items);
				addAct(
					"harness-selection",
					`Auto-selected ${stableIds.length} stable harness${stableIds.length === 1 ? "" : "es"}`,
					"success",
				);
				writeHarnessSelection(stableIds);
				dispatch({
					type: "SET_USER_CHOICE",
					key: "enabledHarnesses",
					value: stableIds,
				});
				return;
			}

			// Interactive mode: check if choice already made (re-execution after prompt)
			const choice = state.userChoices.enabledHarnesses;
			if (choice !== undefined) {
				addAct(
					"harness-selection",
					`Selected ${choice.length} harness${choice.length === 1 ? "" : "es"}`,
					"success",
				);
				writeHarnessSelection([...choice]);
				return;
			}

			// Request multi-select prompt
			promptRequestedRef.current = true;
			onPromptRequest?.({
				type: "harness-selection",
				resolve: () => {},
			});
		},
		[
			dispatch,
			options.yes,
			state.userChoices.enabledHarnesses,
			onPromptRequest,
		],
	);

	/**
	 * Inject into a single instruction file, optionally overriding the template.
	 */
	const injectIntoSingleFile = useCallback(
		async (
			addAct: AddActivityFn,
			file: string,
			detectedTool: DetectedTool | null,
			templateOverride?: string,
		): Promise<void> => {
			const ctx = contextRef.current;
			const filePath = path.resolve(ctx.cwd, file);
			const exists = await fileExists(filePath);

			if (!exists) return;

			addAct("instruction-injection", `Configuring ${file}...`, "info");

			const existingContent = await readFileContent(filePath);
			if (existingContent === null) {
				throw new Error(`Failed to read file: ${filePath}`);
			}

			const validation = validateFencing(existingContent);
			if (!validation.valid) {
				throw new Error(`Invalid fencing in ${file}: ${validation.error}`);
			}

			const template =
				templateOverride ??
				resolveInstructionTemplate(file as "CLAUDE.md" | "AGENTS.md", {
					detectedTool,
					existingContent,
				});

			if (hasFencedContent(existingContent)) {
				const newContent = replaceFencedContent(
					existingContent,
					template,
					LATEST_FENCE_VERSION,
				);
				await writeFileContent(filePath, newContent);
				addAct("instruction-injection", `Updated ${file}`, "success");
			} else {
				const newContent = appendFencedContent(
					existingContent,
					template,
					LATEST_FENCE_VERSION,
				);
				await writeFileContent(filePath, newContent);
				addAct("instruction-injection", `Appended to ${file}`, "success");
			}
		},
		[],
	);

	/**
	 * Execute the instruction injection step.
	 *
	 * When both CLAUDE.md and AGENTS.md exist, the full stanza goes into
	 * AGENTS.md only and CLAUDE.md receives a single-line `@AGENTS.md`
	 * import reference inside its fence.
	 */
	const executeInstructionInjection = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			const claudePath = path.resolve(ctx.cwd, "CLAUDE.md");
			const agentsPath = path.resolve(ctx.cwd, "AGENTS.md");

			const claudeExists = await fileExists(claudePath);
			const agentsExists = await fileExists(agentsPath);

			// If neither exists, create the primary tool's file or default to CLAUDE.md
			if (!claudeExists && !agentsExists) {
				const { file: primaryFile, template } =
					getPrimaryInstructionTemplateTarget(ctx.primaryTool);
				const filePath = path.resolve(ctx.cwd, primaryFile);

				addAct("instruction-injection", `Creating ${primaryFile}...`, "info");
				const content = `${wrapWithFence(template, LATEST_FENCE_VERSION)}\n`;
				await writeFileContent(filePath, content);
				addAct("instruction-injection", `Created ${primaryFile}`, "success");
				return;
			}

			if (claudeExists && agentsExists) {
				await injectIntoSingleFile(addAct, "AGENTS.md", ctx.primaryTool);
				// Skip CLAUDE.md when it already imports AGENTS.md outside any rp1
				// fence — injecting the reference fence would duplicate the import.
				const claudeContent = (await readFileContent(claudePath)) ?? "";
				if (
					/^@AGENTS\.md\s*$/m.test(claudeContent) &&
					!hasFencedContent(claudeContent)
				) {
					addAct(
						"instruction-injection",
						"CLAUDE.md already references AGENTS.md; skipping",
						"info",
					);
				} else {
					await injectIntoSingleFile(
						addAct,
						"CLAUDE.md",
						ctx.primaryTool,
						AGENTS_REFERENCE_TEMPLATE,
					);
				}
				return;
			}

			for (const file of getInstructionFiles()) {
				await injectIntoSingleFile(addAct, file, ctx.primaryTool);
			}
		},
		[injectIntoSingleFile],
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

			const gitignoreContentResult = buildManagedGitignoreContent(
				ctx.cwd,
				preset,
			);
			if (E.isLeft(gitignoreContentResult)) {
				throw new Error(formatError(gitignoreContentResult.left, false));
			}
			const gitignoreContent = gitignoreContentResult.right;
			const exists = await fileExists(gitignorePath);

			if (!exists) {
				const content = `${wrapWithShellFence(gitignoreContent, LATEST_FENCE_VERSION)}\n`;
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
					LATEST_FENCE_VERSION,
				);
				await writeFileContent(gitignorePath, newContent);
				addAct("gitignore-config", "Updated .gitignore", "success");
			} else {
				const newContent = appendShellFencedContent(
					existingContent,
					gitignoreContent,
					LATEST_FENCE_VERSION,
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
	 * Execute the install check step.
	 * Checks plugin installation state and delegates to install if needed.
	 * Mirrors the install-check logic in executeInit().
	 */
	const executeInstallCheck = useCallback(
		async (addAct: AddActivityFn): Promise<void> => {
			const ctx = contextRef.current;

			if (
				!ctx.toolDetectionResult ||
				ctx.toolDetectionResult.detected.length === 0
			) {
				addAct("install-check", "Skipped (no tools detected)", "info");
				dispatch({
					type: "SKIP_STEP",
					stepId: "install-check",
					reason: "No AI tools detected",
				});
				return;
			}

			if (!ctx.registry) {
				throw new Error("Registry not loaded");
			}

			addAct("install-check", "Checking plugin installation...", "info");

			const installStatus = await checkPluginsInstalled(ctx.registry);

			if (installStatus.installed) {
				addAct(
					"install-check",
					"Plugins already installed, skipping install step",
					"success",
				);
			} else {
				addAct(
					"install-check",
					"Plugins missing on detected platforms, installing...",
					"info",
				);

				const minimalLogger: Logger = {
					trace: () => {},
					debug: () => {},
					info: (msg: string) => addAct("install-check", msg, "info"),
					warn: (msg: string) => addAct("install-check", msg, "warning"),
					error: (msg: string) => addAct("install-check", msg, "error"),
					start: () => {},
					success: (msg: string) => addAct("install-check", msg, "success"),
					fail: (msg: string) => addAct("install-check", msg, "error"),
					box: () => {},
				};

				const installCtx: InstallContext = {
					logger: minimalLogger,
					isTTY: false,
					dryRun: false,
					skipPrompt: true,
				};

				try {
					const installResultEither = await installAllDetectedTools(
						ctx.registry,
						installCtx,
					)();

					if (E.isRight(installResultEither)) {
						const installResult = installResultEither.right;
						for (const result of installResult.results) {
							if (result.success) {
								addAct(
									"install-check",
									`Installed plugins for ${result.toolName}`,
									"success",
								);
							} else if (result.skipped) {
								addAct(
									"install-check",
									result.warnings.join(" ") || `Skipped ${result.toolName}`,
									"warning",
								);
							} else {
								const errorMsg = result.error
									? "message" in result.error
										? (result.error as { message: string }).message
										: String(result.error)
									: "Unknown error";
								addAct(
									"install-check",
									`Installation failed for ${result.toolName}: ${errorMsg}`,
									"warning",
								);
								dispatch({
									type: "SET_PLUGIN_INSTALL_ERROR",
									error: `Installation failed for ${result.toolName}: ${errorMsg}`,
								});
							}
						}
					} else {
						const errorMessage =
							"message" in installResultEither.left
								? (installResultEither.left as { message: string }).message
								: String(installResultEither.left);
						addAct(
							"install-check",
							`Plugin installation failed: ${errorMessage}`,
							"warning",
						);
						dispatch({
							type: "SET_PLUGIN_INSTALL_ERROR",
							error: errorMessage,
						});
					}
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					addAct("install-check", `Install error: ${errorMessage}`, "warning");
					dispatch({
						type: "SET_PLUGIN_INSTALL_ERROR",
						error: errorMessage,
					});
				}
			}

			// Run verification to collect plugin status for health check
			const allPluginStatus: PluginStatus[] = [];
			try {
				for (const detected of ctx.toolDetectionResult.detected) {
					// Skip disabled tools
					if (detected.tool.enabled === false) {
						continue;
					}

					let verificationResult: {
						verified: boolean;
						plugins: readonly PluginStatus[];
						issues: readonly string[];
					} | null = null;

					if (detected.tool.id === "claude-code") {
						verificationResult = await verifyClaudeCodePlugins();
					} else if (detected.tool.id === "opencode") {
						verificationResult = await verifyOpenCodePlugins();
					} else if (detected.tool.id === "copilot") {
						verificationResult = await verifyCopilotPlugins();
					}

					if (verificationResult) {
						allPluginStatus.push(...verificationResult.plugins);
						if (verificationResult.verified) {
							addAct(
								"install-check",
								`${detected.tool.name} plugins verified`,
								"success",
							);
						} else {
							for (const issue of verificationResult.issues) {
								addAct("install-check", issue, "warning");
							}
						}
					}
				}
			} catch (error) {
				const errorMessage =
					error instanceof Error ? error.message : String(error);
				addAct(
					"install-check",
					`Verification error: ${errorMessage}`,
					"warning",
				);
			}

			ctx.pluginStatus = allPluginStatus;
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
				undefined,
				ctx.directories ?? undefined,
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
					case "settings-setup":
						await executeSettingsSetup(addAct);
						break;
					case "tool-detection":
						await executeToolDetection(addAct);
						break;
					case "harness-selection":
						await executeHarnessSelection(addAct);
						break;
					case "instruction-injection":
						await executeInstructionInjection(addAct);
						break;
					case "gitignore-config":
						await executeGitignoreConfig(addAct);
						break;
					case "install-check":
						await executeInstallCheck(addAct);
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
			executeSettingsSetup,
			executeToolDetection,
			executeHarnessSelection,
			executeInstructionInjection,
			executeGitignoreConfig,
			executeInstallCheck,
			executeHealthCheck,
			executeSummary,
		],
	);

	return executeStep;
};

function formatDirectoryForDisplay(cwd: string, directoryPath: string): string {
	const relativePath = path.relative(cwd, directoryPath);
	if (
		relativePath !== "" &&
		!relativePath.startsWith("..") &&
		!path.isAbsolute(relativePath)
	) {
		return `${relativePath.replaceAll("\\", "/")}/`;
	}

	return `${directoryPath.replaceAll("\\", "/")}/`;
}
