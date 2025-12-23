/**
 * Main init executor for the rp1 init command.
 * Orchestrates all initialization steps with TTY-aware interactivity.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, runtimeError } from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import {
	confirmAction,
	type PromptOptions,
	selectOption,
} from "../../shared/prompts.js";
import {
	loadToolsRegistry,
	type SupportedTool,
	type ToolsRegistry,
} from "../config/supported-tools.js";
import {
	appendFencedContent,
	hasFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
} from "./comment-fence.js";
import { detectGitRoot, type GitRootResult } from "./git-root.js";
import {
	appendShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
} from "./shell-fence.js";
import { AGENTS_TEMPLATE, CLAUDE_CODE_TEMPLATE } from "./templates/index.js";
import {
	type DetectedTool,
	detectTools,
	formatDetectedTool,
	getOutdatedTools,
	getPrimaryTool,
	hasDetectedTools,
	type ToolDetectionResult,
} from "./tool-detector.js";

// ============================================================================
// Types
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
 * An action taken during initialization.
 */
export type InitAction =
	| { readonly type: "created_directory"; readonly path: string }
	| { readonly type: "created_file"; readonly path: string }
	| { readonly type: "updated_file"; readonly path: string }
	| { readonly type: "skipped"; readonly reason: string }
	| { readonly type: "plugin_install_suggested"; readonly tool: string }
	| { readonly type: "kb_build_suggested" };

/**
 * Result of the initialization process.
 */
export interface InitResult {
	/** All actions taken during initialization */
	readonly actions: readonly InitAction[];
	/** The primary detected tool (if any) */
	readonly detectedTool: DetectedTool | null;
	/** Warnings generated during initialization */
	readonly warnings: readonly string[];
}

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

// ============================================================================
// Helper Functions
// ============================================================================

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

async function hasAnyFiles(dirPath: string): Promise<boolean> {
	try {
		const entries = await fs.readdir(dirPath, { withFileTypes: true });
		// Check for any files or non-empty subdirectories
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

function countLines(content: string): number {
	return content.split("\n").length;
}

/**
 * Get the template for a tool based on its instruction file.
 */
function getTemplateForTool(tool: SupportedTool): string {
	if (tool.instruction_file === "CLAUDE.md") {
		return CLAUDE_CODE_TEMPLATE;
	}
	return AGENTS_TEMPLATE;
}

// ============================================================================
// Step 1: TTY Detection
// ============================================================================

function detectTTY(options: InitOptions): boolean {
	// --yes forces non-interactive
	if (options.yes) {
		return false;
	}
	// --interactive forces interactive
	if (options.interactive) {
		return true;
	}
	// Default: check if stdout is a TTY
	return process.stdout.isTTY ?? false;
}

// ============================================================================
// Step 2: Git Root Detection
// ============================================================================

type GitRootChoice = "continue" | "switch" | "cancel";

async function handleGitRootCheck(
	gitResult: GitRootResult,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<{ proceed: boolean; cwd: string; warning?: string }> {
	// Not in a git repo - warn but allow proceeding
	if (!gitResult.isGitRepo) {
		const warning =
			"Not in a git repository. Git-related features will be limited.";
		logger.warn(warning);
		return { proceed: true, cwd: gitResult.currentDir, warning };
	}

	// At git root - proceed normally
	if (gitResult.isAtRoot) {
		logger.debug("At git repository root");
		return { proceed: true, cwd: gitResult.currentDir };
	}

	// In subdirectory - prompt for action
	logger.warn(`Not at git repository root`);
	logger.info(`Current directory: ${gitResult.currentDir}`);
	logger.info(`Git root: ${gitResult.gitRoot}`);

	const choice = await selectOption<GitRootChoice>(
		"You're in a subdirectory. What would you like to do?",
		[
			{
				value: "continue",
				name: "Continue here (monorepo setup)",
				description: "Initialize rp1 in the current subdirectory",
			},
			{
				value: "switch",
				name: "Switch to git root",
				description: `Initialize rp1 at ${gitResult.gitRoot}`,
			},
			{
				value: "cancel",
				name: "Cancel",
				description: "Abort initialization",
			},
		],
		promptOptions,
	);

	// Non-TTY mode defaults to continue with warning
	if (choice === null) {
		const warning = `Initializing in subdirectory: ${gitResult.currentDir}`;
		logger.warn(warning);
		return { proceed: true, cwd: gitResult.currentDir, warning };
	}

	switch (choice) {
		case "continue":
			return { proceed: true, cwd: gitResult.currentDir };
		case "switch":
			return { proceed: true, cwd: gitResult.gitRoot as string };
		case "cancel":
			return { proceed: false, cwd: gitResult.currentDir };
	}
}

// ============================================================================
// Step 3: Re-initialization Detection
// ============================================================================

/**
 * Detect re-initialization state by checking for existing rp1 artifacts.
 * Exported for testing purposes.
 */
export async function detectReinitState(
	cwd: string,
	detectedToolInstructionFile: string | null,
): Promise<ReinitState> {
	const rp1Root = process.env.RP1_ROOT || ".rp1";
	const rp1Dir = path.resolve(cwd, rp1Root);
	const contextDir = path.join(rp1Dir, "context");
	const workDir = path.join(rp1Dir, "work");

	// Check for .rp1/ directory
	const hasRp1Dir = await directoryExists(rp1Dir);

	// Check for fenced content in instruction file
	let hasFenced = false;
	if (detectedToolInstructionFile) {
		const instrPath = path.resolve(cwd, detectedToolInstructionFile);
		const content = await readFileContent(instrPath);
		if (content) {
			hasFenced = hasFencedContent(content);
		}
	} else {
		// Check both possible instruction files
		for (const file of ["CLAUDE.md", "AGENTS.md"]) {
			const instrPath = path.resolve(cwd, file);
			const content = await readFileContent(instrPath);
			if (content && hasFencedContent(content)) {
				hasFenced = true;
				break;
			}
		}
	}

	// Check for KB content
	const hasKB = await fileExists(path.join(contextDir, "index.md"));

	// Check for work content
	const hasWork = await hasAnyFiles(workDir);

	return {
		hasRp1Dir: hasRp1Dir,
		hasFencedContent: hasFenced,
		hasKBContent: hasKB,
		hasWorkContent: hasWork,
	};
}

/**
 * Check if re-initialization is needed and prompt user for action.
 */
function isAlreadyInitialized(state: ReinitState): boolean {
	return state.hasRp1Dir || state.hasFencedContent;
}

/**
 * Handle re-initialization check with user prompt.
 */
async function handleReinitCheck(
	state: ReinitState,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<{ proceed: boolean; choice: ReinitChoice }> {
	// Not initialized - proceed normally
	if (!isAlreadyInitialized(state)) {
		return { proceed: true, choice: "reinitialize" };
	}

	// Log what was found
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

	// Non-TTY mode: default to skip
	if (!promptOptions.isTTY) {
		logger.info("Non-interactive mode: Skipping re-initialization");
		return { proceed: false, choice: "skip" };
	}

	// Prompt for action
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

	// Handle null (shouldn't happen in TTY, but be defensive)
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

// ============================================================================
// Step 4: Directory Structure Creation
// ============================================================================

async function createDirectoryStructure(
	cwd: string,
	logger: Logger,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const rp1Root = process.env.RP1_ROOT || ".rp1";
	const rp1Dir = path.resolve(cwd, rp1Root);
	const contextDir = path.join(rp1Dir, "context");
	const workDir = path.join(rp1Dir, "work");

	// Create .rp1/
	if (!(await directoryExists(rp1Dir))) {
		await fs.mkdir(rp1Dir, { recursive: true });
		logger.info(`Created: ${rp1Dir}`);
		actions.push({ type: "created_directory", path: rp1Dir });
	}

	// Create .rp1/context/
	if (!(await directoryExists(contextDir))) {
		await fs.mkdir(contextDir, { recursive: true });
		logger.info(`Created: ${contextDir}`);
		actions.push({ type: "created_directory", path: contextDir });
	}

	// Create .rp1/work/
	if (!(await directoryExists(workDir))) {
		await fs.mkdir(workDir, { recursive: true });
		logger.info(`Created: ${workDir}`);
		actions.push({ type: "created_directory", path: workDir });
	}

	return actions;
}

// ============================================================================
// Step 4: Tool Detection
// ============================================================================

async function handleToolDetection(
	registry: ToolsRegistry,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<{
	toolResult: ToolDetectionResult;
	warnings: string[];
}> {
	const warnings: string[] = [];

	logger.start("Detecting agentic tools...");

	const toolResultEither = await detectTools(registry)();
	// detectTools never fails, so we can safely extract the value
	const toolResult = E.isRight(toolResultEither)
		? toolResultEither.right
		: { detected: [], missing: [...registry.tools] };

	if (hasDetectedTools(toolResult)) {
		// Report detected tools
		for (const detected of toolResult.detected) {
			logger.success(formatDetectedTool(detected));
		}

		// Check for outdated tools
		const outdated = getOutdatedTools(toolResult);
		for (const tool of outdated) {
			const warning = `${tool.tool.name} version ${tool.version} is below minimum ${tool.tool.min_version}`;
			logger.warn(warning);
			warnings.push(warning);
		}
	} else {
		// No tools found - offer guidance
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
			// Non-TTY mode: list all install URLs
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

// ============================================================================
// Step 5: Instruction File Injection
// ============================================================================

async function injectInstructions(
	cwd: string,
	detectedTool: DetectedTool | null,
	logger: Logger,
): Promise<{ actions: InitAction[]; instructionFile: string | null }> {
	const actions: InitAction[] = [];

	// Determine which instruction file to use
	let instructionFile: string;
	let template: string;

	if (detectedTool) {
		// Use detected tool's instruction file
		instructionFile = detectedTool.tool.instruction_file;
		template = getTemplateForTool(detectedTool.tool);
	} else {
		// Check if either file exists, prefer CLAUDE.md
		const claudePath = path.resolve(cwd, "CLAUDE.md");
		const agentsPath = path.resolve(cwd, "AGENTS.md");

		if (await fileExists(claudePath)) {
			instructionFile = "CLAUDE.md";
			template = CLAUDE_CODE_TEMPLATE;
		} else if (await fileExists(agentsPath)) {
			instructionFile = "AGENTS.md";
			template = AGENTS_TEMPLATE;
		} else {
			// Default to CLAUDE.md for new projects
			instructionFile = "CLAUDE.md";
			template = CLAUDE_CODE_TEMPLATE;
		}
	}

	const filePath = path.resolve(cwd, instructionFile);
	const linesInjected = countLines(template);
	logger.debug(`Target file: ${filePath}`);

	const exists = await fileExists(filePath);

	if (!exists) {
		// Create new file
		logger.info(`Creating: ${filePath}`);
		const content = `${wrapWithFence(template)}\n`;
		await writeFileContent(filePath, content);
		actions.push({ type: "created_file", path: filePath });
		logger.success(`Created ${instructionFile} with ${linesInjected} lines`);
		return { actions, instructionFile };
	}

	// File exists - update or append
	const existingContent = await readFileContent(filePath);
	if (existingContent === null) {
		throw new Error(`Failed to read file: ${filePath}`);
	}

	const validation = validateFencing(existingContent);
	if (!validation.valid) {
		throw new Error(`Invalid fencing in ${filePath}: ${validation.error}`);
	}

	if (hasFencedContent(existingContent)) {
		// Update existing fenced content
		logger.info(`Updating: ${filePath}`);
		const newContent = replaceFencedContent(existingContent, template);
		await writeFileContent(filePath, newContent);
		actions.push({ type: "updated_file", path: filePath });
		logger.success(`Updated ${instructionFile}`);
	} else {
		// Append new fenced content
		logger.info(`Appending to: ${filePath}`);
		const newContent = appendFencedContent(existingContent, template);
		await writeFileContent(filePath, newContent);
		actions.push({ type: "updated_file", path: filePath });
		logger.success(`Appended to ${instructionFile}`);
	}

	return { actions, instructionFile };
}

// ============================================================================
// Step 6: Gitignore Configuration
// ============================================================================

async function configureGitignore(
	cwd: string,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const gitignorePath = path.resolve(cwd, ".gitignore");

	// Determine preset to use
	let preset: GitignorePreset = "recommended";

	if (promptOptions.isTTY) {
		const choice = await selectOption<GitignorePreset>(
			"How should rp1 files be tracked in git?",
			[
				{
					value: "recommended",
					name: "Recommended: Track context, ignore work",
					description: "Share KB with team, keep work-in-progress local",
				},
				{
					value: "track_all",
					name: "Track everything except meta.json",
					description: "Share both KB and work artifacts with team",
				},
				{
					value: "ignore_all",
					name: "Ignore entire .rp1/ directory",
					description: "Keep all rp1 data local only",
				},
			],
			promptOptions,
		);

		if (choice) {
			preset = choice;
		}
	}

	const gitignoreContent = GITIGNORE_PRESETS[preset];
	const exists = await fileExists(gitignorePath);

	if (!exists) {
		// Create new .gitignore
		logger.info(`Creating: ${gitignorePath}`);
		const content = `# rp1:start\n${gitignoreContent}\n# rp1:end\n`;
		await writeFileContent(gitignorePath, content);
		actions.push({ type: "created_file", path: gitignorePath });
		logger.success("Created .gitignore with rp1 entries");
		return actions;
	}

	// File exists - update or append
	const existingContent = await readFileContent(gitignorePath);
	if (existingContent === null) {
		throw new Error(`Failed to read file: ${gitignorePath}`);
	}

	const validation = validateShellFencing(existingContent);
	if (!validation.valid) {
		throw new Error(`Invalid fencing in ${gitignorePath}: ${validation.error}`);
	}

	if (hasShellFencedContent(existingContent)) {
		// Update existing fenced content
		logger.info(`Updating .gitignore`);
		const newContent = replaceShellFencedContent(
			existingContent,
			gitignoreContent,
		);
		await writeFileContent(gitignorePath, newContent);
		actions.push({ type: "updated_file", path: gitignorePath });
		logger.success("Updated .gitignore rp1 entries");
	} else {
		// Append new fenced content
		logger.info(`Appending to .gitignore`);
		const newContent = appendShellFencedContent(
			existingContent,
			gitignoreContent,
		);
		await writeFileContent(gitignorePath, newContent);
		actions.push({ type: "updated_file", path: gitignorePath });
		logger.success("Added rp1 entries to .gitignore");
	}

	return actions;
}

// ============================================================================
// Step 7: Plugin Installation Offer
// ============================================================================

async function offerPluginInstallation(
	detectedTool: DetectedTool | null,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];

	if (!detectedTool) {
		return actions;
	}

	if (!promptOptions.isTTY) {
		// Non-TTY: skip plugin installation
		actions.push({
			type: "skipped",
			reason: "Plugin installation skipped in non-interactive mode",
		});
		return actions;
	}

	const confirmed = await confirmAction(
		`Install rp1 plugins for ${detectedTool.tool.name}?`,
		{ ...promptOptions, defaultOnNonTTY: false },
	);

	if (!confirmed) {
		actions.push({
			type: "skipped",
			reason: "Plugin installation declined by user",
		});
		return actions;
	}

	// Check if tool has a plugin install command
	if (detectedTool.tool.plugin_install_cmd) {
		const baseCmd = detectedTool.tool.plugin_install_cmd.replace(
			"{plugin}",
			"rp1-base",
		);
		const devCmd = detectedTool.tool.plugin_install_cmd.replace(
			"{plugin}",
			"rp1-dev",
		);

		logger.info(`To install plugins, run:`);
		logger.box(`${baseCmd}\n${devCmd}`);
	} else {
		// Tool uses config file approach (e.g., OpenCode)
		logger.info(`To install plugins for ${detectedTool.tool.name}:`);
		logger.box(
			`See: https://rp1.run/getting-started/installation/#${detectedTool.tool.id}`,
		);
	}

	actions.push({
		type: "plugin_install_suggested",
		tool: detectedTool.tool.id,
	});
	return actions;
}

// ============================================================================
// Step 8: Knowledge Build Offer
// ============================================================================

async function offerKnowledgeBuild(
	detectedTool: DetectedTool | null,
	promptOptions: PromptOptions,
	logger: Logger,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];

	if (!promptOptions.isTTY) {
		// Non-TTY: just show suggestion
		logger.info("Next step: Build knowledge base with /knowledge-build");
		actions.push({ type: "kb_build_suggested" });
		return actions;
	}

	const confirmed = await confirmAction(
		"Build knowledge base now? (takes 10-15 minutes)",
		{ ...promptOptions, defaultOnNonTTY: false },
	);

	if (!confirmed) {
		logger.info("You can build the knowledge base later with /knowledge-build");
		actions.push({
			type: "skipped",
			reason: "Knowledge build declined by user",
		});
		return actions;
	}

	// Provide command based on detected tool
	if (detectedTool) {
		const cmdPrefix =
			detectedTool.tool.id === "claude-code" ? "" : "/rp1-base/";
		logger.box(
			`Run in ${detectedTool.tool.name}:\n\n${cmdPrefix}knowledge-build`,
		);
	} else {
		logger.box("Run in your agentic tool:\n\n/knowledge-build");
	}

	actions.push({ type: "kb_build_suggested" });
	return actions;
}

// ============================================================================
// Main Executor
// ============================================================================

/**
 * Execute the full initialization workflow.
 *
 * Orchestrates all steps:
 * 1. TTY detection
 * 2. Load tools registry
 * 3. Git root detection and handling
 * 4. Re-initialization detection and handling
 * 5. Directory structure creation
 * 6. Tool detection
 * 7. Instruction file injection
 * 8. Gitignore configuration
 * 9. Plugin installation offer
 * 10. Knowledge build offer
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

				// Step 1: Determine TTY mode
				const isTTY = detectTTY(options);
				const promptOptions: PromptOptions = { isTTY };
				logger.debug(`Interactive mode: ${isTTY}`);

				// Step 2: Load registry
				logger.debug("Loading tools registry...");
				const registry = await loadToolsRegistry();

				// Step 3: Git root detection
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
				);

				if (!gitCheck.proceed) {
					return {
						actions: [{ type: "skipped", reason: "User cancelled" }],
						detectedTool: null,
						warnings: [],
					};
				}

				const cwd = gitCheck.cwd;
				if (gitCheck.warning) {
					allWarnings.push(gitCheck.warning);
				}

				// Step 4: Re-initialization detection
				// Check if rp1 is already initialized before creating anything
				const reinitState = await detectReinitState(cwd, null);
				const reinitCheck = await handleReinitCheck(
					reinitState,
					promptOptions,
					logger,
				);

				if (!reinitCheck.proceed) {
					// User chose to skip - exit successfully
					return {
						actions: [
							{
								type: "skipped",
								reason: "Re-initialization skipped by user",
							},
						],
						detectedTool: null,
						warnings: [],
					};
				}

				// For "update" choice, we only update instruction file and gitignore
				const isUpdateOnly = reinitCheck.choice === "update";

				// Step 5: Create directory structure (skip if update-only and dirs exist)
				if (!isUpdateOnly || !reinitState.hasRp1Dir) {
					logger.start("Setting up directory structure...");
					const dirActions = await createDirectoryStructure(cwd, logger);
					allActions.push(...dirActions);
				} else {
					allActions.push({
						type: "skipped",
						reason: "Directory structure already exists (update mode)",
					});
				}

				// Step 6: Tool detection
				const { toolResult, warnings: toolWarnings } =
					await handleToolDetection(registry, promptOptions, logger);
				allWarnings.push(...toolWarnings);

				const primaryTool = getPrimaryTool(toolResult);

				// Step 7: Instruction file injection
				logger.start("Configuring instruction file...");
				const { actions: instrActions } = await injectInstructions(
					cwd,
					primaryTool || null,
					logger,
				);
				allActions.push(...instrActions);

				// Step 8: Gitignore configuration
				if (gitResult.isGitRepo) {
					logger.start("Configuring .gitignore...");
					const gitignoreActions = await configureGitignore(
						cwd,
						promptOptions,
						logger,
					);
					allActions.push(...gitignoreActions);
				} else {
					allActions.push({
						type: "skipped",
						reason: "Gitignore configuration skipped (not a git repository)",
					});
				}

				// For update mode, skip plugin and KB offers since they've already been through init
				if (isUpdateOnly) {
					allActions.push({
						type: "skipped",
						reason: "Plugin and KB offers skipped (update mode)",
					});
					logger.success("rp1 configuration updated!");
					return {
						actions: allActions,
						detectedTool: primaryTool || null,
						warnings: allWarnings,
					};
				}

				// Step 9: Plugin installation offer
				const pluginActions = await offerPluginInstallation(
					primaryTool || null,
					promptOptions,
					logger,
				);
				allActions.push(...pluginActions);

				// Step 10: Knowledge build offer
				const kbActions = await offerKnowledgeBuild(
					primaryTool || null,
					promptOptions,
					logger,
				);
				allActions.push(...kbActions);

				// Final summary
				logger.success("rp1 initialization complete!");

				return {
					actions: allActions,
					detectedTool: primaryTool || null,
					warnings: allWarnings,
				};
			},
			(error): CLIError => {
				const message = error instanceof Error ? error.message : String(error);
				return runtimeError(message, error);
			},
		),
	);
}
