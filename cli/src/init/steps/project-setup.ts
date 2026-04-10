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
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";
import {
	appendFencedContent,
	hasFencedContent,
	replaceFencedContent,
	validateFencing,
	wrapWithFence,
} from "../comment-fence.js";
import { resolveInitDirectoryModel } from "../directory-model.js";
import { buildManagedGitignoreContent } from "../gitignore.js";
import type { GitignorePreset, InitAction } from "../models.js";
import type { InitProgress } from "../progress.js";
import { buildSettingsTomlTemplate } from "../settings-template.js";
import {
	appendShellFencedContent,
	hasShellFencedContent,
	replaceShellFencedContent,
	validateShellFencing,
	wrapWithShellFence,
} from "../shell-fence.js";
import {
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
): Promise<InitAction[]> {
	const actions: InitAction[] = [];
	const directories = resolveInitDirectoryModel(cwd);
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

// ============================================================================
// Settings Files
// ============================================================================

/**
 * Resolve the global settings file path.
 * Uses ~/.config/rp1/settings.toml to match settings-loader.ts.
 */
function resolveGlobalSettingsPath(): string {
	return path.join(homedir(), ".config", "rp1", "settings.toml");
}

/**
 * Resolve the local settings file path.
 */
function resolveLocalSettingsPath(cwd: string): string {
	return path.join(resolveInitDirectoryModel(cwd).rp1Dir, "settings.toml");
}

/**
 * Create a settings file if missing.
 * Existing settings files are preserved verbatim.
 */
async function createOrUpdateSettingsFile(
	filePath: string,
): Promise<{ action: InitAction; isNew: boolean; addedFields: string[] }> {
	if (await fileExists(filePath)) {
		return {
			action: { type: "updated_file", path: filePath },
			isNew: false,
			addedFields: [],
		};
	}

	const content = buildSettingsTomlTemplate();
	await writeFileContent(filePath, content);

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
): Promise<InitAction[]> {
	const actions: InitAction[] = [];

	logger.info(
		"Settings files can be safely re-initialized - existing values are preserved",
	);

	// Process global settings file
	const globalPath = resolveGlobalSettingsPath();
	const globalResult = await createOrUpdateSettingsFile(globalPath);
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
	const localPath = resolveLocalSettingsPath(cwd);
	const localResult = await createOrUpdateSettingsFile(localPath);
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
 * Inject rp1 KB instructions into a single instruction file.
 */
async function injectIntoFile(
	cwd: string,
	file: string,
	detectedTool: DetectedTool | null,
	logger: Logger,
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
		file === "CLAUDE.md" || file === "AGENTS.md"
			? resolveInstructionTemplate(file, {
					detectedTool,
					existingContent,
				})
			: "";

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
 * Inject rp1 KB instructions into ALL existing instruction files (CLAUDE.md and AGENTS.md).
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
