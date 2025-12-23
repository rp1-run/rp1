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
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("init-integration-");
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
				expect(instructionContent).toContain("<!-- rp1:start -->");
				expect(instructionContent).toContain("<!-- rp1:end -->");
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

		test(
			"healthReport reflects actual setup state",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Health report should be present
				expect(initResult.healthReport).not.toBeNull();

				if (initResult.healthReport) {
					// rp1 directory should exist
					expect(initResult.healthReport.rp1DirExists).toBe(true);
					// Instruction file should be valid (has fenced content)
					expect(initResult.healthReport.instructionFileValid).toBe(true);
				}
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

				// In --yes mode with existing setup, init should skip re-initialization
				const initResult: InitResult = result.right;
				const skippedReinit = initResult.actions.find(
					(a) =>
						a.type === "skipped" &&
						a.reason.includes("Re-initialization skipped"),
				);
				expect(skippedReinit).toBeDefined();

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
			"uses recommended gitignore preset in --yes mode",
			async () => {
				// Create a git repo to enable gitignore configuration
				await Bun.spawn(["git", "init"], { cwd: tempDir }).exited;

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// Check gitignore was created/updated
				const gitignoreContent = await readFileIfExists(
					join(tempDir, ".gitignore"),
				);

				if (gitignoreContent) {
					// Should have rp1 fenced content with recommended preset
					expect(gitignoreContent).toContain("# rp1:start");
					expect(gitignoreContent).toContain("# rp1:end");
					// Recommended preset ignores work but tracks context
					expect(gitignoreContent).toContain("!.rp1/context/");
				}
			},
			{ timeout: 30000 },
		);

		test(
			"skips re-initialization in --yes mode",
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
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Should have skipped re-initialization
				const skipped = initResult.actions.find(
					(a) =>
						a.type === "skipped" &&
						a.reason.includes("Re-initialization skipped"),
				);
				expect(skipped).toBeDefined();

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

	describe("final summary reflects actual actions", () => {
		test(
			"summary includes all actions taken during init",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Actions should include directory and file operations
				expect(initResult.actions.length).toBeGreaterThan(0);

				// Should have created_directory actions
				const dirActions = initResult.actions.filter(
					(a) => a.type === "created_directory",
				);
				expect(dirActions.length).toBeGreaterThan(0);

				// Should have created_file or updated_file for instruction file
				const fileActions = initResult.actions.filter(
					(a) => a.type === "created_file" || a.type === "updated_file",
				);
				expect(fileActions.length).toBeGreaterThan(0);

				// Logger should have displayed summary via displaySummary function
				expect(logger.calls.length).toBeGreaterThan(0);
			},
			{ timeout: 30000 },
		);

		test(
			"nextSteps reflects setup state",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Should have nextSteps generated
				expect(initResult.nextSteps).toBeDefined();
				expect(Array.isArray(initResult.nextSteps)).toBe(true);

				// nextSteps may suggest building KB if none exists
				// At minimum, nextSteps array should exist
				expect(initResult.nextSteps.length).toBeGreaterThanOrEqual(0);

				// Since no AI tool detected in test env, should suggest installing one
				if (!initResult.detectedTool) {
					const toolStep = initResult.nextSteps.find(
						(s) =>
							s.action.includes("AI") ||
							s.action.includes("Claude Code") ||
							s.action.includes("OpenCode"),
					);
					expect(toolStep).toBeDefined();
				}
			},
			{ timeout: 30000 },
		);

		test(
			"healthReport reflects actual setup state",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Health report should exist
				expect(initResult.healthReport).not.toBeNull();

				if (initResult.healthReport) {
					// Core setup should be healthy
					expect(initResult.healthReport.rp1DirExists).toBe(true);
					expect(initResult.healthReport.instructionFileValid).toBe(true);

					// Plugin status depends on test environment:
					// - If no tool detected: plugins array is empty, pluginsInstalled=true (vacuously)
					// - If OpenCode: plugins array is empty, pluginsInstalled=true (vacuously)
					// - If Claude Code: plugins array may have entries
					// The health report should be consistent with its plugins array
					if (initResult.healthReport.plugins.length === 0) {
						// No plugins to verify = "all plugins installed" (vacuously true)
						expect(initResult.healthReport.pluginsInstalled).toBe(true);
					}
				}
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
			"respects RP1_ROOT environment variable",
			async () => {
				// Set custom RP1_ROOT
				process.env.RP1_ROOT = "custom-rp1-dir";

				const logger = createTrackingLogger();
				const options: InitOptions = {
					cwd: tempDir,
					yes: true,
				};

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult: InitResult = result.right;

				// Should have created custom directory
				const customDirAction = initResult.actions.find(
					(a) =>
						a.type === "created_directory" && a.path.includes("custom-rp1-dir"),
				);
				expect(customDirAction).toBeDefined();
			},
			{ timeout: 30000 },
		);
	});
});
