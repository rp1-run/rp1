/**
 * Composed-prompt regression tests for interview agents.
 *
 * Exercises buildPlatformPlugin over the three interview agents
 * (charter-interviewer, blueprint-wizard, bootstrap-scaffolder) for
 * Claude Code and Codex platforms. Asserts:
 *
 * - Exactly one completion contract per harness type (REQ-004).
 * - No contradictory anti-loop prohibition in interview agents (REQ-001).
 * - Non-interview agents still include the generic anti-loop (blast-radius).
 *
 * These tests fail if REQ-001 or REQ-004 regress.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/logger.js";
import { buildPlatformPlugin } from "../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const logger = createLogger({ level: "error", color: false });

const claudeCodeDef = PLATFORM_DEFINITIONS.get("claude-code")!;
const codexDef = PLATFORM_DEFINITIONS.get("codex")!;

const INTERVIEW_AGENTS = [
	"charter-interviewer",
	"blueprint-wizard",
	"bootstrap-scaffolder",
] as const;

// Non-interview agent used for blast-radius verification.
const NON_INTERVIEW_AGENT = "feature-architect";

// --- Content markers ---

// Anti-loop markers: present in the generic anti-loop.md, absent from interview-loop.md
const ANTI_LOOP_PROHIBITION = "Ask for clarification or approval";
const ANTI_LOOP_HEADING = "Anti-Loop Directive";

// Interview-loop markers: present in interview-loop.md, absent from anti-loop.md
const INTERVIEW_LOOP_HEADING = "Interview Loop Directive";
const INTERVIEW_LOOP_MARKER = "Bounded interview execution";

// Relay envelope markers: present only on relay harnesses (codex, opencode, etc.)
const RELAY_ENVELOPE_HEADING = "Relay Envelope Protocol";
const RELAY_ENVELOPE_COMPLETION = '"type": "completed"';
const RELAY_ENVELOPE_NEEDS_INPUT = '"type": "needs_input"';

// Plain-text completion markers per agent (Claude Code only)
const CLAUDE_CODE_COMPLETIONS: Record<string, string> = {
	"charter-interviewer": "Charter interview complete",
	"blueprint-wizard": "PRD created at",
	"bootstrap-scaffolder": "Project scaffolded at",
};

describe("interview agent composition", () => {
	let ccOutputDir: string;
	let codexOutputDir: string;

	// Built agent content caches, keyed by agent name.
	const ccAgentContent = new Map<string, string>();
	const codexAgentContent = new Map<string, string>();

	beforeAll(async () => {
		ccOutputDir = await createTempDir("interview-cc-");
		codexOutputDir = await createTempDir("interview-codex-");

		// Build the dev plugin for both platforms.
		const [ccResult, codexResult] = await Promise.all([
			buildPlatformPlugin(
				"dev",
				projectRoot,
				ccOutputDir,
				claudeCodeDef,
				logger,
				true, // jsonOutput (suppresses spinner)
			),
			buildPlatformPlugin(
				"dev",
				projectRoot,
				codexOutputDir,
				codexDef,
				logger,
				true,
			),
		]);

		expect(ccResult.summary.errors).toHaveLength(0);
		expect(codexResult.summary.errors).toHaveLength(0);

		// Read all interview agents + the non-interview control agent.
		const agentsToRead = [...INTERVIEW_AGENTS, NON_INTERVIEW_AGENT];

		for (const agentName of agentsToRead) {
			const ccPath = join(ccOutputDir, "dev", "agents", `${agentName}.md`);
			ccAgentContent.set(agentName, await readFile(ccPath, "utf-8"));

			const codexPath = join(
				codexOutputDir,
				"dev",
				"agents",
				`rp1-dev-${agentName}.toml`,
			);
			codexAgentContent.set(agentName, await readFile(codexPath, "utf-8"));
		}
	}, 60000);

	afterAll(async () => {
		await Promise.all([
			cleanupTempDir(ccOutputDir),
			cleanupTempDir(codexOutputDir),
		]);
	});

	// -----------------------------------------------------------------------
	// Claude Code: interview agents
	// -----------------------------------------------------------------------

	describe("Claude Code interview agents", () => {
		for (const agentName of INTERVIEW_AGENTS) {
			describe(agentName, () => {
				test("contains interview-loop directive, not anti-loop", () => {
					const content = ccAgentContent.get(agentName)!;
					expect(content).toContain(INTERVIEW_LOOP_HEADING);
					expect(content).toContain(INTERVIEW_LOOP_MARKER);
					expect(content).not.toContain(ANTI_LOOP_PROHIBITION);
				});

				test("contains plain-text completion contract", () => {
					const content = ccAgentContent.get(agentName)!;
					const marker = CLAUDE_CODE_COMPLETIONS[agentName];
					expect(content).toContain(marker);
				});

				test("does not contain relay envelope", () => {
					const content = ccAgentContent.get(agentName)!;
					expect(content).not.toContain(RELAY_ENVELOPE_HEADING);
					expect(content).not.toContain(RELAY_ENVELOPE_NEEDS_INPUT);
				});
			});
		}
	});

	// -----------------------------------------------------------------------
	// Codex: interview agents
	// -----------------------------------------------------------------------

	describe("Codex interview agents", () => {
		for (const agentName of INTERVIEW_AGENTS) {
			describe(agentName, () => {
				test("contains interview-loop directive, not anti-loop", () => {
					const content = codexAgentContent.get(agentName)!;
					expect(content).toContain(INTERVIEW_LOOP_HEADING);
					expect(content).toContain(INTERVIEW_LOOP_MARKER);
					expect(content).not.toContain(ANTI_LOOP_PROHIBITION);
				});

				test("contains relay envelope with JSON completion contract", () => {
					const content = codexAgentContent.get(agentName)!;
					expect(content).toContain(RELAY_ENVELOPE_HEADING);
					expect(content).toContain(RELAY_ENVELOPE_COMPLETION);
					expect(content).toContain(RELAY_ENVELOPE_NEEDS_INPUT);
				});

				test("does not contain plain-text completion directive", () => {
					const content = codexAgentContent.get(agentName)!;
					const marker = CLAUDE_CODE_COMPLETIONS[agentName];
					expect(content).not.toContain(marker);
				});
			});
		}
	});

	// -----------------------------------------------------------------------
	// Blast-radius: non-interview agent retains generic anti-loop
	// -----------------------------------------------------------------------

	describe("non-interview agent blast-radius", () => {
		test(`${NON_INTERVIEW_AGENT} on Claude Code retains anti-loop`, () => {
			const content = ccAgentContent.get(NON_INTERVIEW_AGENT)!;
			expect(content).toContain(ANTI_LOOP_HEADING);
			expect(content).toContain(ANTI_LOOP_PROHIBITION);
			expect(content).not.toContain(INTERVIEW_LOOP_HEADING);
		});

		test(`${NON_INTERVIEW_AGENT} on Codex retains anti-loop`, () => {
			const content = codexAgentContent.get(NON_INTERVIEW_AGENT)!;
			expect(content).toContain(ANTI_LOOP_HEADING);
			expect(content).toContain(ANTI_LOOP_PROHIBITION);
			expect(content).not.toContain(INTERVIEW_LOOP_HEADING);
		});
	});
});
