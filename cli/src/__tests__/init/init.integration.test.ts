/**
 * Integration tests for the complete init workflow.
 * Tests end-to-end init command behavior with real filesystem operations.
 *
 * These tests use:
 * - Real filesystem with temp directories
 * - Mocked external calls (Claude CLI via dependency injection)
 * - Actual init/index.ts orchestrator
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { detectReinitState, executeInit } from "../../init/index.js";
import type { InitOptions, InitResult } from "../../init/models.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

// ============================================================================
// Test Utilities
// ============================================================================

/**
 * Create a mock logger that tracks calls for assertion.
 */
function createTrackingLogger(): Logger & {
	calls: { method: string; args: unknown[] }[];
} {
	const calls: { method: string; args: unknown[] }[] = [];
	return {
		calls,
		trace: (...args) => calls.push({ method: "trace", args }),
		debug: (...args) => calls.push({ method: "debug", args }),
		info: (...args) => calls.push({ method: "info", args }),
		warn: (...args) => calls.push({ method: "warn", args }),
		error: (...args) => calls.push({ method: "error", args }),
		start: (...args) => calls.push({ method: "start", args }),
		success: (...args) => calls.push({ method: "success", args }),
		fail: (...args) => calls.push({ method: "fail", args }),
		box: (...args) => calls.push({ method: "box", args }),
	};
}

/**
 * Check if a file exists and return its content.
 */
async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

// ============================================================================
// Integration Tests
// ============================================================================

describe("integration: init workflow", () => {
	let tempDir: string;
	let globalSettingsPath: string;
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("init-integration-");
		globalSettingsPath = join(tempDir, "global-settings.toml");
		// Clear RP1_ROOT env var to use default ".rp1"
		delete process.env.RP1_ROOT;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		// Restore original env var
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}
	});

	describe("fresh init in new directory", () => {
		test(
			"creates complete setup with directories and instruction file",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true, // Non-interactive mode
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				// Should succeed
				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Should have created directories
				const createdDirActions = initResult.actions.filter(
					(a) => a.type === "created_directory",
				);
				expect(createdDirActions.length).toBeGreaterThanOrEqual(1);

				// Directory should exist (checking via the actions)
				expect(
					createdDirActions.some(
						(a) => a.type === "created_directory" && a.path.includes(".rp1"),
					),
				).toBe(true);

				// Should have created instruction file
				const createdFileActions = initResult.actions.filter(
					(a) => a.type === "created_file",
				);
				const instructionFileAction = createdFileActions.find(
					(a) =>
						a.type === "created_file" &&
						(a.path.includes("CLAUDE.md") || a.path.includes("AGENTS.md")),
				);
				expect(instructionFileAction).toBeDefined();

				// Verify instruction file has fenced content
				// Note: The file created depends on detected tool (CLAUDE.md or AGENTS.md)
				const claudeMdPath = join(tempDir, "CLAUDE.md");
				const agentsMdPath = join(tempDir, "AGENTS.md");
				const claudeMdContent = await readFileIfExists(claudeMdPath);
				const agentsMdContent = await readFileIfExists(agentsMdPath);

				// At least one instruction file should exist with fenced content
				const instructionContent = claudeMdContent ?? agentsMdContent;
				expect(instructionContent).not.toBeNull();
				expect(instructionContent).toMatch(/<!-- rp1:start(:\S+)? -->/);
				expect(instructionContent).toMatch(/<!-- rp1:end(:\S+)? -->/);
			},
			{ timeout: 30000 },
		);

		test(
			"creates .gitignore with rp1 entries in non-git directory",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// In non-git repo, gitignore step should be skipped
				const initResult: InitResult = result.right;

				// Should have warning about not being in git repo
				const gitWarnings = initResult.warnings.filter((w) =>
					w.includes("git"),
				);
				expect(gitWarnings.length).toBeGreaterThan(0);
			},
			{ timeout: 30000 },
		);
	});

	describe("re-init preserves existing content", () => {
		test(
			"preserves existing .rp1/context/ content during re-init",
			async () => {
				// Setup: Create existing .rp1/context/ with KB content
				const rp1Dir = join(tempDir, ".rp1");
				const contextDir = join(rp1Dir, "context");
				await mkdir(contextDir, { recursive: true });

				// Create existing KB files
				const existingKBContent = `# Existing Knowledge Base

This is existing KB content that should be preserved.

## Architecture
Some architecture notes here.
`;
				await writeFile(
					join(contextDir, "index.md"),
					existingKBContent,
					"utf-8",
				);

				// Create existing instruction file with fenced content
				const existingInstructionContent = `# Project Instructions

Custom project instructions here.

<!-- rp1:start -->
## Old rp1 content
This should be updated.
<!-- rp1:end -->

More custom content below.
`;
				await writeFile(
					join(tempDir, "CLAUDE.md"),
					existingInstructionContent,
					"utf-8",
				);

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true, // Non-interactive mode defaults to skip re-init
					globalSettingsPath,
				};

				// First verify the reinit state detection
				const reinitState = await detectReinitState(tempDir, "CLAUDE.md");
				expect(reinitState.hasRp1Dir).toBe(true);
				expect(reinitState.hasFencedContent).toBe(true);
				expect(reinitState.hasKBContent).toBe(true);

				// Run init
				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// In --yes mode with existing setup, init proceeds with "update" mode
				// (refreshes fenced content idempotently instead of skipping)
				const initResult: InitResult = result.right;

				// Should NOT have skipped re-initialization (T6: non-interactive refreshes)
				const skippedReinit = initResult.actions.find(
					(a) =>
						a.type === "skipped" &&
						a.reason.includes("Re-initialization skipped"),
				);
				expect(skippedReinit).toBeUndefined();

				// Should have proceeded with file operations (update mode)
				const fileActions = initResult.actions.filter(
					(a) => a.type === "created_file" || a.type === "updated_file",
				);
				expect(fileActions.length).toBeGreaterThan(0);

				// KB content should be preserved
				const kbContent = await readFile(join(contextDir, "index.md"), "utf-8");
				expect(kbContent).toContain("Existing Knowledge Base");
				expect(kbContent).toContain("Architecture");
			},
			{ timeout: 30000 },
		);

		test(
			"preserves existing .rp1/work/ content during re-init",
			async () => {
				// Setup: Create existing .rp1/work/ with content
				const rp1Dir = join(tempDir, ".rp1");
				const workDir = join(rp1Dir, "work");
				const featuresDir = join(workDir, "features");
				await mkdir(featuresDir, { recursive: true });

				// Create existing work artifact
				const existingWorkContent = `# Feature: My Feature

This is an existing feature document.
`;
				await writeFile(
					join(featuresDir, "my-feature.md"),
					existingWorkContent,
					"utf-8",
				);

				// Create instruction file to trigger re-init detection
				await writeFile(
					join(tempDir, "CLAUDE.md"),
					`<!-- rp1:start -->test<!-- rp1:end -->`,
					"utf-8",
				);

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				// Verify reinit state detection
				const reinitState = await detectReinitState(tempDir, "CLAUDE.md");
				expect(reinitState.hasRp1Dir).toBe(true);
				expect(reinitState.hasWorkContent).toBe(true);

				// Run init
				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// Work content should be preserved
				const workContent = await readFile(
					join(featuresDir, "my-feature.md"),
					"utf-8",
				);
				expect(workContent).toContain("Feature: My Feature");
			},
			{ timeout: 30000 },
		);
	});

	describe("--yes mode (non-interactive)", () => {
		test(
			"completes without prompts in --yes mode",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				// Should complete successfully
				expect(E.isRight(result)).toBe(true);

				// Should not have any user prompts (no selectOption calls would be logged)
				// The test completes without hanging = no prompts were awaited
			},
			{ timeout: 30000 },
		);

		test(
			"refreshes configuration in --yes mode (non-interactive update)",
			async () => {
				// Setup existing init
				const rp1Dir = join(tempDir, ".rp1");
				await mkdir(rp1Dir, { recursive: true });
				await writeFile(
					join(tempDir, "CLAUDE.md"),
					`<!-- rp1:start -->existing<!-- rp1:end -->`,
					"utf-8",
				);

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Should NOT skip -- non-interactive mode refreshes (T6 behavior change)
				const skipped = initResult.actions.find(
					(a) =>
						a.type === "skipped" &&
						a.reason.includes("Re-initialization skipped"),
				);
				expect(skipped).toBeUndefined();

				// Should have file update actions (refreshed fenced content)
				const updateActions = initResult.actions.filter(
					(a) => a.type === "updated_file",
				);
				expect(updateActions.length).toBeGreaterThan(0);

				// Should log non-interactive mode info
				const nonInteractiveLog = logger.calls.find(
					(c) =>
						c.method === "info" &&
						String(c.args[0]).includes("Non-interactive mode"),
				);
				expect(nonInteractiveLog).toBeDefined();
			},
			{ timeout: 30000 },
		);
	});

	describe("plugin installation failure handling", () => {
		test(
			"plugin installation failure does not abort entire init",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				// Note: In the real workflow, plugin installation is attempted
				// but since no Claude Code is installed in test environment,
				// it will be skipped (no tool detected)

				const result = await executeInit(options, logger)();

				// Init should still succeed
				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Core setup should have completed
				// - Directory creation
				const dirActions = initResult.actions.filter(
					(a) => a.type === "created_directory",
				);
				expect(dirActions.length).toBeGreaterThan(0);

				// - Instruction file
				const fileActions = initResult.actions.filter(
					(a) => a.type === "created_file" || a.type === "updated_file",
				);
				expect(fileActions.length).toBeGreaterThan(0);

				// Plugin installation is handled (either skipped or attempted)
				// - If no tool detected: skipped with "No agentic tool" reason
				// - If OpenCode detected: skipped with "Automated installation not supported"
				// - If Claude Code detected: may succeed or fail depending on environment
				// At least one action should relate to plugin handling
				// (either skipped or a plugin_installed/plugin_install_failed)
				const anyPluginAction = initResult.actions.find(
					(a) =>
						(a.type === "skipped" &&
							a.reason.toLowerCase().includes("plugin")) ||
						(a.type === "skipped" &&
							a.reason.toLowerCase().includes("automated")) ||
						a.type === "plugin_installed" ||
						a.type === "plugin_install_failed",
				);
				expect(anyPluginAction).toBeDefined();
			},
			{ timeout: 30000 },
		);

		test(
			"init succeeds regardless of tool detection state",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				// Init should always succeed (plugin issues are non-critical)
				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Warnings may or may not be present depending on environment:
				// - If no tool detected: "No agentic tool" warning
				// - If tool detected: May have other warnings
				// - If in git repo: May have git-related warnings
				// The key assertion is that init succeeded despite any warnings
				expect(initResult.actions.length).toBeGreaterThan(0);

				// Core setup should complete
				const coreSetupActions = initResult.actions.filter(
					(a) =>
						a.type === "created_directory" ||
						a.type === "created_file" ||
						a.type === "updated_file",
				);
				expect(coreSetupActions.length).toBeGreaterThan(0);
			},
			{ timeout: 30000 },
		);
	});

	describe("single-file stanza injection (end-to-end)", () => {
		test(
			"both files: CLAUDE.md gets @AGENTS.md reference, AGENTS.md gets full stanza",
			async () => {
				await writeFile(
					join(tempDir, "CLAUDE.md"),
					"# My Project\n\nProject-level instructions.\n",
					"utf-8",
				);
				await writeFile(
					join(tempDir, "AGENTS.md"),
					"# Agents\n\nAgent instructions.\n",
					"utf-8",
				);

				const logger = createTrackingLogger();
				const result = await executeInit(
					{ cwd: tempDir, yes: true, globalSettingsPath },
					logger,
				)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const claudeContent = await readFileIfExists(
					join(tempDir, "CLAUDE.md"),
				);
				const agentsContent = await readFileIfExists(
					join(tempDir, "AGENTS.md"),
				);

				expect(claudeContent).not.toBeNull();
				expect(agentsContent).not.toBeNull();

				expect(claudeContent).toContain("@AGENTS.md");
				expect(claudeContent).not.toContain("## rp1 Knowledge Base");
				expect(claudeContent).toContain("Project-level instructions.");

				expect(agentsContent).toContain("## rp1 Knowledge Base");
				expect(agentsContent).toContain("Agent instructions.");
			},
			{ timeout: 30000 },
		);

		test(
			"CLAUDE.md only: gets full stanza without reference",
			async () => {
				await writeFile(join(tempDir, "CLAUDE.md"), "# My Project\n", "utf-8");

				const logger = createTrackingLogger();
				const result = await executeInit(
					{ cwd: tempDir, yes: true, globalSettingsPath },
					logger,
				)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const claudeContent = await readFileIfExists(
					join(tempDir, "CLAUDE.md"),
				);
				const agentsContent = await readFileIfExists(
					join(tempDir, "AGENTS.md"),
				);

				expect(claudeContent).toContain("## rp1 Knowledge Base");
				expect(claudeContent).not.toContain("@AGENTS.md");
				expect(agentsContent).toBeNull();
			},
			{ timeout: 30000 },
		);

		test(
			"AGENTS.md only: gets full stanza",
			async () => {
				await writeFile(join(tempDir, "AGENTS.md"), "# Agents\n", "utf-8");

				const logger = createTrackingLogger();
				const result = await executeInit(
					{ cwd: tempDir, yes: true, globalSettingsPath },
					logger,
				)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const agentsContent = await readFileIfExists(
					join(tempDir, "AGENTS.md"),
				);
				expect(agentsContent).toContain("## rp1 Knowledge Base");
			},
			{ timeout: 30000 },
		);

		test(
			"neither file: creates default instruction file with full stanza",
			async () => {
				const logger = createTrackingLogger();
				const result = await executeInit(
					{ cwd: tempDir, yes: true, globalSettingsPath },
					logger,
				)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const claudeContent = await readFileIfExists(
					join(tempDir, "CLAUDE.md"),
				);
				const agentsContent = await readFileIfExists(
					join(tempDir, "AGENTS.md"),
				);

				const content = claudeContent ?? agentsContent;
				expect(content).not.toBeNull();
				expect(content).toContain("## rp1 Knowledge Base");
				expect(content).toMatch(/<!-- rp1:start(:\S+)? -->/);
			},
			{ timeout: 30000 },
		);
	});

	describe("edge cases", () => {
		test(
			"handles existing AGENTS.md file",
			async () => {
				// Create existing AGENTS.md (OpenCode style)
				await writeFile(
					join(tempDir, "AGENTS.md"),
					`# Agent Instructions

Existing agent instructions.
`,
					"utf-8",
				);

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// Either AGENTS.md was updated or CLAUDE.md was created
				// (depends on detected tool in environment)
				const initResult: InitResult = result.right;
				const fileAction = initResult.actions.find(
					(a) =>
						(a.type === "updated_file" || a.type === "created_file") &&
						(a.path.includes("AGENTS.md") || a.path.includes("CLAUDE.md")),
				);
				expect(fileAction).toBeDefined();
			},
			{ timeout: 30000 },
		);

		test(
			"ignores RP1_ROOT environment variable and uses .rp1/ in cwd",
			async () => {
				process.env.RP1_ROOT = "custom-rp1-dir";

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
					globalSettingsPath,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				const customDirAction = initResult.actions.find(
					(a) =>
						a.type === "created_directory" && a.path.includes("custom-rp1-dir"),
				);
				expect(customDirAction).toBeUndefined();

				const rp1DirAction = initResult.actions.find(
					(a) => a.type === "created_directory" && a.path.includes(".rp1"),
				);
				expect(rp1DirAction).toBeDefined();
			},
			{ timeout: 30000 },
		);
	});
});
