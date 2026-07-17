/**
 * Composed-prompt regression tests for interview agents.
 *
 * Exercises buildPlatformPlugin over the three interview agents
 * (charter-interviewer, blueprint-wizard, bootstrap-scaffolder) for all
 * five supported platforms: Claude Code, Codex, OpenCode, Copilot, and
 * Antigravity. Asserts:
 *
 * - Interview-loop directive replaces anti-loop on all platforms.
 * - Exactly one completion contract per platform type:
 *   Claude Code uses plain-text markers; relay platforms use relay-envelope JSON.
 * - No unconditional direct-prompt language on relay platforms.
 * - Direct-prompt phrasing retained on Claude Code builds (regression guard).
 * - Relay platforms include checkpoint protocol for durable continuations.
 * - Non-interview agents retain the generic anti-loop (blast-radius).
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createLogger } from "../../../shared/logger.js";
import { buildPlatformPlugin } from "../../build/command.js";
import { PLATFORM_DEFINITIONS } from "../../build/platform-definitions.js";
import type { BuildPlatform } from "../../build/template-context.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const logger = createLogger({ level: "error", color: false });

const INTERVIEW_AGENTS = [
	"charter-interviewer",
	"blueprint-wizard",
	"bootstrap-scaffolder",
] as const;

// Non-interview agent used for blast-radius verification.
const NON_INTERVIEW_AGENT = "feature-architect";

// Relay platforms: all platforms except Claude Code.
const RELAY_PLATFORMS: readonly BuildPlatform[] = [
	"codex",
	"opencode",
	"copilot",
	"antigravity",
];

const ALL_PLATFORMS: readonly BuildPlatform[] = [
	"claude-code",
	...RELAY_PLATFORMS,
];

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

// Checkpoint marker: present only on relay platforms (from relay-envelope shared include)
const CHECKPOINT_MARKER = "INTERVIEW_CHECKPOINT";

// Plain-text completion markers per agent (Claude Code only)
const CLAUDE_CODE_COMPLETIONS: Record<string, string> = {
	"charter-interviewer": "Charter interview complete",
	"blueprint-wizard": "PRD created at",
	"bootstrap-scaffolder": "Project scaffolded at",
};

// Direct-prompt phrasing gated by {% if platform == "claude-code" %} in agent
// role paragraphs. Must be present on Claude Code, absent on relay builds.
const DIRECT_PROMPT_PHRASES = [
	"direct charter interviews",
	"direct PRD interviews",
	"direct interview with the user",
	"You ask the user questions",
];

/**
 * Resolve the output file path for a built agent on a given platform.
 */
function agentPath(
	outputDir: string,
	platform: BuildPlatform,
	agentName: string,
): string {
	switch (platform) {
		case "claude-code":
			return join(outputDir, "dev", "agents", `${agentName}.md`);
		case "codex":
			return join(outputDir, "dev", "agents", `rp1-dev-${agentName}.toml`);
		case "opencode":
		case "antigravity":
			return join(outputDir, "dev", "agents", `rp1-dev-${agentName}.md`);
		case "copilot":
			return join(outputDir, "dev", "agents", `rp1-dev-${agentName}.agent.md`);
	}
}

describe("interview agent composition", () => {
	// Per-platform output dirs and agent content caches.
	const outputDirs = new Map<BuildPlatform, string>();
	const agentContent = new Map<BuildPlatform, Map<string, string>>();

	beforeAll(async () => {
		// Build the dev plugin for all 5 platforms in parallel.
		const builds = await Promise.all(
			ALL_PLATFORMS.map(async (platform) => {
				const dir = await createTempDir(`interview-${platform}-`);
				outputDirs.set(platform, dir);
				const result = await buildPlatformPlugin(
					"dev",
					projectRoot,
					dir,
					PLATFORM_DEFINITIONS.get(platform)!,
					logger,
					true, // jsonOutput (suppresses spinner)
				);
				expect(result.summary.errors).toHaveLength(0);
				return { platform, dir };
			}),
		);

		// Read all interview agents + the non-interview control agent.
		const agentsToRead = [...INTERVIEW_AGENTS, NON_INTERVIEW_AGENT];
		for (const { platform, dir } of builds) {
			const contentMap = new Map<string, string>();
			for (const name of agentsToRead) {
				const path = agentPath(dir, platform, name);
				contentMap.set(name, await readFile(path, "utf-8"));
			}
			agentContent.set(platform, contentMap);
		}
	}, 120000);

	afterAll(async () => {
		await Promise.all(
			[...outputDirs.values()].map((dir) => cleanupTempDir(dir)),
		);
	});

	// -----------------------------------------------------------------------
	// Claude Code: interview agents
	// -----------------------------------------------------------------------

	describe("Claude Code interview agents", () => {
		for (const agentName of INTERVIEW_AGENTS) {
			describe(agentName, () => {
				test("contains interview-loop directive, not anti-loop", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					expect(c).toContain(INTERVIEW_LOOP_HEADING);
					expect(c).toContain(INTERVIEW_LOOP_MARKER);
					expect(c).not.toContain(ANTI_LOOP_PROHIBITION);
				});

				test("contains plain-text completion contract", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					expect(c).toContain(CLAUDE_CODE_COMPLETIONS[agentName]);
				});

				test("does not contain relay envelope", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					expect(c).not.toContain(RELAY_ENVELOPE_HEADING);
					expect(c).not.toContain(RELAY_ENVELOPE_NEEDS_INPUT);
				});

				test("retains direct-prompt interaction phrasing", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					const hasDirectPrompt = DIRECT_PROMPT_PHRASES.some((phrase) =>
						c.includes(phrase),
					);
					expect(hasDirectPrompt).toBe(true);
				});
			});
		}
	});

	// -----------------------------------------------------------------------
	// Relay platforms: Codex, OpenCode, Copilot, Antigravity
	// -----------------------------------------------------------------------

	for (const platform of RELAY_PLATFORMS) {
		describe(`${platform} interview agents`, () => {
			for (const agentName of INTERVIEW_AGENTS) {
				describe(agentName, () => {
					test("contains interview-loop directive, not anti-loop", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						expect(c).toContain(INTERVIEW_LOOP_HEADING);
						expect(c).toContain(INTERVIEW_LOOP_MARKER);
						expect(c).not.toContain(ANTI_LOOP_PROHIBITION);
					});

					test("contains relay envelope with JSON completion contract", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						expect(c).toContain(RELAY_ENVELOPE_HEADING);
						expect(c).toContain(RELAY_ENVELOPE_COMPLETION);
						expect(c).toContain(RELAY_ENVELOPE_NEEDS_INPUT);
					});

					test("does not contain plain-text completion directive", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						const marker = CLAUDE_CODE_COMPLETIONS[agentName];
						expect(c).not.toContain(marker);
					});

					test("does not contain unconditional direct-prompt phrasing", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						for (const phrase of DIRECT_PROMPT_PHRASES) {
							expect(c).not.toContain(phrase);
						}
					});

					test("contains checkpoint protocol for relay continuations", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						expect(c).toContain(CHECKPOINT_MARKER);
					});
				});
			}
		});
	}

	// -----------------------------------------------------------------------
	// Blast-radius: non-interview agent retains generic anti-loop
	// -----------------------------------------------------------------------

	describe("non-interview agent blast-radius", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${NON_INTERVIEW_AGENT} on ${platform} retains anti-loop`, () => {
				const c = agentContent.get(platform)!.get(NON_INTERVIEW_AGENT)!;
				expect(c).toContain(ANTI_LOOP_HEADING);
				expect(c).toContain(ANTI_LOOP_PROHIBITION);
				expect(c).not.toContain(INTERVIEW_LOOP_HEADING);
			});
		}
	});
});
