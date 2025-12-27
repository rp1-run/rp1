/**
 * Unit tests for FinalSummary component.
 * Tests next steps generation logic based on health report and detected tools.
 *
 * Uses ink-testing-library to render the component and verify
 * that correct next steps are displayed based on different states.
 */

import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import type { HealthReport } from "../../../../init/models.js";
import type { DetectedTool } from "../../../../init/tool-detector.js";
import { FinalSummary } from "../../../../init/ui/components/FinalSummary.js";
import {
	WIZARD_STEPS,
	type WizardState,
} from "../../../../init/ui/hooks/useWizardState.js";

/**
 * Create a mock detected tool for testing.
 */
function createMockTool(overrides: Partial<DetectedTool> = {}): DetectedTool {
	return {
		tool: {
			id: "claude-code",
			name: "Claude Code",
			binary: "claude",
			min_version: "1.0.0",
			instruction_file: "CLAUDE.md",
			install_url: "https://example.com",
			plugin_install_cmd: "claude plugin install {url}",
			capabilities: [],
		},
		version: "1.0.33",
		meetsMinVersion: true,
		...overrides,
	};
}

/**
 * Create a mock health report for testing.
 */
function createMockHealthReport(
	overrides: Partial<HealthReport> = {},
): HealthReport {
	return {
		rp1DirExists: true,
		instructionFileValid: true,
		gitignoreConfigured: true,
		pluginsInstalled: true,
		plugins: [
			{
				name: "rp1-base",
				installed: true,
				version: "1.0.0",
				location: "/path/to/rp1-base",
			},
			{
				name: "rp1-dev",
				installed: true,
				version: "1.0.0",
				location: "/path/to/rp1-dev",
			},
		],
		issues: [],
		kbExists: false,
		charterExists: false,
		...overrides,
	};
}

/**
 * Create a complete wizard state for testing.
 */
function createTestWizardState(
	overrides: Partial<WizardState> = {},
): WizardState {
	return {
		currentStepIndex: WIZARD_STEPS.length - 1,
		steps: WIZARD_STEPS.map((step) => ({
			...step,
			status: "completed" as const,
			activities: [],
		})),
		activities: [],
		detectedTools: [createMockTool()],
		healthReport: createMockHealthReport(),
		projectContext: null,
		userChoices: {},
		phase: "complete",
		error: null,
		...overrides,
	};
}

describe("FinalSummary", () => {
	describe("next steps generation - no tools detected", () => {
		test("shows install tool message when no tools detected", () => {
			const state = createTestWizardState({
				detectedTools: [],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Install an AI coding tool");
			expect(output).toContain("rp1 requires Claude Code or OpenCode");
		});

		test("early returns with only install tool step when no tools", () => {
			const state = createTestWizardState({
				detectedTools: [],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			// Should NOT contain steps that require a tool
			expect(output).not.toContain("Restart");
			expect(output).not.toContain("Build knowledge base");
		});
	});

	describe("next steps generation - tool restart", () => {
		test("always includes restart tool step when tools detected", () => {
			const state = createTestWizardState();

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Restart Claude Code to load plugins");
			expect(output).toContain("[required]");
		});

		test("uses tool name in restart message for single tool", () => {
			const openCodeTool = createMockTool({
				tool: {
					id: "opencode",
					name: "OpenCode",
					binary: "opencode",
					min_version: "0.8.0",
					instruction_file: "AGENTS.md",
					install_url: "https://example.com",
					capabilities: [],
					plugin_install_cmd: "opencode plugin install {url}",
				},
			});

			const state = createTestWizardState({
				detectedTools: [openCodeTool],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Restart OpenCode to load plugins");
		});

		test("lists multiple tools in restart message", () => {
			const claudeCodeTool = createMockTool();
			const openCodeTool = createMockTool({
				tool: {
					id: "opencode",
					name: "OpenCode",
					binary: "opencode",
					min_version: "0.8.0",
					instruction_file: "AGENTS.md",
					install_url: "https://example.com",
					capabilities: [],
					plugin_install_cmd: "opencode plugin install {url}",
				},
			});

			const state = createTestWizardState({
				detectedTools: [claudeCodeTool, openCodeTool],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain(
				"Restart Claude Code and OpenCode to load plugins",
			);
		});
	});

	describe("next steps generation - plugin issues", () => {
		test("shows manual install step when plugins not installed", () => {
			const healthReport = createMockHealthReport({
				pluginsInstalled: false,
				plugins: [
					{
						name: "rp1-base",
						installed: true,
						version: "1.0.0",
						location: "/path",
					},
					{ name: "rp1-dev", installed: false, version: null, location: null },
				],
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Manually install missing plugins");
			expect(output).toContain("rp1 install");
			expect(output).toContain("rp1-dev");
		});

		test("shows multiple missing plugins", () => {
			const healthReport = createMockHealthReport({
				pluginsInstalled: false,
				plugins: [
					{ name: "rp1-base", installed: false, version: null, location: null },
					{ name: "rp1-dev", installed: false, version: null, location: null },
				],
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("rp1-base");
			expect(output).toContain("rp1-dev");
		});
	});

	describe("next steps generation - instruction file issues", () => {
		test("shows fix instruction file step when invalid", () => {
			const healthReport = createMockHealthReport({
				instructionFileValid: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Fix instruction file configuration");
			expect(output).toContain("rp1 init");
			expect(output).toContain("[required]");
		});
	});

	describe("next steps generation - KB not built", () => {
		test("shows build KB step when KB does not exist", () => {
			const healthReport = createMockHealthReport({
				kbExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Build knowledge base");
			expect(output).toContain("/knowledge-build");
			expect(output).toContain("Analyzes your codebase");
		});

		test("does not show KB step when KB already exists", () => {
			const healthReport = createMockHealthReport({
				kbExists: true,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).not.toContain("Build knowledge base");
			expect(output).not.toContain("/knowledge-build");
		});
	});

	describe("next steps generation - charter not created", () => {
		test("shows create charter step when charter does not exist", () => {
			const healthReport = createMockHealthReport({
				charterExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Create project charter");
			expect(output).toContain("/blueprint");
			expect(output).toContain("Captures project vision");
		});

		test("does not show charter step when charter exists", () => {
			const healthReport = createMockHealthReport({
				charterExists: true,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).not.toContain("Create project charter");
			expect(output).not.toContain("/blueprint");
		});
	});

	describe("next steps generation - everything complete", () => {
		test("shows start first feature when all setup complete", () => {
			const healthReport = createMockHealthReport({
				kbExists: true,
				charterExists: true,
				pluginsInstalled: true,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Start your first feature");
			expect(output).toContain("/feature-requirements");
		});

		test("does not show start feature when setup incomplete", () => {
			const healthReport = createMockHealthReport({
				kbExists: false,
				charterExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).not.toContain("Start your first feature");
		});
	});

	describe("success/failure status", () => {
		test("shows success message when all steps completed", () => {
			const state = createTestWizardState();

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("rp1 initialized successfully!");
		});

		test("shows failure message when critical step failed", () => {
			const state = createTestWizardState({
				steps: WIZARD_STEPS.map((step) => ({
					...step,
					status: step.id === "directory-setup" ? "failed" : "completed",
					activities: [],
				})),
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("completed with issues");
		});

		test("shows failure when rp1 directory missing", () => {
			const healthReport = createMockHealthReport({
				rp1DirExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("completed with issues");
		});

		test("shows failure when instruction file invalid", () => {
			const healthReport = createMockHealthReport({
				instructionFileValid: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("completed with issues");
		});
	});

	describe("detected tools display", () => {
		test("shows detected tool with version", () => {
			const state = createTestWizardState();

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Detected Tools:");
			expect(output).toContain("Claude Code");
			expect(output).toContain("v1.0.33");
		});

		test("shows warning when no tools detected", () => {
			const state = createTestWizardState({
				detectedTools: [],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("No AI tools detected");
		});

		test("shows version warning when tool does not meet minimum", () => {
			const oldTool = createMockTool({
				version: "0.5.0",
				meetsMinVersion: false,
			});

			const state = createTestWizardState({
				detectedTools: [oldTool],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("requires >= 1.0.0");
		});

		test("shows multiple detected tools", () => {
			const claudeTool = createMockTool();
			const openCodeTool = createMockTool({
				tool: {
					id: "opencode",
					name: "OpenCode",
					binary: "opencode",
					min_version: "0.8.0",
					instruction_file: "AGENTS.md",
					install_url: "https://example.com",
					capabilities: [],
					plugin_install_cmd: "opencode plugin install {url}",
				},
				version: "0.9.0",
			});

			const state = createTestWizardState({
				detectedTools: [claudeTool, openCodeTool],
			});

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Claude Code");
			expect(output).toContain("OpenCode");
		});
	});

	describe("setup status display", () => {
		test("shows setup status checklist", () => {
			const state = createTestWizardState();

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Setup Status:");
			expect(output).toContain(".rp1/ directory");
			expect(output).toContain("Instruction file");
		});

		test("indicates KB not built status", () => {
			const healthReport = createMockHealthReport({
				kbExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Knowledge base");
			expect(output).toContain("not built");
		});

		test("indicates charter not created status", () => {
			const healthReport = createMockHealthReport({
				charterExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Project charter");
			expect(output).toContain("not created");
		});
	});

	describe("documentation link", () => {
		test("includes documentation URL", () => {
			const state = createTestWizardState();

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame();

			expect(output).toContain("Documentation: https://rp1.run");
		});
	});

	describe("next steps priority order", () => {
		test("required steps appear before optional steps", () => {
			const healthReport = createMockHealthReport({
				instructionFileValid: false,
				kbExists: false,
				charterExists: false,
			});

			const state = createTestWizardState({ healthReport });

			const { lastFrame } = render(<FinalSummary state={state} />);
			const output = lastFrame() ?? "";

			// Restart is required and should appear first (as step 1)
			const restartIndex = output.indexOf("Restart");
			const fixInstructionIndex = output.indexOf("Fix instruction");
			const buildKbIndex = output.indexOf("Build knowledge base");

			// Required steps (restart, fix instruction) should appear before optional (build KB)
			expect(restartIndex).toBeLessThan(buildKbIndex);
			expect(fixInstructionIndex).toBeLessThan(buildKbIndex);
		});
	});
});
