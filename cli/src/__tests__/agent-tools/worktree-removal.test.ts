/**
 * Regression tests for worktree management removal.
 * Verifies removed commands are absent from the CLI surface and that
 * active docs/prompts no longer reference deprecated worktree-management
 * commands, flags, or claims.
 */

import { describe, expect, test } from "bun:test";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { agentToolsCommand } from "../../agent-tools/command.js";

const REPO_ROOT = join(import.meta.dir, "../../../..");

describe("worktree management removal", () => {
	describe("CLI surface contract", () => {
		test("agent-tools command does not register a worktree subcommand", () => {
			const subcommandNames = agentToolsCommand.commands.map((cmd) =>
				cmd.name(),
			);
			expect(subcommandNames).not.toContain("worktree");
		});

		test("agent-tools help text does not mention worktree as a tool", () => {
			const helpText = agentToolsCommand.helpInformation();
			// The help text should not list worktree as a command or tool.
			// It may mention "worktree" in the rp1-root-dir description
			// (read-only detection), which is acceptable.
			const lines = helpText.split("\n");
			const toolLines = lines.filter(
				(line) =>
					line.trim().startsWith("worktree") ||
					line.includes("worktree create") ||
					line.includes("worktree cleanup") ||
					line.includes("worktree status"),
			);
			expect(toolLines).toEqual([]);
		});

		test("worktree implementation directory does not exist", () => {
			const worktreeDir = join(REPO_ROOT, "cli/src/agent-tools/worktree");
			expect(existsSync(worktreeDir)).toBe(false);
		});

		test("worktree-workflow skill directory does not exist", () => {
			const skillDir = join(REPO_ROOT, "plugins/dev/skills/worktree-workflow");
			expect(existsSync(skillDir)).toBe(false);
		});
	});

	describe("documentation and prompt consistency", () => {
		const DEPRECATED_PATTERNS = [
			"rp1 agent-tools worktree create",
			"rp1 agent-tools worktree cleanup",
			"rp1 agent-tools worktree status",
			"--git-worktree",
			"worktree-workflow",
		] as const;

		/**
		 * Directories that should not contain deprecated worktree-management
		 * references. Scans repo-wide across docs, plugins, and CLI source.
		 * Excludes historical/generated outputs, changelogs, and work
		 * artifacts (design docs, tasks, etc.).
		 */
		const ACTIVE_DIRS = ["docs", "plugins", "cli/src/agent-tools"] as const;

		/**
		 * Paths that are allowed to contain deprecated patterns because they
		 * serve as historical records, retirement documentation, or are
		 * known deferred items outside the current feature scope.
		 */
		const ALLOWED_EXCEPTIONS = [
			"docs/retired-features.md",
			// Stale worktree-workflow references; skill predates this removal
			// and needs its own separate rework (not in scope for this feature).
			"plugins/dev/skills/address-pr-feedback/SKILL.md",
			// Stale --git-worktree in eval generation examples; these are
			// illustrative patterns, not active runtime references. Deferred.
			"plugins/utils/skills/prompt-eval-builder/PATTERNS.md",
		] as const;

		for (const pattern of DEPRECATED_PATTERNS) {
			test(`active directories do not contain "${pattern}"`, () => {
				const violations: string[] = [];

				for (const dir of ACTIVE_DIRS) {
					const fullPath = join(REPO_ROOT, dir);
					if (!existsSync(fullPath)) continue;

					try {
						const output = execSync(
							`grep -r --include='*.md' --include='*.ts' --include='*.yaml' --include='*.yml' --include='*.txt' -l ${JSON.stringify(pattern)} ${JSON.stringify(fullPath)} 2>/dev/null`,
							{ encoding: "utf-8" },
						).trim();

						if (output) {
							const files = output.split("\n").filter(Boolean);
							for (const file of files) {
								const relativePath = file.replace(`${REPO_ROOT}/`, "");
								if (!ALLOWED_EXCEPTIONS.some((exc) => relativePath === exc)) {
									violations.push(relativePath);
								}
							}
						}
					} catch {
						// grep returns exit code 1 when no matches found
					}
				}

				expect(violations).toEqual([]);
			});
		}
	});

	describe("deleted documentation pages", () => {
		const DELETED_PAGES = [
			"docs/reference/cli/worktree.md",
			"docs/concepts/parallel-worktrees.md",
			"docs/guides/parallel-development.md",
		] as const;

		for (const page of DELETED_PAGES) {
			test(`${page} does not exist`, () => {
				expect(existsSync(join(REPO_ROOT, page))).toBe(false);
			});
		}

		test("retired-features.md exists with worktree management entry", () => {
			const retiredPath = join(REPO_ROOT, "docs/retired-features.md");
			expect(existsSync(retiredPath)).toBe(true);
		});
	});
});
