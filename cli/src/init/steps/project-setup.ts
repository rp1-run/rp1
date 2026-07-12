/**
 * Project setup step module for the rp1 init command.
 * Contains all project-level setup functions: directory structure,
 * settings files, instruction injection, and gitignore configuration.
 *
 * These functions are pure: they accept cwd, logger, and options as
 * parameters and return InitAction[]. No behavioral changes from
 * the original implementations in init/index.ts.
 */

import * as fs from "node:fs/promises";
import { homedir } from "node:os";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import type { PromptOptions } from "../../../shared/prompts.js";
import { selectOption } from "../../../shared/prompts.js";
import { readStorageMode } from "../../../shared/storage-mode.js";
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";
import {
	appendFencedContent,
	hasFencedContent,
	removeFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
} from "../comment-fence.js";
import {
	type InitDirectoryModel,
	resolveInitDirectoryModel,
	resolveStorageDirectoryPaths,
} from "../directory-model.js";
import { buildManagedGitignoreContent } from "../gitignore.js";
import {
	type GlobalStanzaResult,
	manageGlobalStanzas,
} from "../global-stanza-writer.js";
import type { GitignorePreset, InitAction } from "../models.js";
import type { InitProgress } from "../progress.js";
import {
	buildGlobalSettingsTomlTemplate,
	buildSettingsTomlTemplate,
} from "../settings-template.js";
import {
	appendShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
	wrapWithShellFence,
} from "../shell-fence.js";
import {
	AGENTS_REFERENCE_TEMPLATE,
	getInstructionFiles,
	getPrimaryInstructionTemplateTarget,
	resolveInstructionTemplate,
} from "../templates/index.js";
import type { DetectedTool } from "../tool-detector.js";

// ============================================================================
// File System Helpers
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

// ============================================================================
// Directory Structure
// ============================================================================

/**
 * Create the project-local .rp1/ directory structure used by init.
 */
export async function createDirectoryStructure(
	cwd: string,
	logger: Logger,
	directoriesOverride?: InitDirectoryModel,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const directories = directoriesOverride ?? resolveInitDirectoryModel(cwd);
	const { rp1Dir, contextDir, workDir } = directories;

	if (!(await directoryExists(rp1Dir))) {
		await fs.mkdir(rp1Dir, { recursive: true });
		logger.info(`Created: ${rp1Dir}`);
		actions.push({ type: "created_directory", path: rp1Dir });
	}

	if (!(await directoryExists(contextDir))) {
		await fs.mkdir(contextDir, { recursive: true });
		logger.info(`Created: ${contextDir}`);
		actions.push({ type: "created_directory", path: contextDir });
	}

	if (!(await directoryExists(workDir))) {
		await fs.mkdir(workDir, { recursive: true });
		logger.info(`Created: ${workDir}`);
		actions.push({ type: "created_directory", path: workDir });
	}

	return actions;
}

/**
 * Create only the minimal .rp1/ directory without context/ or work/ subdirs.
 * Used in the reordered init flow where project_id and settings.toml must
 * be established before storage directories can be computed.
 */
export async function createMinimalProjectStructure(
	cwd: string,
	logger: Logger,
	directoriesOverride?: InitDirectoryModel,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const directories = directoriesOverride ?? resolveInitDirectoryModel(cwd);
	const { rp1Dir } = directories;

	if (!(await directoryExists(rp1Dir))) {
		await fs.mkdir(rp1Dir, { recursive: true });
		logger.info(`Created: ${rp1Dir}`);
		actions.push({ type: "created_directory", path: rp1Dir });
	}

	return actions;
}

/**
 * Create storage directories (context + work) based on the resolved storage mode.
 * For central mode, creates dirs under ~/.rp1/projects/{projectId}/.
 * For local mode, creates dirs under {projectRoot}/.rp1/.
 *
 * Must be called after settings.toml is written and project_id exists,
 * because the storage mode is read from the project's settings.
 *
 * The logger is narrowed to `info` so non-Logger callers (the init wizard,
 * which reports through per-step activity callbacks) can share this logic.
 *
 * @param homeDir - Override home directory for test isolation
 */
export async function createStorageDirectories(
	projectRoot: string,
	projectId: string,
	logger: Pick<Logger, "info">,
	homeDir?: string,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const { contextDir, workDir } = resolveStorageDirectoryPaths(
		projectRoot,
		projectId,
		homeDir,
	);

	if (!(await directoryExists(contextDir))) {
		await fs.mkdir(contextDir, { recursive: true });
		logger.info(`Created: ${contextDir}`);
		actions.push({ type: "created_directory", path: contextDir });
	}

	if (!(await directoryExists(workDir))) {
		await fs.mkdir(workDir, { recursive: true });
		logger.info(`Created: ${workDir}`);
		actions.push({ type: "created_directory", path: workDir });
	}

	return actions;
}

// ============================================================================
// Settings Files
// ============================================================================

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
 * Create a settings file if missing.
 * Existing settings files are preserved verbatim.
 */
async function createOrUpdateSettingsFile(
	filePath: string,
	template: string,
): Promise<{ action: InitAction; isNew: boolean; addedFields: string[] }> {
	if (await fileExists(filePath)) {
		return {
			action: { type: "updated_file", path: filePath },
			isNew: false,
			addedFields: [],
		};
	}

	await writeFileContent(filePath, template);

	return {
		action: { type: "created_file", path: filePath },
		isNew: true,
		addedFields: [],
	};
}

/**
 * Create settings files in both global and local locations.
 * Creates missing settings files and preserves existing settings verbatim.
 */
export async function createSettingsFiles(
	cwd: string,
	logger: Logger,
	directoriesOverride?: InitDirectoryModel,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];

	logger.info(
		"Settings files can be safely re-initialized - existing values are preserved",
	);

	// Process global settings file
	const globalPath = resolveGlobalSettingsPath();
	const globalResult = await createOrUpdateSettingsFile(
		globalPath,
		buildGlobalSettingsTomlTemplate(),
	);
	actions.push(globalResult.action);

	if (globalResult.isNew) {
		logger.success(`Created global settings: ${globalPath}`);
	} else if (globalResult.addedFields.length > 0) {
		logger.success(
			`Updated global settings (added: ${globalResult.addedFields.join(", ")})`,
		);
	} else {
		logger.info("Global settings unchanged (already up to date)");
	}

	// Process local settings file
	const localPath = resolveLocalSettingsPath(cwd, directoriesOverride);
	const localResult = await createOrUpdateSettingsFile(
		localPath,
		buildSettingsTomlTemplate(),
	);
	actions.push(localResult.action);

	if (localResult.isNew) {
		logger.success(`Created local settings: ${localPath}`);
	} else if (localResult.addedFields.length > 0) {
		logger.success(
			`Updated local settings (added: ${localResult.addedFields.join(", ")})`,
		);
	} else {
		logger.info("Local settings unchanged (already up to date)");
	}

	return actions;
}

// ============================================================================
// Instruction Injection
// ============================================================================

/**
 * Detect whether content already contains an `@AGENTS.md` import reference.
 */
export function hasAgentsReference(content: string): boolean {
	return /^@AGENTS\.md\s*$/m.test(content);
}

/**
 * Inject rp1 KB instructions into a single instruction file.
 * When `templateOverride` is provided it replaces the auto-resolved template.
 */
async function injectIntoFile(
	cwd: string,
	file: string,
	detectedTool: DetectedTool | null,
	logger: Logger,
	templateOverride?: string,
): Promise<InitAction | null> {
	const filePath = path.resolve(cwd, file);
	const exists = await fileExists(filePath);

	if (!exists) {
		return null;
	}

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
		(file === "CLAUDE.md" || file === "AGENTS.md"
			? resolveInstructionTemplate(file, {
					detectedTool,
					existingContent,
				})
			: "");

	if (hasFencedContent(existingContent)) {
		logger.info(`Updating: ${filePath}`);
		const newContent = replaceFencedContent(
			existingContent,
			template,
			LATEST_FENCE_VERSION,
		);
		await writeFileContent(filePath, newContent);
		logger.success(`Updated ${file}`);
		return { type: "updated_file", path: filePath };
	}
	logger.info(`Appending to: ${filePath}`);
	const newContent = appendFencedContent(
		existingContent,
		template,
		LATEST_FENCE_VERSION,
	);
	await writeFileContent(filePath, newContent);
	logger.success(`Appended to ${file}`);
	return { type: "updated_file", path: filePath };
}

/**
 * Inject rp1 KB instructions into instruction files.
 *
 * When both CLAUDE.md and AGENTS.md exist, the full stanza goes into
 * AGENTS.md only and CLAUDE.md receives a single-line `@AGENTS.md`
 * import reference inside its fence. When only one file exists it
 * receives the full stanza. When neither exists the primary tool's
 * default file is created.
 */
export async function injectInstructions(
	cwd: string,
	detectedTool: DetectedTool | null,
	logger: Logger,
): Promise<{ actions: InitAction[]; instructionFile: string | null }> {
	const actions: InitAction[] = [];

	const claudePath = path.resolve(cwd, "CLAUDE.md");
	const agentsPath = path.resolve(cwd, "AGENTS.md");

	const claudeExists = await fileExists(claudePath);
	const agentsExists = await fileExists(agentsPath);

	// If neither exists, create the primary tool's file or default to CLAUDE.md
	if (!claudeExists && !agentsExists) {
		const { file: primaryFile, template } =
			getPrimaryInstructionTemplateTarget(detectedTool);
		const filePath = path.resolve(cwd, primaryFile);
		const linesInjected = countLines(template);

		logger.info(`Creating: ${filePath}`);
		const content = `${wrapWithFence(template, LATEST_FENCE_VERSION)}\n`;
		await writeFileContent(filePath, content);
		actions.push({ type: "created_file", path: filePath });
		logger.success(`Created ${primaryFile} with ${linesInjected} lines`);
		return { actions, instructionFile: primaryFile };
	}

	if (claudeExists && agentsExists) {
		const agentsAction = await injectIntoFile(
			cwd,
			"AGENTS.md",
			detectedTool,
			logger,
		);
		if (agentsAction) actions.push(agentsAction);

		// A CLAUDE.md that already imports AGENTS.md on its own (and carries no
		// rp1 fence to manage) needs nothing from us — injecting the reference
		// fence would make the import line appear twice.
		const claudeContent = await fs.readFile(claudePath, "utf-8");
		if (hasAgentsReference(claudeContent) && !hasFencedContent(claudeContent)) {
			logger.info("CLAUDE.md already references AGENTS.md; skipping");
		} else {
			const claudeAction = await injectIntoFile(
				cwd,
				"CLAUDE.md",
				detectedTool,
				logger,
				AGENTS_REFERENCE_TEMPLATE,
			);
			if (claudeAction) actions.push(claudeAction);
		}

		return { actions, instructionFile: "CLAUDE.md" };
	}

	let primaryFile: string | null = null;

	for (const file of getInstructionFiles()) {
		const action = await injectIntoFile(cwd, file, detectedTool, logger);
		if (action) {
			actions.push(action);
			if (!primaryFile) {
				primaryFile = file;
			}
		}
	}

	return { actions, instructionFile: primaryFile };
}

// ============================================================================
// Storage-Mode-Aware Instruction Injection
// ============================================================================

export interface InstructionInjectionOptions {
	readonly cwd: string;
	readonly projectRoot: string;
	readonly harnessSelection: readonly string[];
	readonly detectedTool: DetectedTool | null;
	readonly homeDir?: string;
	readonly globalSettingsPath?: string;
	readonly onProgress?: (
		message: string,
		type: "info" | "success" | "warning",
	) => void;
}

export interface InstructionInjectionResult {
	readonly actions: InitAction[];
	readonly stanzaResult: GlobalStanzaResult | null;
	readonly warnings: string[];
}

export async function injectInstructionsForStorageMode(
	options: InstructionInjectionOptions,
): Promise<InstructionInjectionResult> {
	const {
		cwd,
		projectRoot,
		harnessSelection,
		detectedTool,
		homeDir,
		globalSettingsPath,
		onProgress,
	} = options;

	const actions: InitAction[] = [];
	const warnings: string[] = [];
	const storageMode = readStorageMode(projectRoot, globalSettingsPath);

	if (storageMode === "central") {
		for (const file of ["CLAUDE.md", "AGENTS.md"] as const) {
			const filePath = path.resolve(cwd, file);
			try {
				const content = await readFileContent(filePath);
				if (content !== null && hasFencedContent(content)) {
					const cleaned = removeFencedContent(content);
					await writeFileContent(filePath, cleaned);
					actions.push({ type: "updated_file", path: filePath });
					onProgress?.(
						`Removed per-project rp1 stanza from ${file} (central mode)`,
						"info",
					);
				}
			} catch {
				// File does not exist
			}
		}

		const stanzaResult = await manageGlobalStanzas(harnessSelection, {
			homeDir,
		});

		for (const platform of stanzaResult.written) {
			const stanzaPath =
				stanzaResult.paths.get(platform) ?? `global stanza: ${platform}`;
			actions.push({
				type: "created_file",
				path: stanzaPath,
			});
			onProgress?.(`Wrote global stanza for ${platform}`, "success");
		}
		for (const platform of stanzaResult.updated) {
			const stanzaPath =
				stanzaResult.paths.get(platform) ?? `global stanza: ${platform}`;
			actions.push({
				type: "updated_file",
				path: stanzaPath,
			});
			onProgress?.(`Updated global stanza for ${platform}`, "success");
		}
		for (const platform of stanzaResult.removed) {
			onProgress?.(
				`Removed global stanza for deselected platform: ${platform}`,
				"info",
			);
		}
		for (const { platform, error } of stanzaResult.errors) {
			onProgress?.(`Global stanza error for ${platform}: ${error}`, "warning");
			warnings.push(`Global stanza write failed for ${platform}: ${error}`);
		}

		return { actions, stanzaResult, warnings };
	}

	const proxyLogger: Logger = {
		info: (msg: string) => onProgress?.(msg, "info"),
		success: (msg: string) => onProgress?.(msg, "success"),
		warn: (msg: string) => onProgress?.(msg, "warning"),
		fail: (msg: string) => onProgress?.(msg, "warning"),
		error: (msg: string) => onProgress?.(msg, "warning"),
		debug: () => {},
		trace: () => {},
		start: () => {},
		box: () => {},
	};
	const { actions: instrActions } = await injectInstructions(
		cwd,
		detectedTool,
		proxyLogger,
	);
	actions.push(...instrActions);

	return { actions, stanzaResult: null, warnings };
}

// ============================================================================
// Gitignore Configuration
// ============================================================================

/**
 * Configure .gitignore with rp1 entries using shell fence markers.
 */
export async function configureGitignore(
	cwd: string,
	promptOptions: PromptOptions,
	logger: Logger,
	progress: InitProgress,
	isUpdateOnly?: boolean,
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const gitignorePath = path.resolve(cwd, ".gitignore");

	let preset: GitignorePreset = "recommended";

	// Skip prompt in update mode - use default preset for streamlined experience
	if (promptOptions.isTTY && !isUpdateOnly) {
		progress.pauseStep();
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

	const gitignoreContentResult = buildManagedGitignoreContent(cwd, preset);
	if (E.isLeft(gitignoreContentResult)) {
		throw new Error(formatError(gitignoreContentResult.left, false));
	}
	const gitignoreContent = gitignoreContentResult.right;
	const exists = await fileExists(gitignorePath);

	if (!exists) {
		logger.info(`Creating: ${gitignorePath}`);
		const content = `${wrapWithShellFence(gitignoreContent, LATEST_FENCE_VERSION)}\n`;
		await writeFileContent(gitignorePath, content);
		actions.push({ type: "created_file", path: gitignorePath });
		logger.success("Created .gitignore with rp1 entries");
		return actions;
	}

	const existingContent = await readFileContent(gitignorePath);
	if (existingContent === null) {
		throw new Error(`Failed to read file: ${gitignorePath}`);
	}

	const validation = validateShellFencing(existingContent);
	if (!validation.valid) {
		throw new Error(`Invalid fencing in ${gitignorePath}: ${validation.error}`);
	}

	if (hasShellFencedContent(existingContent)) {
		logger.info("Updating .gitignore");
		const newContent = replaceShellFencedContent(
			existingContent,
			gitignoreContent,
			LATEST_FENCE_VERSION,
		);
		await writeFileContent(gitignorePath, newContent);
		actions.push({ type: "updated_file", path: gitignorePath });
		logger.success("Updated .gitignore rp1 entries");
	} else {
		logger.info("Appending to .gitignore");
		const newContent = appendShellFencedContent(
			existingContent,
			gitignoreContent,
			LATEST_FENCE_VERSION,
		);
		await writeFileContent(gitignorePath, newContent);
		actions.push({ type: "updated_file", path: gitignorePath });
		logger.success("Added rp1 entries to .gitignore");
	}

	return actions;
}
