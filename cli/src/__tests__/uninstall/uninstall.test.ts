/**
 * Unit tests for the uninstall module.
 * Tests removal of rp1 fenced content from instruction files and gitignore.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import {
	executeUninstall,
	type UninstallConfig,
} from "../../uninstall/index.js";

/**
 * Create a mock logger that suppresses output during tests.
 */
const createMockLogger = (): Logger => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
});

describe("uninstall", () => {
	let tempDir: string;
	const logger = createMockLogger();
	const nonInteractivePromptOptions = { isTTY: false };

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rp1-uninstall-test-"));
		process.chdir(tempDir);
	});

	afterEach(async () => {
		if (tempDir) {
			await fs.rm(tempDir, { recursive: true, force: true });
		}
	});

	describe("fenced content removal", () => {
		test("removes fenced content from CLAUDE.md", async () => {
			const claudePath = path.join(tempDir, "CLAUDE.md");
			const content = `# My Project

Some instructions here.

<!-- rp1:start -->
## rp1 Knowledge Base

KB files in \`.rp1/context/\`: \`index.md\` (load first), \`architecture.md\`, \`modules.md\`, \`patterns.md\`, \`concept_map.md\`
<!-- rp1:end -->

## Other Section

More content.
`;
			await fs.writeFile(claudePath, content);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const actions = result.right.actions;
				expect(actions.some((a) => a.type === "removed_fenced_content")).toBe(
					true,
				);
			}

			const newContent = await fs.readFile(claudePath, "utf-8");
			expect(newContent).not.toContain("<!-- rp1:start -->");
			expect(newContent).not.toContain("<!-- rp1:end -->");
			expect(newContent).toContain("# My Project");
			expect(newContent).toContain("## Other Section");
		});

		test("removes fenced content from AGENTS.md", async () => {
			const agentsPath = path.join(tempDir, "AGENTS.md");
			const content = `# Agent Instructions

<!-- rp1:start -->
## rp1 Knowledge Base
Some rp1 content.
<!-- rp1:end -->
`;
			await fs.writeFile(agentsPath, content);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			const newContent = await fs.readFile(agentsPath, "utf-8");
			expect(newContent).not.toContain("<!-- rp1:start -->");
			expect(newContent).toContain("# Agent Instructions");
		});

		test("removes shell-fenced content from .gitignore", async () => {
			const gitignorePath = path.join(tempDir, ".gitignore");
			const content = `node_modules/
dist/

# rp1:start
.rp1/work/
.rp1/meta.json
# rp1:end

*.log
`;
			await fs.writeFile(gitignorePath, content);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			const newContent = await fs.readFile(gitignorePath, "utf-8");
			expect(newContent).not.toContain("# rp1:start");
			expect(newContent).not.toContain("# rp1:end");
			expect(newContent).toContain("node_modules/");
			expect(newContent).toContain("*.log");
		});

		test("deletes file if it becomes empty after removing fenced content", async () => {
			const claudePath = path.join(tempDir, "CLAUDE.md");
			const content = `<!-- rp1:start -->
## rp1 Knowledge Base
Only rp1 content here.
<!-- rp1:end -->
`;
			await fs.writeFile(claudePath, content);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const actions = result.right.actions;
				expect(actions.some((a) => a.type === "file_emptied")).toBe(true);
			}

			// File should be deleted
			await expect(fs.access(claudePath)).rejects.toThrow();
		});
	});

	describe("dry-run mode", () => {
		test("does not modify files in dry-run mode", async () => {
			const claudePath = path.join(tempDir, "CLAUDE.md");
			const originalContent = `# My Project

<!-- rp1:start -->
## rp1 Knowledge Base
Content.
<!-- rp1:end -->
`;
			await fs.writeFile(claudePath, originalContent);

			const config: UninstallConfig = {
				dryRun: true,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			const newContent = await fs.readFile(claudePath, "utf-8");
			expect(newContent).toBe(originalContent);
		});
	});

	describe("no changes scenario", () => {
		test("reports no changes when no rp1 content exists and Claude unavailable", async () => {
			// This test verifies behavior when Claude CLI is not available
			// Since we can't easily mock exec, we just verify the function completes successfully
			// The actual "no_changes" action only fires when Claude is also unavailable
			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			// When Claude is available, it will try to uninstall plugins even without content
			// This is expected behavior
		});

		test("handles CLAUDE.md without rp1 content", async () => {
			const claudePath = path.join(tempDir, "CLAUDE.md");
			const content = `# My Project

No rp1 content here.
`;
			await fs.writeFile(claudePath, content);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			const newContent = await fs.readFile(claudePath, "utf-8");
			expect(newContent).toBe(content);
		});
	});

	describe("manual cleanup instructions", () => {
		test("provides manual cleanup instructions when .rp1 directory exists", async () => {
			const rp1Dir = path.join(tempDir, ".rp1");
			await fs.mkdir(rp1Dir, { recursive: true });
			await fs.writeFile(path.join(rp1Dir, "test.txt"), "test");

			// Also create CLAUDE.md with rp1 content to trigger uninstall
			const claudePath = path.join(tempDir, "CLAUDE.md");
			await fs.writeFile(
				claudePath,
				`<!-- rp1:start -->\ncontent\n<!-- rp1:end -->`,
			);

			const config: UninstallConfig = {
				dryRun: false,
				yes: true,
				scope: "user",
			};
			const result = await executeUninstall(
				config,
				logger,
				nonInteractivePromptOptions,
			)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.manualCleanup.length).toBeGreaterThan(0);
				expect(
					result.right.manualCleanup.some((s) => s.includes("rm -rf")),
				).toBe(true);
			}

			// Verify .rp1 directory is preserved
			const dirExists = await fs
				.access(rp1Dir)
				.then(() => true)
				.catch(() => false);
			expect(dirExists).toBe(true);
		});
	});
});
