/**
 * Unit tests for per-platform sandbox grant generation.
 *
 * Tests pure grant generators (shape/content), file writers (merge/create),
 * and the dispatch function (harness selection filtering + undefined fallback).
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
	generateAntigravityGrants,
	generateClaudeCodeGrants,
	generateCodexGrants,
	generateCopilotGrants,
	generateOpenCodeGrants,
	generateSandboxGrants,
	writeClaudeCodeGrants,
	writeCodexGrants,
} from "../../../init/steps/sandbox-grants.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../../helpers/index.js";

describe("sandbox-grants", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("sandbox-grants-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	// ─── Claude Code ──────────────────────────────────────────────

	describe("generateClaudeCodeGrants", () => {
		test("returns object with additionalDirectories including ~/.rp1", () => {
			const grants = generateClaudeCodeGrants();
			expect(grants.permissions.additionalDirectories).toContain("~/.rp1");
		});

		test("returns allow rules for Read and Edit on ~/.rp1/**", () => {
			const grants = generateClaudeCodeGrants();
			expect(grants.permissions.allow).toContain("Read(~/.rp1/**)");
			expect(grants.permissions.allow).toContain("Edit(~/.rp1/**)");
		});

		test("returns sandbox.filesystem.allowWrite including ~/.rp1", () => {
			const grants = generateClaudeCodeGrants();
			expect(grants.sandbox.filesystem.allowWrite).toContain("~/.rp1");
		});
	});

	describe("writeClaudeCodeGrants", () => {
		test("merges grants into existing .claude/settings.json without overwriting user content", async () => {
			const existing = {
				permissions: {
					allow: ["Bash(npm *)"],
					deny: ["Bash(rm -rf *)"],
				},
				customKey: "preserved",
			};
			await writeFixture(
				tempDir,
				".claude/settings.json",
				JSON.stringify(existing, null, 2),
			);

			await writeClaudeCodeGrants(tempDir);

			const content = JSON.parse(
				readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
			);

			expect(content.customKey).toBe("preserved");
			expect(content.permissions.deny).toEqual(["Bash(rm -rf *)"]);
			expect(content.permissions.allow).toContain("Bash(npm *)");
			expect(content.permissions.additionalDirectories).toContain("~/.rp1");
			expect(content.permissions.allow).toContain("Read(~/.rp1/**)");
			expect(content.permissions.allow).toContain("Edit(~/.rp1/**)");
			expect(content.sandbox.filesystem.allowWrite).toContain("~/.rp1");
		});

		test("creates .claude/settings.json when file does not exist", async () => {
			await writeClaudeCodeGrants(tempDir);

			const path = join(tempDir, ".claude", "settings.json");
			expect(existsSync(path)).toBe(true);

			const content = JSON.parse(readFileSync(path, "utf-8"));
			expect(content.permissions.additionalDirectories).toContain("~/.rp1");
			expect(content.permissions.allow).toContain("Read(~/.rp1/**)");
			expect(content.sandbox.filesystem.allowWrite).toContain("~/.rp1");
		});

		test("does not duplicate grants on repeated writes", async () => {
			await writeClaudeCodeGrants(tempDir);
			await writeClaudeCodeGrants(tempDir);

			const content = JSON.parse(
				readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
			);

			const dirCount = (
				content.permissions.additionalDirectories as string[]
			).filter((d: string) => d === "~/.rp1").length;
			expect(dirCount).toBe(1);
		});
	});

	// ─── Codex ────────────────────────────────────────────────────

	describe("generateCodexGrants", () => {
		test("produces writable_roots config including ~/.rp1", () => {
			const grants = generateCodexGrants();
			expect(grants.sandbox_workspace_write.writable_roots).toContain("~/.rp1");
		});
	});

	describe("writeCodexGrants", () => {
		test("creates codex.toml with writable_roots section", async () => {
			await writeCodexGrants(tempDir);

			const content = readFileSync(join(tempDir, "codex.toml"), "utf-8");
			expect(content).toContain("[sandbox_workspace_write]");
			expect(content).toContain("~/.rp1");
		});

		test("preserves existing content when appending sandbox section", async () => {
			await writeFixture(
				tempDir,
				"codex.toml",
				"[features]\nmulti_agent = true\n",
			);
			await writeCodexGrants(tempDir);

			const content = readFileSync(join(tempDir, "codex.toml"), "utf-8");
			expect(content).toContain("[features]");
			expect(content).toContain("multi_agent = true");
			expect(content).toContain("[sandbox_workspace_write]");
			expect(content).toContain("~/.rp1");
		});
	});

	// ─── OpenCode ─────────────────────────────────────────────────

	describe("generateOpenCodeGrants", () => {
		test("produces external_directory config including ~/.rp1", () => {
			const grants = generateOpenCodeGrants();
			expect(grants.sandbox.external_directories).toContain("~/.rp1");
		});
	});

	// ─── Antigravity ──────────────────────────────────────────────

	describe("generateAntigravityGrants", () => {
		test("produces sandbox config granting ~/.rp1 access", () => {
			const grants = generateAntigravityGrants();
			expect(grants.sandbox.allowed_paths).toContain("~/.rp1");
		});
	});

	// ─── Copilot ──────────────────────────────────────────────────

	describe("generateCopilotGrants", () => {
		test("produces sandbox allowlist including ~/.rp1", () => {
			const grants = generateCopilotGrants();
			expect(grants.sandbox.allowlist).toContain("~/.rp1");
		});
	});

	// ─── Dispatch ─────────────────────────────────────────────────

	describe("generateSandboxGrants dispatch", () => {
		test("given harness selection ['claude-code', 'codex'], only those two platform grants are generated", async () => {
			await generateSandboxGrants(["claude-code", "codex"], tempDir);

			expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
			expect(existsSync(join(tempDir, "codex.toml"))).toBe(true);

			expect(existsSync(join(tempDir, ".opencode", "settings.json"))).toBe(
				false,
			);
			expect(existsSync(join(tempDir, ".gemini", "settings.json"))).toBe(false);
			expect(
				existsSync(join(tempDir, ".github", "copilot-settings.json")),
			).toBe(false);
		});

		test("given undefined harness selection, grants are generated for all detected stable harnesses", async () => {
			// Pass non-existent globalSettingsPath so loadEnabledHarnesses returns undefined,
			// triggering fallback to all stable platforms from the tool registry.
			const bogusSettingsPath = join(tempDir, "nonexistent-settings.toml");
			await generateSandboxGrants(undefined, tempDir, bogusSettingsPath);

			expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
			expect(existsSync(join(tempDir, "codex.toml"))).toBe(true);
			expect(existsSync(join(tempDir, ".opencode", "settings.json"))).toBe(
				true,
			);
			expect(existsSync(join(tempDir, ".gemini", "settings.json"))).toBe(true);
			expect(
				existsSync(join(tempDir, ".github", "copilot-settings.json")),
			).toBe(true);
		});

		test("skips unknown harness IDs without error", async () => {
			await generateSandboxGrants(["claude-code", "unknown-tool"], tempDir);

			expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);
		});

		test("generates no files when harness list is empty", async () => {
			await generateSandboxGrants([], tempDir);

			expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(false);
			expect(existsSync(join(tempDir, "codex.toml"))).toBe(false);
		});
	});
});
