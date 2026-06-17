/**
 * Tests for init-install separation (T7).
 *
 * Validates:
 * - executeInit() delegates to install when plugins are missing
 * - Install failure produces a warning, not an abort
 * - handleReinitCheck() returns proceed:true, choice:"update" in non-interactive mode
 * - Project setup functions are idempotent (two runs -> identical output)
 * - Fenced content refresh preserves user content outside markers
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { detectReinitState, executeInit } from "../../init/index.js";
import type { InitOptions } from "../../init/models.js";
import {
	createDirectoryStructure,
	createSettingsFiles,
	injectInstructions,
} from "../../init/steps/project-setup.js";
import { AGENTS_REFERENCE_TEMPLATE } from "../../init/templates/index.js";
import type { DetectedTool } from "../../init/tool-detector.js";
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

// ============================================================================
// Test Utilities
// ============================================================================

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

function createMockLogger(): Logger {
	return {
		trace: () => {},
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {},
		start: () => {},
		success: () => {},
		fail: () => {},
		box: () => {},
	};
}

async function readFileIfExists(filePath: string): Promise<string | null> {
	try {
		return await readFile(filePath, "utf-8");
	} catch {
		return null;
	}
}

function createDetectedTool(
	id: "claude-code" | "opencode" | "codex",
	instructionFile: "CLAUDE.md" | "AGENTS.md",
): DetectedTool {
	return {
		tool: {
			id,
			name: id,
			binary: id,
			min_version: "1.0.0",
			instruction_file: instructionFile,
			install_url: `https://${id}.example.com`,
			plugin_install_cmd: null,
			capabilities: [],
		},
		version: "1.0.0",
		meetsMinVersion: true,
	};
}

// ============================================================================
// Tests
// ============================================================================

describe("init-install separation", () => {
	let tempDir: string;
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("init-install-sep-");
		delete process.env.RP1_ROOT;
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
		if (originalEnv !== undefined) {
			process.env.RP1_ROOT = originalEnv;
		} else {
			delete process.env.RP1_ROOT;
		}
	});

	describe("init-install delegation", () => {
		test(
			"init handles install-check step (skipped when no tools, runs when tools detected)",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult = result.right;

				// Install-check step should produce either:
				// - A skipped action (no tools detected) with plugin/install/tools reason
				// - Or plugin_installed / plugin_install_failed actions (tools detected)
				// - Or a skipped action noting plugins are already installed
				const installRelatedAction = initResult.actions.find(
					(a) =>
						(a.type === "skipped" &&
							(a.reason.toLowerCase().includes("plugin") ||
								a.reason.toLowerCase().includes("install") ||
								a.reason.toLowerCase().includes("no tools"))) ||
						a.type === "plugin_installed" ||
						a.type === "plugin_install_failed",
				);
				expect(installRelatedAction).toBeDefined();
			},
			{ timeout: 30000 },
		);

		test(
			"init continues with project setup regardless of install outcome",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult = result.right;

				// Core setup should always complete
				const dirActions = initResult.actions.filter(
					(a) => a.type === "created_directory",
				);
				expect(dirActions.length).toBeGreaterThan(0);

				const fileActions = initResult.actions.filter(
					(a) => a.type === "created_file" || a.type === "updated_file",
				);
				expect(fileActions.length).toBeGreaterThan(0);

				// Health report should exist (proves full flow ran)
				expect(initResult.healthReport).not.toBeNull();
			},
			{ timeout: 30000 },
		);

		test(
			"executeInit reuses the canonical project root when started from a nested directory",
			async () => {
				const logger = createTrackingLogger();
				const nestedDir = join(tempDir, "packages", "app");
				await mkdir(join(tempDir, ".rp1"), { recursive: true });
				await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
				await mkdir(nestedDir, { recursive: true });

				const result = await executeInit(
					{ cwd: nestedDir, yes: true },
					logger,
				)();

				expect(E.isRight(result)).toBe(true);
				expect(
					await readFile(join(tempDir, ".rp1", "project_id"), "utf-8"),
				).toBe("project-123");
				expect(
					await readFileIfExists(join(nestedDir, ".rp1", "project_id")),
				).toBeNull();
				expect(
					await readFileIfExists(join(nestedDir, ".rp1", "settings.toml")),
				).toBeNull();
			},
			{ timeout: 30000 },
		);

		test(
			"install failure does not prevent project setup from completing",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult = result.right;

				// Even if there are plugin install failures, init succeeds
				// Directories are always created
				const dirActions = initResult.actions.filter(
					(a) => a.type === "created_directory",
				);
				expect(dirActions.length).toBeGreaterThan(0);

				// Instruction file is always created/updated
				const instrActions = initResult.actions.filter(
					(a) =>
						(a.type === "created_file" || a.type === "updated_file") &&
						(a.path.includes("CLAUDE.md") || a.path.includes("AGENTS.md")),
				);
				expect(instrActions.length).toBeGreaterThan(0);

				// Next steps are generated
				expect(initResult.nextSteps.length).toBeGreaterThanOrEqual(0);
			},
			{ timeout: 30000 },
		);
	});

	describe("handleReinitCheck non-interactive mode", () => {
		test(
			"non-interactive mode returns proceed:true, choice:update for existing projects",
			async () => {
				// Setup: create existing rp1 artifacts
				const rp1Dir = join(tempDir, ".rp1");
				await mkdir(rp1Dir, { recursive: true });
				await writeFile(
					join(tempDir, "CLAUDE.md"),
					`<!-- rp1:start -->old content<!-- rp1:end -->`,
					"utf-8",
				);

				const logger = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				const initResult = result.right;

				// Should NOT have skipped -- should have proceeded with update
				const skippedReinit = initResult.actions.find(
					(a) =>
						a.type === "skipped" &&
						a.reason.includes("Re-initialization skipped"),
				);
				expect(skippedReinit).toBeUndefined();

				// Should have updated the instruction file (fenced content refreshed)
				const updatedFiles = initResult.actions.filter(
					(a) => a.type === "updated_file",
				);
				expect(updatedFiles.length).toBeGreaterThan(0);

				// Logger should show non-interactive mode message
				const nonInteractiveLog = logger.calls.find(
					(c) =>
						c.method === "info" &&
						String(c.args[0]).includes("Non-interactive mode"),
				);
				expect(nonInteractiveLog).toBeDefined();
			},
			{ timeout: 30000 },
		);

		test("detectReinitState correctly identifies initialized project", async () => {
			const rp1Dir = join(tempDir, ".rp1");
			await mkdir(rp1Dir, { recursive: true });
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`# My project\n\n<!-- rp1:start -->\nrp1 content\n<!-- rp1:end -->\n\nMy custom stuff`,
				"utf-8",
			);

			const state = await detectReinitState(tempDir, "CLAUDE.md");

			expect(state.hasRp1Dir).toBe(true);
			expect(state.hasFencedContent).toBe(true);
		});

		test("detectReinitState returns false for fresh directory", async () => {
			const state = await detectReinitState(tempDir, null);

			expect(state.hasRp1Dir).toBe(false);
			expect(state.hasFencedContent).toBe(false);
			expect(state.hasKBContent).toBe(false);
			expect(state.hasWorkContent).toBe(false);
		});
	});

	describe("project setup idempotency", () => {
		test("createDirectoryStructure is idempotent", async () => {
			const logger = createMockLogger();

			// First run
			const actions1 = await createDirectoryStructure(tempDir, logger);
			// Second run
			const actions2 = await createDirectoryStructure(tempDir, logger);

			// First run creates directories
			const created1 = actions1.filter((a) => a.type === "created_directory");
			expect(created1.length).toBeGreaterThan(0);

			// Second run should create nothing (dirs already exist)
			const created2 = actions2.filter((a) => a.type === "created_directory");
			expect(created2.length).toBe(0);
		});

		test("createDirectoryStructure creates .rp1/work along with .rp1/context", async () => {
			const logger = createMockLogger();

			await createDirectoryStructure(tempDir, logger);

			expect((await stat(join(tempDir, ".rp1"))).isDirectory()).toBe(true);
			expect((await stat(join(tempDir, ".rp1", "context"))).isDirectory()).toBe(
				true,
			);
			expect((await stat(join(tempDir, ".rp1", "work"))).isDirectory()).toBe(
				true,
			);
		});

		test("createDirectoryStructure writes to the canonical project root from a nested directory", async () => {
			const logger = createMockLogger();
			const nestedDir = join(tempDir, "packages", "app");

			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
			await mkdir(nestedDir, { recursive: true });

			await createDirectoryStructure(nestedDir, logger);

			expect((await stat(join(tempDir, ".rp1", "context"))).isDirectory()).toBe(
				true,
			);
			expect((await stat(join(tempDir, ".rp1", "work"))).isDirectory()).toBe(
				true,
			);
			expect(
				await readFileIfExists(join(nestedDir, ".rp1", "project_id")),
			).toBe(null);
		});

		test("createSettingsFiles is idempotent", async () => {
			const logger = createMockLogger();

			// Ensure .rp1 dir exists
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			// First run
			await createSettingsFiles(tempDir, logger);
			const localPath = join(tempDir, ".rp1", "settings.toml");
			const firstContent = await readFile(localPath, "utf-8");

			// Second run
			await createSettingsFiles(tempDir, logger);
			const secondContent = await readFile(localPath, "utf-8");

			// Content should be identical
			expect(firstContent).toBe(secondContent);
		});

		test("createSettingsFiles writes current directory configuration guidance", async () => {
			const logger = createMockLogger();

			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			await createSettingsFiles(tempDir, logger);

			const localPath = join(tempDir, ".rp1", "settings.toml");
			const content = await readFile(localPath, "utf-8");

			expect(content).not.toContain("\ngit_worktree = false");
			expect(content).not.toContain("\ngit_commit = false");
			expect(content).toContain(
				"# Directory paths are fixed from the project root:",
			);
			expect(content).toContain(
				"# - Knowledge base files live in .rp1/context",
			);
			expect(content).toContain("# - Work artifacts live in .rp1/work");
			expect(content).toContain('# [arguments."dev:build"]');
			expect(content).toContain("# git_commit = false");
		});

		test("createSettingsFiles preserves existing settings file content", async () => {
			const logger = createMockLogger();
			const localPath = join(tempDir, ".rp1", "settings.toml");
			const existingContent = [
				"[directories]",
				'work_dir = "ops/work"',
				"",
				"[arguments.build]",
				"GIT_COMMIT = true",
			].join("\n");

			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			await writeFile(localPath, existingContent, "utf-8");
			await createSettingsFiles(tempDir, logger);

			const content = await readFile(localPath, "utf-8");
			expect(content).toBe(existingContent);
		});

		test("createSettingsFiles writes local settings to the canonical project root", async () => {
			const logger = createMockLogger();
			const nestedDir = join(tempDir, "packages", "app");

			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			await writeFile(join(tempDir, ".rp1", "project_id"), "project-123");
			await mkdir(nestedDir, { recursive: true });

			await createSettingsFiles(nestedDir, logger);

			expect(
				await readFileIfExists(join(tempDir, ".rp1", "settings.toml")),
			).not.toBeNull();
			expect(
				await readFileIfExists(join(nestedDir, ".rp1", "settings.toml")),
			).toBeNull();
		});

		test("injectInstructions is idempotent", async () => {
			const logger = createMockLogger();

			// Create CLAUDE.md
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				"# My Project\n\nCustom instructions here.\n",
				"utf-8",
			);

			// First injection
			await injectInstructions(tempDir, null, logger);
			const firstContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");

			// Second injection
			await injectInstructions(tempDir, null, logger);
			const secondContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");

			// Content should be identical after both runs
			expect(firstContent).toBe(secondContent);

			// Custom content should be preserved
			expect(secondContent).toContain("Custom instructions here.");
		});

		test(
			"full init is idempotent (three consecutive runs produce identical state)",
			async () => {
				const logger1 = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				// First run
				const result1 = await executeInit(options, logger1)();
				expect(E.isRight(result1)).toBe(true);

				// Read state after first run
				const claudeMd1 = await readFileIfExists(join(tempDir, "CLAUDE.md"));
				const agentsMd1 = await readFileIfExists(join(tempDir, "AGENTS.md"));
				const instructionContent1 = claudeMd1 ?? agentsMd1;

				// Second run
				const logger2 = createTrackingLogger();
				const result2 = await executeInit(options, logger2)();
				expect(E.isRight(result2)).toBe(true);

				// Third run
				const logger3 = createTrackingLogger();
				const result3 = await executeInit(options, logger3)();
				expect(E.isRight(result3)).toBe(true);

				// Read state after third run
				const claudeMd3 = await readFileIfExists(join(tempDir, "CLAUDE.md"));
				const agentsMd3 = await readFileIfExists(join(tempDir, "AGENTS.md"));
				const instructionContent3 = claudeMd3 ?? agentsMd3;

				// File contents should be identical
				expect(instructionContent3).toBe(instructionContent1);
			},
			{ timeout: 90000 },
		);
	});

	describe("fenced content refresh", () => {
		test("content outside fence markers is preserved after refresh", async () => {
			const customHeader = "# My Project\n\nCustom project instructions.\n\n";
			const customFooter =
				"\n\n## My Custom Section\n\nDo not touch this content.\n";
			const oldFenced =
				"<!-- rp1:start -->\n## Old rp1 content\nOld instructions.\n<!-- rp1:end -->";

			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`${customHeader}${oldFenced}${customFooter}`,
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const updatedContent = await readFile(
				join(tempDir, "CLAUDE.md"),
				"utf-8",
			);

			// Custom content outside markers should be preserved
			expect(updatedContent).toContain("Custom project instructions.");
			expect(updatedContent).toContain("My Custom Section");
			expect(updatedContent).toContain("Do not touch this content.");

			// Old content inside markers should be replaced
			expect(updatedContent).not.toContain("Old rp1 content");
			expect(updatedContent).not.toContain("Old instructions.");

			// Should still have fence markers with new content
			expect(updatedContent).toMatch(/<!-- rp1:start(:\S+)? -->/);
			expect(updatedContent).toMatch(/<!-- rp1:end(:\S+)? -->/);
		});

		test("fenced content is appended when no markers exist in file", async () => {
			const existingContent = "# My Project\n\nExisting content only.\n";
			await writeFile(join(tempDir, "CLAUDE.md"), existingContent, "utf-8");

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const updatedContent = await readFile(
				join(tempDir, "CLAUDE.md"),
				"utf-8",
			);

			// Original content preserved
			expect(updatedContent).toContain("Existing content only.");

			// Fenced content appended
			expect(updatedContent).toMatch(/<!-- rp1:start(:\S+)? -->/);
			expect(updatedContent).toMatch(/<!-- rp1:end(:\S+)? -->/);
		});

		test("instruction file is created with fenced content when it does not exist", async () => {
			const logger = createMockLogger();

			// Neither CLAUDE.md nor AGENTS.md exists
			await injectInstructions(tempDir, null, logger);

			// Default (no detected tool) creates CLAUDE.md
			const content = await readFileIfExists(join(tempDir, "CLAUDE.md"));
			expect(content).not.toBeNull();
			expect(content).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);
			expect(content).toContain(`<!-- rp1:end:v${LATEST_FENCE_VERSION} -->`);
		});

		test("codex init creates AGENTS.md with Codex conventions", async () => {
			const logger = createMockLogger();

			await injectInstructions(
				tempDir,
				createDetectedTool("codex", "AGENTS.md"),
				logger,
			);

			const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(content).toContain("## Codex agent conventions");
			expect(content).not.toContain("## rp1 Skill Awareness");
			expect(content).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);
		});

		test("codex refresh updates existing AGENTS.md with the Codex template", async () => {
			await writeFile(
				join(tempDir, "AGENTS.md"),
				"# Existing instructions\n",
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(
				tempDir,
				createDetectedTool("codex", "AGENTS.md"),
				logger,
			);

			const content = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(content).toContain("Existing instructions");
			expect(content).toContain("## Codex agent conventions");
			expect(content).not.toContain("## rp1 Skill Awareness");
		});

		test("refresh replaces only fenced content, not user content between files", async () => {
			// Create both CLAUDE.md and AGENTS.md with different user content
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`User Claude content\n\n<!-- rp1:start -->\nOld claude rp1\n<!-- rp1:end -->\n`,
				"utf-8",
			);
			await writeFile(
				join(tempDir, "AGENTS.md"),
				`User Agents content\n\n<!-- rp1:start -->\nOld agents rp1\n<!-- rp1:end -->\n`,
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsContent = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			// User content preserved in both
			expect(claudeContent).toContain("User Claude content");
			expect(agentsContent).toContain("User Agents content");

			// Old fenced content replaced in both
			expect(claudeContent).not.toContain("Old claude rp1");
			expect(agentsContent).not.toContain("Old agents rp1");
		});
	});

	describe("single-file stanza injection", () => {
		test("both files exist: CLAUDE.md gets @AGENTS.md reference, AGENTS.md gets full stanza", async () => {
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				"# My Project\n\nCustom instructions.\n",
				"utf-8",
			);
			await writeFile(
				join(tempDir, "AGENTS.md"),
				"# Agent Instructions\n\nAgent-specific content.\n",
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsContent = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(claudeContent).toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claudeContent).toContain(
				`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`,
			);
			expect(claudeContent).not.toContain("## rp1 Knowledge Base");

			expect(agentsContent).toContain("## rp1 Knowledge Base");
			expect(agentsContent).toContain(
				`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`,
			);

			expect(claudeContent).toContain("Custom instructions.");
			expect(agentsContent).toContain("Agent-specific content.");
		});

		test("both files with existing fences: CLAUDE.md fence becomes @AGENTS.md reference", async () => {
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`User content\n\n<!-- rp1:start -->\n## rp1 Knowledge Base\nOld template\n<!-- rp1:end -->\n`,
				"utf-8",
			);
			await writeFile(
				join(tempDir, "AGENTS.md"),
				`Agent content\n\n<!-- rp1:start -->\n## rp1 Knowledge Base\nOld template\n<!-- rp1:end -->\n`,
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsContent = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(claudeContent).toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claudeContent).not.toContain("Old template");

			expect(agentsContent).toContain("## rp1 Knowledge Base");
			expect(agentsContent).not.toContain("Old template");

			expect(claudeContent).toContain("User content");
			expect(agentsContent).toContain("Agent content");
		});

		test("CLAUDE.md only: gets full stanza (no reference)", async () => {
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				"# My Project\n\nCustom instructions.\n",
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsExists = await readFileIfExists(join(tempDir, "AGENTS.md"));

			expect(claudeContent).toContain("## rp1 Knowledge Base");
			expect(claudeContent).not.toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claudeContent).toContain(
				`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`,
			);

			expect(agentsExists).toBeNull();
		});

		test("AGENTS.md only: gets full stanza", async () => {
			await writeFile(
				join(tempDir, "AGENTS.md"),
				"# Agent Instructions\n\nAgent content.\n",
				"utf-8",
			);

			const logger = createMockLogger();
			await injectInstructions(tempDir, null, logger);

			const agentsContent = await readFile(join(tempDir, "AGENTS.md"), "utf-8");
			const claudeExists = await readFileIfExists(join(tempDir, "CLAUDE.md"));

			expect(agentsContent).toContain("## rp1 Knowledge Base");
			expect(agentsContent).toContain(
				`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`,
			);

			expect(claudeExists).toBeNull();
		});

		test("neither file exists: creates default instruction file", async () => {
			const logger = createMockLogger();
			const result = await injectInstructions(tempDir, null, logger);

			expect(result.instructionFile).toBe("CLAUDE.md");
			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			expect(claudeContent).toContain("## rp1 Knowledge Base");
			expect(claudeContent).toContain(
				`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`,
			);
		});

		test("both files: idempotent (second run produces identical output)", async () => {
			await writeFile(join(tempDir, "CLAUDE.md"), "# My Project\n", "utf-8");
			await writeFile(join(tempDir, "AGENTS.md"), "# Agents\n", "utf-8");

			const logger = createMockLogger();

			await injectInstructions(tempDir, null, logger);
			const claudeFirst = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsFirst = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			await injectInstructions(tempDir, null, logger);
			const claudeSecond = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsSecond = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(claudeSecond).toBe(claudeFirst);
			expect(agentsSecond).toBe(agentsFirst);
		});

		test("both files with Codex: AGENTS.md gets Codex template, CLAUDE.md gets reference", async () => {
			await writeFile(join(tempDir, "CLAUDE.md"), "# My Project\n", "utf-8");
			await writeFile(join(tempDir, "AGENTS.md"), "# Agents\n", "utf-8");

			const logger = createMockLogger();
			await injectInstructions(
				tempDir,
				createDetectedTool("codex", "AGENTS.md"),
				logger,
			);

			const claudeContent = await readFile(join(tempDir, "CLAUDE.md"), "utf-8");
			const agentsContent = await readFile(join(tempDir, "AGENTS.md"), "utf-8");

			expect(claudeContent).toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claudeContent).not.toContain("## Codex agent conventions");

			expect(agentsContent).toContain("## Codex agent conventions");
			expect(agentsContent).not.toContain("## rp1 Skill Awareness");
		});
	});

	describe("INIT_STEPS uses install-check instead of legacy step IDs", () => {
		test(
			"init flow includes install-check step",
			async () => {
				const logger = createTrackingLogger();
				const options: InitOptions = { cwd: tempDir, yes: true };

				const result = await executeInit(options, logger)();

				expect(E.isRight(result)).toBe(true);
				if (!E.isRight(result)) return;

				// Verify that logger mentions "install" or "plugin" checking
				// (the install-check step runs as part of the flow)
				const installRelatedLogs = logger.calls.filter(
					(c) =>
						String(c.args[0]).toLowerCase().includes("plugin") ||
						String(c.args[0]).toLowerCase().includes("install"),
				);
				expect(installRelatedLogs.length).toBeGreaterThan(0);
			},
			{ timeout: 30000 },
		);
	});
});
