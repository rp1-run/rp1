/**
 * Unit tests for the health-check step module.
 * Tests comprehensive validation of rp1 setup.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginStatus } from "../../../init/models.js";
import { performHealthCheck } from "../../../init/steps/health-check.js";
import { cleanupTempDir, createTempDir } from "../../helpers/index.js";

describe("health-check step", () => {
	let tempDir: string;
	const originalEnv = process.env.RP1_ROOT;

	beforeEach(async () => {
		tempDir = await createTempDir("health-check-test");
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

	/**
	 * Helper to create complete rp1 setup in temp directory.
	 */
	async function createCompleteSetup(
		cwd: string,
		options?: {
			skipRp1Dir?: boolean;
			skipInstructionFile?: boolean;
			skipGitignore?: boolean;
			instructionContent?: string;
			gitignoreContent?: string;
		},
	): Promise<void> {
		// Create .rp1/ directory
		if (!options?.skipRp1Dir) {
			await mkdir(join(cwd, ".rp1", "context"), { recursive: true });
			await mkdir(join(cwd, ".rp1", "work"), { recursive: true });
		}

		// Create CLAUDE.md with fenced content
		if (!options?.skipInstructionFile) {
			const content =
				options?.instructionContent ??
				`# Project Instructions

Some initial content here.

<!-- rp1:start -->
## rp1 Knowledge Base

KB files in \`.rp1/context/\`: \`index.md\` (load first), \`architecture.md\`
<!-- rp1:end -->
`;
			await writeFile(join(cwd, "CLAUDE.md"), content, "utf-8");
		}

		// Create .gitignore with fenced content
		if (!options?.skipGitignore) {
			const content =
				options?.gitignoreContent ??
				`# Editor
.vscode/
.idea/

# rp1:start
.rp1/work/
.rp1/context/
# rp1:end
`;
			await writeFile(join(cwd, ".gitignore"), content, "utf-8");
		}
	}

	/**
	 * Helper to create plugin status array.
	 */
	function createPluginStatuses(installed: boolean[]): readonly PluginStatus[] {
		const names = ["rp1-base", "rp1-dev"];
		return names.map((name, i) => ({
			name,
			installed: installed[i] ?? false,
			version: installed[i] ? "1.0.0" : null,
			location: installed[i] ? `/path/to/${name}` : null,
		}));
	}

	describe("performHealthCheck", () => {
		test("reports all healthy when complete setup", async () => {
			// Create complete setup with all components
			await createCompleteSetup(tempDir);

			// All plugins installed
			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			// All checks should pass
			expect(report.rp1DirExists).toBe(true);
			expect(report.instructionFileValid).toBe(true);
			expect(report.gitignoreConfigured).toBe(true);
			expect(report.pluginsInstalled).toBe(true);
			expect(report.issues).toHaveLength(0);
			expect(report.plugins).toEqual(plugins);
		});

		test("reports issues for missing .rp1/ directory", async () => {
			// Create setup without .rp1/ directory
			await createCompleteSetup(tempDir, { skipRp1Dir: true });

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.rp1DirExists).toBe(false);
			expect(report.issues.length).toBeGreaterThan(0);
			expect(report.issues.some((i) => i.includes(".rp1/"))).toBe(true);

			// Other checks should still pass
			expect(report.instructionFileValid).toBe(true);
			expect(report.gitignoreConfigured).toBe(true);
			expect(report.pluginsInstalled).toBe(true);
		});

		test("reports issues for missing instruction file content", async () => {
			// Create setup with instruction file but no rp1 fenced content
			await createCompleteSetup(tempDir, {
				instructionContent: `# Project Instructions

Some content here but no rp1 fenced section.

## Other Stuff
More content without the fence markers.
`,
			});

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.instructionFileValid).toBe(false);
			expect(report.issues.some((i) => i.includes("Instruction file"))).toBe(
				true,
			);

			// Other checks should still pass
			expect(report.rp1DirExists).toBe(true);
			expect(report.gitignoreConfigured).toBe(true);
			expect(report.pluginsInstalled).toBe(true);
		});

		test("reports issues for missing instruction file entirely", async () => {
			// Create setup without instruction file
			await createCompleteSetup(tempDir, { skipInstructionFile: true });

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.instructionFileValid).toBe(false);
			expect(report.issues.some((i) => i.includes("Instruction file"))).toBe(
				true,
			);
		});

		test("reports issues for missing plugins", async () => {
			// Create complete file setup
			await createCompleteSetup(tempDir);

			// rp1-base installed, rp1-dev not installed
			const plugins = createPluginStatuses([true, false]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.pluginsInstalled).toBe(false);
			expect(report.issues.some((i) => i.includes("rp1-dev"))).toBe(true);

			// Other checks should still pass
			expect(report.rp1DirExists).toBe(true);
			expect(report.instructionFileValid).toBe(true);
			expect(report.gitignoreConfigured).toBe(true);
		});

		test("reports issues for all plugins missing", async () => {
			// Create complete file setup
			await createCompleteSetup(tempDir);

			// No plugins installed
			const plugins = createPluginStatuses([false, false]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.pluginsInstalled).toBe(false);
			expect(report.issues.some((i) => i.includes("rp1-base"))).toBe(true);
			expect(report.issues.some((i) => i.includes("rp1-dev"))).toBe(true);
		});

		test("handles non-git repositories (skip gitignore check)", async () => {
			// Create setup without .gitignore (simulates non-git repo)
			await createCompleteSetup(tempDir, { skipGitignore: true });

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			// gitignoreConfigured should be true (skipped check)
			expect(report.gitignoreConfigured).toBe(true);
			// Should not report gitignore as an issue
			expect(report.issues.some((i) => i.includes(".gitignore"))).toBe(false);

			// All other checks should pass
			expect(report.rp1DirExists).toBe(true);
			expect(report.instructionFileValid).toBe(true);
			expect(report.pluginsInstalled).toBe(true);
			expect(report.issues).toHaveLength(0);
		});

		test("reports issues for .gitignore without rp1 entries", async () => {
			// Create setup with .gitignore but no rp1 fenced content
			await createCompleteSetup(tempDir, {
				gitignoreContent: `# Editor
.vscode/
.idea/

# Build
dist/
node_modules/
`,
			});

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.gitignoreConfigured).toBe(false);
			expect(report.issues.some((i) => i.includes(".gitignore"))).toBe(true);
		});

		test("respects RP1_ROOT environment variable", async () => {
			// Set custom RP1_ROOT
			process.env.RP1_ROOT = "custom-rp1-dir";

			// Create custom rp1 directory structure
			await mkdir(join(tempDir, "custom-rp1-dir", "context"), {
				recursive: true,
			});

			// Create instruction file with fenced content
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`<!-- rp1:start -->\nTest content\n<!-- rp1:end -->`,
				"utf-8",
			);

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			// Should find the custom directory
			expect(report.rp1DirExists).toBe(true);
		});

		test("reports issue when RP1_ROOT directory is missing", async () => {
			// Set custom RP1_ROOT that doesn't exist
			process.env.RP1_ROOT = "non-existent-dir";

			// Create other components (but not the RP1_ROOT dir)
			await writeFile(
				join(tempDir, "CLAUDE.md"),
				`<!-- rp1:start -->\nTest content\n<!-- rp1:end -->`,
				"utf-8",
			);

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.rp1DirExists).toBe(false);
			expect(report.issues.some((i) => i.includes("non-existent-dir"))).toBe(
				true,
			);
		});

		test("recognizes AGENTS.md as valid instruction file", async () => {
			// Create setup with AGENTS.md instead of CLAUDE.md
			await mkdir(join(tempDir, ".rp1", "context"), { recursive: true });
			await writeFile(
				join(tempDir, "AGENTS.md"),
				`<!-- rp1:start -->\nTest content\n<!-- rp1:end -->`,
				"utf-8",
			);

			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			expect(report.instructionFileValid).toBe(true);
		});

		test("returns plugins array in report", async () => {
			await createCompleteSetup(tempDir);

			const plugins = createPluginStatuses([true, false]);

			const report = await performHealthCheck(tempDir, plugins);

			// Report should include the plugins array
			expect(report.plugins).toEqual(plugins);
			expect(report.plugins).toHaveLength(2);
		});

		test("handles multiple issues simultaneously", async () => {
			// Create setup with multiple problems
			// - No .rp1/ directory
			// - No instruction file
			// - .gitignore without rp1 entries
			// - No plugins installed

			await writeFile(
				join(tempDir, ".gitignore"),
				`# Just editor config\n.vscode/\n`,
				"utf-8",
			);

			const plugins = createPluginStatuses([false, false]);

			const report = await performHealthCheck(tempDir, plugins);

			// All checks should fail
			expect(report.rp1DirExists).toBe(false);
			expect(report.instructionFileValid).toBe(false);
			expect(report.gitignoreConfigured).toBe(false);
			expect(report.pluginsInstalled).toBe(false);

			// Should have multiple issues
			expect(report.issues.length).toBeGreaterThanOrEqual(4);
		});

		test("returns correct health report structure", async () => {
			await createCompleteSetup(tempDir);
			const plugins = createPluginStatuses([true, true]);

			const report = await performHealthCheck(tempDir, plugins);

			// Verify structure
			expect(report).toHaveProperty("rp1DirExists");
			expect(report).toHaveProperty("instructionFileValid");
			expect(report).toHaveProperty("gitignoreConfigured");
			expect(report).toHaveProperty("pluginsInstalled");
			expect(report).toHaveProperty("plugins");
			expect(report).toHaveProperty("issues");

			// Verify types
			expect(typeof report.rp1DirExists).toBe("boolean");
			expect(typeof report.instructionFileValid).toBe("boolean");
			expect(typeof report.gitignoreConfigured).toBe("boolean");
			expect(typeof report.pluginsInstalled).toBe("boolean");
			expect(Array.isArray(report.plugins)).toBe(true);
			expect(Array.isArray(report.issues)).toBe(true);
		});
	});
});
