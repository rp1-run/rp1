/**
 * Main init executor for the rp1 init command.
 * Orchestrates all initialization steps with TTY-aware interactivity.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, runtimeError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { ensureProjectId } from "../../shared/project-id.js";
import { type PromptOptions, selectOption } from "../../shared/prompts.js";
import {
	loadToolsRegistry,
	type ToolsRegistry,
} from "../config/supported-tools.js";
import { loadEnabledHarnesses } from "../settings/loader.js";
import {
	type InstallContext,
	installAllDetectedTools,
} from "../shared/install-core.js";
import {
	type ContextDetectionResult,
	detectProjectContext,
} from "./context-detector.js";
import {
	chooseInitDirectoryModel,
	detectAncestorProject,
	detectReinitState as detectSharedReinitState,
	type InitDirectoryModel,
} from "./directory-model.js";
import { detectGitRoot, type GitRootResult } from "./git-root.js";
import type {
	HealthReport,
	InitAction,
	InitOptions,
	InitResult,
	NextStep,
	PluginStatus,
	ProjectContext,
	ReinitChoice,
	ReinitState,
} from "./models.js";
import { createProgress, type InitProgress } from "./progress.js";
import {
	buildHarnessItems,
	getStableDefaults,
	writeHarnessSelection,
} from "./steps/harness-selection.js";
import { performHealthCheck } from "./steps/health-check.js";
import { checkPluginsInstalled } from "./steps/plugin-installation.js";
import {
	configureGitignore,
	createMinimalProjectStructure,
	createSettingsFiles,
	createStorageDirectories,
	injectInstructionsForStorageMode,
} from "./steps/project-setup.js";
import { checkRp1Readiness } from "./steps/readiness.js";
import { generateSandboxGrants } from "./steps/sandbox-grants.js";
import { displaySummary, generateNextSteps } from "./steps/summary.js";
import {
	verifyClaudeCodePlugins,
	verifyCopilotPlugins,
	verifyOpenCodePlugins,
} from "./steps/verification.js";
import {
	type DetectedTool,
	detectTools,
	formatDetectedTool,
	getOutdatedTools,
	getPrimaryTool,
	hasDetectedTools,
	type ToolDetectionResult,
} from "./tool-detector.js";

export type {
	GitignorePreset,
	InitAction,
	InitOptions,
	InitResult,
	ReinitChoice,
	ReinitState,
} from "./models.js";
export { GITIGNORE_PRESETS } from "./models.js";

/**
 * Context for the init execution.
 */
export interface InitContext {
	/** Current working directory */
	readonly cwd: string;
	/** Whether we're in interactive mode */
	readonly isTTY: boolean;
	/** The tools registry */
	readonly registry: ToolsRegistry;
	/** Logger instance */
	readonly logger: Logger;
}

/**
 * Step definitions for progress tracking.
 * Used to register steps with InitProgress.
 */
const INIT_STEPS = [
	{ name: "registry", description: "Loading tools registry..." },
	{ name: "git-check", description: "Checking git repository..." },
	{ name: "reinit-check", description: "Checking existing setup..." },
	{ name: "tool-detection", description: "Detecting agentic tools..." },
	{ name: "install-check", description: "Checking plugin installation..." },
	{ name: "directory-setup", description: "Setting up directory structure..." },
	{ name: "settings-setup", description: "Creating settings files..." },
	{
		name: "sandbox-grants",
		description: "Configuring sandbox grants...",
	},
	{
		name: "instruction-injection",
		description: "Configuring instruction file...",
	},
	{ name: "gitignore-config", description: "Configuring .gitignore..." },
	{ name: "health-check", description: "Performing health check..." },
	{ name: "summary", description: "Generating summary..." },
] as const;

/**
 * Detect whether interactive mode should be used.
 *
 * Default behaviors in non-interactive mode (--yes):
 * - Plugin installation: Automatically proceeds if AI tool (Claude Code) is detected
 * - Git root prompt: Defaults to continue in current directory
 * - Re-initialization: Defaults to update (refreshes fenced content idempotently)
 * - Gitignore preset: Uses "recommended" preset
 * - All prompts: Use sensible defaults without user interaction
 *
 * @param options - Init options from CLI
 * @returns true if interactive mode should be used, false otherwise
 */
function detectTTY(options: InitOptions): boolean {
	if (options.yes) {
		return false;
	}
	if (options.interactive) {
		return true;
	}
	return process.stdout.isTTY ?? false;
}

type GitRootChoice = "continue" | "exit";

async function handleGitRootCheck(
	gitResult: GitRootResult,
	promptOptions: PromptOptions,
	logger: Logger,
	progress: InitProgress,
): Promise<{ proceed: boolean; cwd: string; warning?: string }> {
	if (!gitResult.isGitRepo) {
		progress.pauseStep();
		const warning =
			"Not in a git repository. Git-related features will be limited.";
		logger.warn(warning);
		return { proceed: true, cwd: gitResult.currentDir, warning };
	}

	// Always confirm with user - they might be at a monorepo root by mistake
	progress.pauseStep();

	const choice = await selectOption<GitRootChoice>(
		`Initialize rp1 in ${gitResult.currentDir}?`,
		[
			{
				value: "continue",
				name: "Yes, initialize here",
				description: "This is my project root, continue with setup",
			},
			{
				value: "exit",
				name: "No, let me navigate first",
				description: "Exit to cd into my project (e.g., for monorepo setups)",
			},
		],
		promptOptions,
	);

	if (choice === null) {
		// Non-interactive default: continue in current directory
		return { proceed: true, cwd: gitResult.currentDir };
	}

	switch (choice) {
		case "continue":
			return { proceed: true, cwd: gitResult.currentDir };
		case "exit":
			logger.info(
				"Initialization cancelled. Navigate to your target project directory and run 'rp1 init' again.",
			);
			return { proceed: false, cwd: gitResult.currentDir };
	}
}

type AncestorProjectChoice = "use-existing" | "create-nested";

/**
 * Handle the case where an ancestor directory already has an rp1 project.
 * Prompts the user to choose between using the existing project or creating a nested one.
 *
 * Non-interactive default: Uses existing project. The user can override with --force-nested.
 */
async function handleAncestorProjectCheck(
	cwd: string,
	ancestorRoot: string,
	options: InitOptions,
	promptOptions: PromptOptions,
	logger: Logger,
	progress: InitProgress,
): Promise<{ proceed: boolean; forceLocal: boolean }> {
	// --force-nested bypasses the prompt entirely
	if (options.forceNested) {
		logger.info(
			`Ancestor rp1 project found at ${ancestorRoot}. Creating nested project here (--force-nested).`,
		);
		return { proceed: true, forceLocal: true };
	}

	// Non-interactive mode: default to using the existing project
	if (!promptOptions.isTTY) {
		logger.info(
			`Ancestor rp1 project found at ${ancestorRoot}. Using existing project (non-interactive mode).`,
		);
		logger.info(
			"To create a nested project here instead, re-run with --force-nested.",
		);
		return { proceed: false, forceLocal: false };
	}

	// Interactive mode: prompt the user
	progress.pauseStep();

	const choice = await selectOption<AncestorProjectChoice>(
		`An rp1 project already exists at ${ancestorRoot}. What would you like to do?`,
		[
			{
				value: "use-existing",
				name: "Use existing project",
				description: `Keep using the rp1 project at ${ancestorRoot}`,
			},
			{
				value: "create-nested",
				name: "Create nested project here",
				description: `Initialize a new rp1 project in ${cwd}`,
			},
		],
		promptOptions,
	);

	if (choice === null) {
		// Prompt cancelled or non-interactive fallback
		return { proceed: false, forceLocal: false };
	}

	if (choice === "use-existing") {
		logger.info(`Using existing rp1 project at ${ancestorRoot}.`);
		return { proceed: false, forceLocal: false };
	}

	// create-nested
	return { proceed: true, forceLocal: true };
}

/**
 * Detect re-initialization state by checking for existing rp1 artifacts.
 * Exported for testing purposes.
 */
export async function detectReinitState(
	cwd: string,
	detectedToolInstructionFile: string | null,
	directories?: InitDirectoryModel,
): Promise<ReinitState> {
	return detectSharedReinitState(
		cwd,
		{
			tool: {
				instruction_file: detectedToolInstructionFile,
			},
		} as DetectedTool | null,
		directories,
	);
}

/**
 * Check if re-initialization is needed and prompt user for action.
 *
 * Non-interactive default: Returns true if either .rp1/ directory exists
 * or instruction file has fenced content, triggering re-init prompt logic.
 */
function isAlreadyInitialized(state: ReinitState): boolean {
	return state.hasRp1Dir || state.hasFencedContent;
}

/**
 * Handle re-initialization check with user prompt.
 *
 * Non-interactive default: Proceeds with "update" mode to refresh fenced content
 * idempotently. This ensures `rp1 init --yes` always brings configuration up to
 * date, which is safe because all setup operations are idempotent.
 */
async function handleReinitCheck(
	state: ReinitState,
	promptOptions: PromptOptions,
	logger: Logger,
	progress: InitProgress,
): Promise<{ proceed: boolean; choice: ReinitChoice }> {
	if (!isAlreadyInitialized(state)) {
		return { proceed: true, choice: "reinitialize" };
	}

	progress.pauseStep();

	logger.info("Existing rp1 configuration detected:");
	if (state.hasRp1Dir) {
		logger.info("  - .rp1/ directory exists");
	}
	if (state.hasFencedContent) {
		logger.info("  - Instruction file has rp1 content");
	}
	if (state.hasKBContent) {
		logger.info("  - Knowledge base content exists");
	}
	if (state.hasWorkContent) {
		logger.info("  - Work artifacts exist");
	}

	if (!promptOptions.isTTY) {
		logger.info("Non-interactive mode: Refreshing rp1 configuration");
		return { proceed: true, choice: "update" };
	}

	const choice = await selectOption<ReinitChoice>(
		"rp1 is already initialized. What would you like to do?",
		[
			{
				value: "update",
				name: "Update configuration",
				description: "Refresh rp1 instructions (preserves KB and work data)",
			},
			{
				value: "skip",
				name: "Skip (keep existing)",
				description: "Exit without making changes",
			},
			{
				value: "reinitialize",
				name: "Reinitialize",
				description: "Re-run full initialization (preserves KB and work data)",
			},
		],
		promptOptions,
	);

	if (choice === null) {
		return { proceed: false, choice: "skip" };
	}

	if (choice === "skip") {
		logger.success("Keeping existing configuration");
		return { proceed: false, choice: "skip" };
	}

	if (choice === "reinitialize") {
		logger.warn("Re-initializing rp1 configuration");
		logger.info("Note: KB content and work artifacts will be preserved");
	}

	return { proceed: true, choice };
}

/**
 * Process tool detection results and display appropriate feedback.
 * This function handles the user-facing aspects of tool detection:
 * logging detected tools, prompting for installation guidance, etc.
 *
 * @param toolResult - Pre-fetched tool detection result from parallel execution
 * @param registry - Tools registry for installation guidance
 * @param promptOptions - TTY options for interactive prompts
 * @param logger - Logger instance
 * @param progress - Progress tracker for pausing spinner during prompts
 * @returns Object containing the tool result and any warnings generated
 */
async function processToolDetectionResult(
	toolResult: ToolDetectionResult,
	registry: ToolsRegistry,
	promptOptions: PromptOptions,
	logger: Logger,
	progress: InitProgress,
): Promise<{
	toolResult: ToolDetectionResult;
	warnings: string[];
}> {
	const warnings: string[] = [];

	if (hasDetectedTools(toolResult)) {
		for (const detected of toolResult.detected) {
			logger.success(formatDetectedTool(detected));
		}

		const outdated = getOutdatedTools(toolResult);
		for (const tool of outdated) {
			const warning = `${tool.tool.name} version ${tool.version} is below minimum ${tool.tool.min_version}`;
			logger.warn(warning);
			warnings.push(warning);
		}
	} else {
		progress.pauseStep();
		logger.warn("No supported agentic tools detected");

		const toolChoices = registry.tools.map((tool) => ({
			value: tool.id,
			name: tool.name,
			description: tool.install_url,
		}));
		toolChoices.push({
			value: "skip",
			name: "Skip",
			description: "Continue without installing a tool",
		});

		const choice = await selectOption(
			"Would you like installation instructions for a tool?",
			toolChoices,
			promptOptions,
		);

		if (choice && choice !== "skip") {
			const selectedTool = registry.tools.find((t) => t.id === choice);
			if (selectedTool) {
				logger.box(
					`Install ${selectedTool.name}:\n\n${selectedTool.install_url}`,
				);
			}
		}

		if (!promptOptions.isTTY) {
			logger.info("Supported tools:");
			for (const tool of registry.tools) {
				logger.info(`  ${tool.name}: ${tool.install_url}`);
			}
		}

		warnings.push(
			"No agentic tool detected. Install Claude Code or OpenCode for full functionality.",
		);
	}

	return { toolResult, warnings };
}

/**
 * Execute the full initialization workflow.
 *
 * Orchestrates all steps:
 * 1. TTY detection
 * 2. Load tools registry
 * 3. Git root detection and handling
 * 4. Re-initialization detection and handling
 * 5. Tool detection
 * 6. Plugin install check and delegation
 * 7. Directory structure creation (project setup)
 * 8. Settings files (project setup)
 * 9. Instruction file injection (project setup)
 * 10. Gitignore configuration (project setup)
 * 11. Health check
 * 12. Summary display
 *
 * @param options - Init options from CLI
 * @param logger - Logger instance
 * @returns TaskEither with InitResult on success or CLIError on failure
 */
export function executeInit(
	options: InitOptions,
	logger: Logger,
): TE.TaskEither<CLIError, InitResult> {
	return pipe(
		TE.tryCatch(
			async (): Promise<InitResult> => {
				const allActions: InitAction[] = [];
				const allWarnings: string[] = [];

				const isTTY = detectTTY(options);
				const promptOptions: PromptOptions = { isTTY };
				logger.debug(`Interactive mode: ${isTTY}`);

				const progress = createProgress(isTTY);
				progress.registerSteps([...INIT_STEPS]);

				progress.startStep("registry");
				logger.debug("Loading tools registry...");
				const registry = await loadToolsRegistry();
				progress.completeStep();

				progress.startStep("git-check");
				const initialCwd = options.cwd || process.cwd();
				const gitResultEither = await detectGitRoot(initialCwd)();
				const gitResult = E.isRight(gitResultEither)
					? gitResultEither.right
					: {
							isGitRepo: false,
							gitRoot: null,
							currentDir: initialCwd,
							isAtRoot: false,
						};

				const gitCheck = await handleGitRootCheck(
					gitResult,
					promptOptions,
					logger,
					progress,
				);
				progress.completeStep();

				if (!gitCheck.proceed) {
					return {
						actions: [{ type: "skipped", reason: "User cancelled" }],
						detectedTool: null,
						warnings: [],
						healthReport: null,
						nextSteps: [],
					};
				}

				let cwd = gitCheck.cwd;
				let forceLocalProject = false;
				if (gitCheck.warning) {
					allWarnings.push(gitCheck.warning);
				}

				// Check if an ancestor directory has an rp1 project
				const ancestorInfo = detectAncestorProject(cwd);
				if (ancestorInfo.isAncestor && ancestorInfo.ancestorRoot) {
					const ancestorCheck = await handleAncestorProjectCheck(
						cwd,
						ancestorInfo.ancestorRoot,
						options,
						promptOptions,
						logger,
						progress,
					);

					if (!ancestorCheck.proceed) {
						return {
							actions: [
								{
									type: "skipped",
									reason: `Using existing rp1 project at ${ancestorInfo.ancestorRoot}`,
								},
							],
							detectedTool: null,
							warnings: [],
							healthReport: null,
							nextSteps: [],
						};
					}

					forceLocalProject = ancestorCheck.forceLocal;
				}

				// If user chose to create a nested project, override cwd resolution
				// so the rest of init operates on the local directory
				if (forceLocalProject) {
					cwd = gitCheck.cwd;
				}

				// Resolve directories once, respecting forceLocalProject, and pass
				// this through to every downstream helper so they don't re-resolve
				// (and accidentally climb back to an ancestor project).
				const directories = chooseInitDirectoryModel(cwd, forceLocalProject);

				const contextResultEither = await detectProjectContext(cwd)();
				const contextResult: ContextDetectionResult = E.isRight(
					contextResultEither,
				)
					? contextResultEither.right
					: {
							context: "brownfield" as ProjectContext,
							gitResult,
							hasSourceFiles: false,
							reasoning: "Context detection failed, defaulting to brownfield",
						};
				const projectContext = contextResult.context;
				logger.debug(
					`Project context: ${projectContext} (${contextResult.reasoning})`,
				);

				progress.startStep("reinit-check");
				const reinitState = await detectReinitState(cwd, null, directories);
				const reinitCheck = await handleReinitCheck(
					reinitState,
					promptOptions,
					logger,
					progress,
				);
				progress.completeStep();

				if (!reinitCheck.proceed) {
					return {
						actions: [
							{
								type: "skipped",
								reason: "Re-initialization skipped by user",
							},
						],
						detectedTool: null,
						warnings: [],
						healthReport: null,
						nextSteps: [],
					};
				}

				const isUpdateOnly = reinitCheck.choice === "update";

				// --- Tool detection ---
				progress.startStep("tool-detection");

				const [toolResultEither, readinessResult] = await Promise.all([
					detectTools(registry)(),
					checkRp1Readiness(cwd, undefined, directories),
				]);

				const toolDetectionResult = E.isRight(toolResultEither)
					? toolResultEither.right
					: { detected: [], missing: [...registry.tools] };

				const { warnings: toolWarnings } = await processToolDetectionResult(
					toolDetectionResult,
					registry,
					promptOptions,
					logger,
					progress,
				);
				allWarnings.push(...toolWarnings);
				const primaryTool = getPrimaryTool(toolDetectionResult);
				progress.completeStep();

				const harnessItems = buildHarnessItems(toolDetectionResult.detected);
				const stableIds = getStableDefaults(harnessItems);
				const persisted = loadEnabledHarnesses(options.globalSettingsPath);
				const selection = persisted ?? stableIds;
				if (persisted === undefined) {
					writeHarnessSelection(stableIds, options.globalSettingsPath);
				}

				// --- Install check and delegation ---
				progress.startStep("install-check");
				let pluginStatus: readonly PluginStatus[] = [];

				if (toolDetectionResult.detected.length > 0) {
					const installStatus = await checkPluginsInstalled(registry);

					if (installStatus.installed) {
						logger.success("Plugins already installed, skipping install step");
						allActions.push({
							type: "skipped",
							reason: "Plugins already installed on all detected platforms",
						});
						progress.completeStep();
					} else {
						logger.info("Plugins missing on detected platforms, installing...");
						const installCtx: InstallContext = {
							logger,
							isTTY,
							dryRun: false,
							skipPrompt: !isTTY,
						};

						try {
							const installResultEither = await installAllDetectedTools(
								registry,
								installCtx,
							)();

							if (E.isRight(installResultEither)) {
								const installResult = installResultEither.right;
								for (const result of installResult.results) {
									if (result.success) {
										for (const plugin of result.pluginsInstalled) {
											allActions.push({
												type: "plugin_installed",
												name: plugin,
												version: "latest",
											});
										}
										logger.success(`Installed plugins for ${result.toolName}`);
									} else if (result.skipped) {
										const reason =
											result.warnings.join(" ") || `Skipped ${result.toolName}`;
										allActions.push({
											type: "skipped",
											reason,
										});
										logger.warn(reason);
									} else {
										const errorMsg = result.error
											? "message" in result.error
												? (result.error as { message: string }).message
												: String(result.error)
											: "Unknown error";
										allActions.push({
											type: "plugin_install_failed",
											name: result.toolName,
											error: errorMsg,
										});
										logger.warn(
											`Plugin installation failed for ${result.toolName}: ${errorMsg}`,
										);
										allActions.push({
											type: "plugin_install_failed",
											name: result.toolId,
											error: errorMsg,
										});
										allWarnings.push(
											`Plugin installation failed for ${result.toolName}: ${errorMsg}`,
										);
									}
								}
								// Ensure at least one install-related action exists
								const hasInstallAction = allActions.some(
									(a) =>
										a.type === "plugin_installed" ||
										a.type === "plugin_install_failed",
								);
								if (!hasInstallAction) {
									allActions.push({
										type: "skipped",
										reason: "Plugin installation completed with no changes",
									});
								}
								progress.completeStep();
							} else {
								const errorMessage =
									"message" in installResultEither.left
										? (installResultEither.left as { message: string }).message
										: String(installResultEither.left);
								logger.warn(`Plugin installation failed: ${errorMessage}`);
								allActions.push({
									type: "plugin_install_failed",
									name: "rp1-plugins",
									error: errorMessage,
								});
								allWarnings.push(`Plugin installation failed: ${errorMessage}`);
								progress.failStep();
							}
						} catch (error) {
							const errorMessage =
								error instanceof Error ? error.message : String(error);
							logger.warn(`Plugin installation error: ${errorMessage}`);
							allActions.push({
								type: "plugin_install_failed",
								name: "rp1-plugins",
								error: errorMessage,
							});
							allWarnings.push(`Plugin installation failed: ${errorMessage}`);
							progress.failStep();
						}
					}

					// Run verification to collect plugin status for health check
					try {
						const allPluginStatus: PluginStatus[] = [];
						for (const detected of toolDetectionResult.detected) {
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
									allActions.push({
										type: "verification_passed",
										component: `${detected.tool.name} plugins`,
									});
								} else {
									for (const issue of verificationResult.issues) {
										allActions.push({
											type: "verification_failed",
											component: `${detected.tool.name} plugins`,
											issue,
										});
										logger.warn(`${detected.tool.name} verification: ${issue}`);
									}
								}
							}
						}
						pluginStatus = allPluginStatus;
					} catch (error) {
						const errorMessage =
							error instanceof Error ? error.message : String(error);
						logger.warn(`Verification error: ${errorMessage}`);
						allWarnings.push(`Plugin verification failed: ${errorMessage}`);
					}
				} else {
					allActions.push({
						type: "skipped",
						reason: "Plugin install check skipped (no tools detected)",
					});
					progress.skipStep();
				}

				// --- Project setup ---
				// Phase 1: Create minimal .rp1/ + project_id (required before
				// central path computation and settings.toml write)
				progress.startStep("directory-setup");
				const minimalDirActions = await createMinimalProjectStructure(
					cwd,
					logger,
					directories,
				);
				allActions.push(...minimalDirActions);
				const projectId = await ensureProjectId(directories.projectRoot);
				progress.completeStep();

				// Phase 2: Write settings.toml, then create storage directories
				// based on the resolved storage mode
				progress.startStep("settings-setup");
				const settingsActions = await createSettingsFiles(
					cwd,
					logger,
					directories,
				);
				allActions.push(...settingsActions);
				const storageDirActions = await createStorageDirectories(
					directories.projectRoot,
					projectId,
					logger,
				);
				allActions.push(...storageDirActions);
				progress.completeStep();

				// Phase 3: Generate sandbox grants for selected harnesses
				// so AI coding platforms can access the central store at ~/.rp1/
				progress.startStep("sandbox-grants");
				try {
					const grantResults = await generateSandboxGrants(
						[...selection],
						cwd,
						options.globalSettingsPath,
					);
					for (const grant of grantResults) {
						if (grant.written) {
							allActions.push({ type: "created_file", path: grant.path });
							logger.success(
								`Sandbox grant: ${grant.platform} → ${grant.path}`,
							);
						}
					}
					progress.completeStep();
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					logger.warn(`Sandbox grant error: ${errorMessage}`);
					allWarnings.push(`Sandbox grants failed: ${errorMessage}`);
					progress.failStep();
				}

				progress.startStep("instruction-injection");
				const instrResult = await injectInstructionsForStorageMode({
					cwd,
					projectRoot: directories.projectRoot,
					harnessSelection: selection,
					detectedTool: primaryTool || null,
					homeDir: options.homeDir,
					globalSettingsPath: options.globalSettingsPath,
					onProgress: (msg, type) => {
						if (type === "success") logger.success(msg);
						else if (type === "warning") logger.warn(msg);
						else logger.info(msg);
					},
				});
				allActions.push(...instrResult.actions);
				allWarnings.push(...instrResult.warnings);
				progress.completeStep();

				progress.startStep("gitignore-config");
				if (gitResult.isGitRepo) {
					const gitignoreActions = await configureGitignore(
						cwd,
						promptOptions,
						logger,
						progress,
						isUpdateOnly,
					);
					allActions.push(...gitignoreActions);
					progress.completeStep();
				} else {
					allActions.push({
						type: "skipped",
						reason: "Gitignore configuration skipped (not a git repository)",
					});
					progress.skipStep();
				}

				if (isUpdateOnly) {
					logger.success("rp1 configuration updated!");
				}

				// --- Health check ---
				progress.startStep("health-check");
				let healthReport: HealthReport | null = null;
				try {
					healthReport = await performHealthCheck(
						cwd,
						pluginStatus,
						readinessResult,
						undefined,
						directories,
					);

					if (healthReport.issues.length === 0) {
						allActions.push({ type: "health_check_passed" });
					} else {
						for (const issue of healthReport.issues) {
							allActions.push({
								type: "health_check_warning",
								message: issue,
							});
						}
					}
					progress.completeStep();
				} catch (error) {
					const errorMessage =
						error instanceof Error ? error.message : String(error);
					logger.warn(`Health check error: ${errorMessage}`);
					allWarnings.push(`Health check failed: ${errorMessage}`);
					progress.failStep();
				}

				// --- Summary ---
				progress.startStep("summary");

				const hasKBContent = reinitState.hasKBContent;
				const hasCharterContent = healthReport?.charterExists ?? false;
				const nextSteps: NextStep[] = generateNextSteps(
					healthReport,
					primaryTool || null,
					hasKBContent,
					hasCharterContent,
					projectContext,
				);

				displaySummary(
					allActions,
					healthReport,
					nextSteps,
					toolDetectionResult.detected,
					logger,
					isTTY,
				);
				progress.completeStep();

				return {
					actions: allActions,
					detectedTool: primaryTool || null,
					warnings: allWarnings,
					healthReport,
					nextSteps,
				};
			},
			(error): CLIError => {
				const message = error instanceof Error ? error.message : String(error);
				return runtimeError(message, error);
			},
		),
	);
}
