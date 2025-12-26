/**
 * Unit tests for the summary step module.
 * Tests next step generation and summary display with docs URLs and blurbs.
 */

import { describe, expect, test } from "bun:test";
import type {
	HealthReport,
	InitAction,
	NextStep,
} from "../../../init/models.js";
import {
	displaySummary,
	generateNextSteps,
} from "../../../init/steps/summary.js";
import type { DetectedTool } from "../../../init/tool-detector.js";

/**
 * Helper to create a mock HealthReport.
 */
function createHealthReport(
	overrides: Partial<HealthReport> = {},
): HealthReport {
	return {
		rp1DirExists: true,
		instructionFileValid: true,
		gitignoreConfigured: true,
		pluginsInstalled: false,
		plugins: [],
		issues: [],
		kbExists: true,
		charterExists: true,
		...overrides,
	};
}

/**
 * Helper to create a mock DetectedTool.
 */
function createDetectedTool(
	name = "Claude Code",
	version = "1.0.0",
): DetectedTool {
	return {
		tool: {
			id: "claude-code",
			name,
			binary: "claude",
			min_version: "1.0.0",
			instruction_file: "CLAUDE.md",
			install_url: "https://example.com",
			plugin_install_cmd: null,
			capabilities: [],
		},
		version,
		meetsMinVersion: true,
	};
}

/**
 * Mock logger that captures output for testing.
 * Also captures console.log since displaySummary uses it directly.
 */
function createMockLogger(): {
	logger: {
		info: (msg: string) => void;
		error: (msg: string) => void;
		debug: (msg: string) => void;
		trace: (msg: string) => void;
		warn: (msg: string) => void;
		start: (msg: string) => void;
		success: (msg: string) => void;
		fail: (msg: string) => void;
		box: (msg: string) => void;
	};
	output: string[];
	restore: () => void;
} {
	const output: string[] = [];
	const originalLog = console.log;

	// Capture console.log output (used by displaySummary)
	console.log = (msg: string) => output.push(msg);

	return {
		logger: {
			info: (msg: string) => output.push(msg),
			error: (msg: string) => output.push(`ERROR: ${msg}`),
			debug: (msg: string) => output.push(`DEBUG: ${msg}`),
			trace: (msg: string) => output.push(`TRACE: ${msg}`),
			warn: (msg: string) => output.push(`WARN: ${msg}`),
			start: (msg: string) => output.push(`START: ${msg}`),
			success: (msg: string) => output.push(`SUCCESS: ${msg}`),
			fail: (msg: string) => output.push(`FAIL: ${msg}`),
			box: (msg: string) => output.push(`BOX: ${msg}`),
		},
		output,
		restore: () => {
			console.log = originalLog;
		},
	};
}

describe("summary step", () => {
	describe("generateNextSteps", () => {
		test("returns KB suggestion when kbExists is false", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, false, true);

			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			expect(kbStep).toBeDefined();
			expect(kbStep?.action).toBe("Build knowledge base");
			expect(kbStep?.required).toBe(false);
		});

		test("does not return KB suggestion when kbExists is true", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, true);

			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			expect(kbStep).toBeUndefined();
		});

		test("returns charter suggestion when charterExists is false", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, false);

			const charterStep = steps.find((s) => s.command === "/blueprint");
			expect(charterStep).toBeDefined();
			expect(charterStep?.action).toBe("Create project charter");
			expect(charterStep?.required).toBe(false);
		});

		test("does not return charter suggestion when charterExists is true", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, true);

			const charterStep = steps.find((s) => s.command === "/blueprint");
			expect(charterStep).toBeUndefined();
		});

		test("includes correct docs URL for KB suggestion", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, false, true);

			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			expect(kbStep?.docsUrl).toBe("https://rp1.run/guides/knowledge-base");
		});

		test("includes correct docs URL for charter suggestion", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, false);

			const charterStep = steps.find((s) => s.command === "/blueprint");
			expect(charterStep?.docsUrl).toBe("https://rp1.run/guides/blueprint");
		});

		test("includes correct docs URL for AI tool installation suggestion", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });

			const steps = generateNextSteps(healthReport, null, true, true);

			const installStep = steps.find((s) =>
				s.action.includes("Install an AI coding tool"),
			);
			expect(installStep?.docsUrl).toBe("https://rp1.run/installation");
		});

		test("includes correct blurb for KB suggestion", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, false, true);

			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			expect(kbStep?.blurb).toBe(
				"Analyzes your codebase for AI context awareness",
			);
		});

		test("includes correct blurb for charter suggestion", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, false);

			const charterStep = steps.find((s) => s.command === "/blueprint");
			expect(charterStep?.blurb).toBe(
				"Captures project vision to guide feature development",
			);
		});

		test("orders required steps before optional steps", () => {
			const healthReport = createHealthReport({ pluginsInstalled: true });
			const detectedTool = createDetectedTool();

			// pluginsInstalled=true generates a required restart step
			// kbExists=false, charterExists=false generate optional steps
			const steps = generateNextSteps(healthReport, detectedTool, false, false);

			// Find indices of required and optional steps
			const requiredIndices = steps
				.map((s, i) => (s.required ? i : -1))
				.filter((i) => i >= 0);
			const optionalIndices = steps
				.map((s, i) => (!s.required ? i : -1))
				.filter((i) => i >= 0);

			// All required steps should come before all optional steps
			if (requiredIndices.length > 0 && optionalIndices.length > 0) {
				const maxRequiredIndex = Math.max(...requiredIndices);
				const minOptionalIndex = Math.min(...optionalIndices);
				expect(maxRequiredIndex).toBeLessThan(minOptionalIndex);
			}
		});

		test("assigns sequential order numbers starting at 1", () => {
			const healthReport = createHealthReport({ pluginsInstalled: true });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, false, false);

			// Verify order numbers are sequential starting at 1
			steps.forEach((step, index) => {
				expect(step.order).toBe(index + 1);
			});
		});

		test("returns empty array when all conditions are satisfied", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, true);

			expect(steps).toHaveLength(0);
		});

		test("returns restart step when plugins were just installed", () => {
			const healthReport = createHealthReport({ pluginsInstalled: true });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, true, true);

			const restartStep = steps.find((s) => s.action.includes("Restart"));
			expect(restartStep).toBeDefined();
			expect(restartStep?.required).toBe(true);
		});

		test("restart step uses detected tool name", () => {
			const healthReport = createHealthReport({ pluginsInstalled: true });
			const detectedTool = createDetectedTool("OpenCode", "2.0.0");

			const steps = generateNextSteps(healthReport, detectedTool, true, true);

			const restartStep = steps.find((s) => s.action.includes("Restart"));
			expect(restartStep?.action).toContain("OpenCode");
		});

		test("returns both KB and charter suggestions when both missing", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(healthReport, detectedTool, false, false);

			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			const charterStep = steps.find((s) => s.command === "/blueprint");

			expect(kbStep).toBeDefined();
			expect(charterStep).toBeDefined();
		});

		test("handles null healthReport gracefully", () => {
			const detectedTool = createDetectedTool();

			const steps = generateNextSteps(null, detectedTool, false, false);

			// Should still generate KB and charter steps
			const kbStep = steps.find((s) => s.command === "/knowledge-build");
			const charterStep = steps.find((s) => s.command === "/blueprint");

			expect(kbStep).toBeDefined();
			expect(charterStep).toBeDefined();
		});

		test("handles null detectedTool by suggesting installation", () => {
			const healthReport = createHealthReport({ pluginsInstalled: false });

			const steps = generateNextSteps(healthReport, null, true, true);

			const installStep = steps.find((s) =>
				s.action.includes("Install an AI coding tool"),
			);
			expect(installStep).toBeDefined();
			expect(installStep?.required).toBe(true);
		});

		test("fallback to 'your AI tool' when detectedTool is null for restart", () => {
			const healthReport = createHealthReport({ pluginsInstalled: true });

			const steps = generateNextSteps(healthReport, null, true, true);

			// Since detectedTool is null, we also get the install step which is required
			// The restart step should say "your AI tool"
			const restartStep = steps.find((s) => s.action.includes("Restart"));
			expect(restartStep?.action).toContain("your AI tool");
		});
	});

	describe("displaySummary", () => {
		test("renders blurb text for steps that have blurbs", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Build knowledge base",
					command: "/knowledge-build",
					required: false,
					docsUrl: "https://rp1.run/guides/knowledge-base",
					blurb: "Analyzes your codebase for AI context awareness",
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const blurbLine = output.find((line) =>
				line.includes("Analyzes your codebase for AI context awareness"),
			);
			expect(blurbLine).toBeDefined();
		});

		test("renders docs URL for steps that have docsUrl", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Build knowledge base",
					command: "/knowledge-build",
					required: false,
					docsUrl: "https://rp1.run/guides/knowledge-base",
					blurb: "Analyzes your codebase",
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const docsLine = output.find((line) =>
				line.includes("https://rp1.run/guides/knowledge-base"),
			);
			expect(docsLine).toBeDefined();
			expect(docsLine).toContain("Docs:");
		});

		test("renders KB presence in setup status section", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ kbExists: true });
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const kbLine = output.find((line) => line.includes("Knowledge base"));
			expect(kbLine).toBeDefined();
		});

		test("renders charter presence in setup status section", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ charterExists: true });
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const charterLine = output.find((line) => line.includes("Charter"));
			expect(charterLine).toBeDefined();
		});

		test("displays Setup Status section header", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const statusHeader = output.find((line) => line.includes("Setup Status"));
			expect(statusHeader).toBeDefined();
		});

		test("renders documentation footer with rp1.run URL", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const docsFooter = output.find(
				(line) =>
					line.includes("Documentation:") && line.includes("https://rp1.run"),
			);
			expect(docsFooter).toBeDefined();
		});

		test("does not render blurb when step has no blurb", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Restart your AI tool",
					required: true,
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			// The blurb line should not exist for this step
			const outputJoined = output.join("\n");
			expect(outputJoined).not.toContain("Analyzes your codebase");
		});

		test("does not render docs URL when step has no docsUrl", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport({ pluginsInstalled: false });
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Restart your AI tool",
					required: true,
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			// Should not have "Docs:" followed by the restart step (which has no docs URL)
			const linesAfterRestart: string[] = [];
			let foundRestart = false;
			for (const line of output) {
				if (line.includes("Restart")) {
					foundRestart = true;
				} else if (foundRestart && line.includes("Docs:")) {
					linesAfterRestart.push(line);
					break;
				} else if (foundRestart && line.trim() === "") {
					break;
				}
			}
			// There should be no Docs: line immediately after the restart step
			expect(linesAfterRestart).toHaveLength(0);
		});

		test("renders required step marker correctly", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Test required action",
					required: true,
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const requiredLine = output.find(
				(line) =>
					line.includes("Test required action") && line.includes("[required]"),
			);
			expect(requiredLine).toBeDefined();
		});

		test("renders optional step without required tag", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Test optional action",
					required: false,
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const optionalLine = output.find((line) =>
				line.includes("Test optional action"),
			);
			expect(optionalLine).toBeDefined();
			expect(optionalLine).not.toContain("[required]");
		});

		test("renders command in cyan for steps with commands", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [
				{
					order: 1,
					action: "Build knowledge base",
					command: "/knowledge-build",
					required: false,
				},
			];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const cmdLine = output.find((line) => line.includes("/knowledge-build"));
			expect(cmdLine).toBeDefined();
		});

		test("handles null healthReport gracefully", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			// Should not throw
			expect(() => {
				displaySummary(actions, null, nextSteps, [detectedTool], logger, false);
			}).not.toThrow();

			// Should still render header and footer
			expect(
				output.some((line) => line.includes("rp1 Initialization Summary")),
			).toBe(true);
		});

		test("handles null detectedTool gracefully", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];

			// Should not throw
			expect(() => {
				displaySummary(actions, healthReport, nextSteps, [], logger, false);
			}).not.toThrow();

			// Should still render header and footer
			expect(
				output.some((line) => line.includes("rp1 Initialization Summary")),
			).toBe(true);
		});

		test("renders detected tool with version", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool("Claude Code", "1.0.33");

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const toolLine = output.find(
				(line) => line.includes("Claude Code") && line.includes("v1.0.33"),
			);
			expect(toolLine).toBeDefined();
		});

		test("renders (version unknown) when tool version is unknown", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly [] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool("Claude Code", "unknown");

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const toolLine = output.find(
				(line) =>
					line.includes("Claude Code") && line.includes("(version unknown)"),
			);
			expect(toolLine).toBeDefined();
		});

		test("renders created count for directory and file actions", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [
				{ type: "created_directory", path: ".rp1" },
				{ type: "created_file", path: "CLAUDE.md" },
				{ type: "created_directory", path: ".rp1/context" },
			];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const createdLine = output.find((line) => line.includes("3 created"));
			expect(createdLine).toBeDefined();
		});

		test("renders updated count for file updates", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [
				{ type: "updated_file", path: "CLAUDE.md" },
				{ type: "updated_file", path: ".gitignore" },
			];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const updatedLine = output.find((line) => line.includes("2 updated"));
			expect(updatedLine).toBeDefined();
		});

		test("renders installed count for plugin installations", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [
				{ type: "plugin_installed", name: "rp1-base", version: "1.0.0" },
				{ type: "plugin_updated", name: "rp1-dev", version: "1.0.1" },
			];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const installedLine = output.find((line) =>
				line.includes("2 plugins installed"),
			);
			expect(installedLine).toBeDefined();
		});

		test("renders failed count for failures", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [
				{
					type: "plugin_install_failed",
					name: "rp1-base",
					error: "Network error",
				},
				{ type: "verification_failed", component: "plugins", issue: "Missing" },
			];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const failedLine = output.find((line) => line.includes("2 failed"));
			expect(failedLine).toBeDefined();
		});

		test("renders No changes made when no actions occurred", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			const noChangesLine = output.find((line) =>
				line.includes("No changes made"),
			);
			expect(noChangesLine).toBeDefined();
		});

		test("renders multiple action types in single summary", () => {
			const { logger, output } = createMockLogger();
			const actions: readonly InitAction[] = [
				{ type: "created_directory", path: ".rp1" },
				{ type: "created_file", path: "CLAUDE.md" },
				{ type: "updated_file", path: ".gitignore" },
				{ type: "plugin_installed", name: "rp1-base", version: "1.0.0" },
			];
			const healthReport = createHealthReport();
			const nextSteps: NextStep[] = [];
			const detectedTool = createDetectedTool();

			displaySummary(
				actions,
				healthReport,
				nextSteps,
				[detectedTool],
				logger,
				false,
			);

			expect(output.find((line) => line.includes("2 created"))).toBeDefined();
			expect(output.find((line) => line.includes("1 updated"))).toBeDefined();
			expect(
				output.find((line) => line.includes("1 plugins installed")),
			).toBeDefined();
		});
	});
});
