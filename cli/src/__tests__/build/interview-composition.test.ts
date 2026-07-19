/**
 * Composed-prompt regression tests for interview agents and parent skills.
 *
 * Exercises buildPlatformPlugin over the three interview agents
 * (charter-interviewer, blueprint-wizard, bootstrap-scaffolder), parent
 * skills (bootstrap, blueprint), and a control agent for all five
 * supported platforms: Claude Code, Codex, OpenCode, Copilot, and
 * Antigravity. Asserts:
 *
 * - Interview-loop directive replaces anti-loop on all platforms.
 * - Exactly one completion contract per platform type:
 *   Claude Code uses plain-text markers; relay platforms use relay-envelope JSON.
 * - No unconditional direct-prompt language on relay platforms.
 * - Direct-prompt phrasing retained on Claude Code builds (regression guard).
 * - Relay platforms include checkpoint protocol for durable continuations.
 * - Non-interview agents retain the generic anti-loop (blast-radius).
 * - Bootstrap parent skill uses coordinator-loop (not anti-loop) on relay
 *   platforms and single-pass coordinator on Claude Code.
 * - Apply-answer-first budget enforcement text present in relay agents.
 * - Checkpoint codec with JSON escape instructions in relay agents.
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

// Parent skills read for composition assertions (bootstrap + blueprint).
const PARENT_SKILLS = ["bootstrap", "blueprint"] as const;

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

// Coordinator-loop relay markers: present in bootstrap skill on relay platforms.
const COORDINATOR_LOOP_HEADING = "Coordinator Loop Directive";
const COORDINATOR_LOOP_RELAY_MARKER = "Bounded relay coordinator";

// Coordinator non-relay markers: present in bootstrap skill on Claude Code.
const COORDINATOR_SINGLE_PASS = "Single-pass coordinator execution";

// Relay dispatch loop marker in parent skills (from dispatch_agent tag).
const RELAY_DISPATCH_LOOP = "Relay protocol";

// Apply-answer-first budget enforcement (interview agents, relay only).
const BUDGET_GATE_ONLY =
	"Budget is enforced only as a gate before asking another question";
const BUDGET_NEVER_ON_RESTORE =
	"never on checkpoint restore before the pending answer is applied";

// Checkpoint codec markers (interview agents via relay-envelope, relay only).
const CODEC_HEADING = "Checkpoint Codec";
// Literal > JSON Unicode escape — must appear instead of &gt; HTML entity.
const CODEC_GT_ESCAPE = "\\u003e";
// Codec specification rule markers (relay-envelope checkpoint codec section).
const CODEC_JSON_ESCAPE_RULE = "JSON string escaping";
const CODEC_HTML_SAFETY_RULE = "HTML comment safety";

// Apply-answer-first text (relay agents, relay checkpoint protocol).
const APPLY_ANSWER_FIRST = "Apply the answer first";

// CC coordinator narrowing markers (coordinator-loop.md CC branch).
const PRESCRIBED_PROMPTS_PERMISSION =
	"Execute every user prompt prescribed by the composing skill";
const NARROWED_PROHIBITION = "unplanned clarification questions";

// Bootstrap marker discovery and probe (bootstrap SKILL.md).
const MARKER_DISCOVERY_SCAN = "bootstrap-state read";
const SCAFFOLD_PROBE_REF = "scaffold-probe";

// Blueprint sidecar lifecycle (blueprint SKILL.md, platform-independent).
const SIDECAR_LIFECYCLE_HEADING = "Extra-Context Sidecar";
const SIDECAR_RESTORE_TEXT = "restored from the blueprint context sidecar";

// Charter-phase section bounds (blueprint SKILL.md): sidecar management is
// scoped to the PRD phase only after charter-sidecar removal (round-7 T6).
const CHARTER_PHASE_HEADING = "Step 2: Charter Phase";
const PRD_PHASE_HEADING = "Step 3: PRD Creation";

// Explicit checkpoint-strip step restated in blueprint-wizard's own
// completion procedure (round-7 T9), independent of the shared
// relay-envelope include's strip rule.
const CHECKPOINT_STRIP_STEP =
	"Strip the `INTERVIEW_CHECKPOINT` comment from the PRD artifact before returning";

// Dead checkpoint metadata removed from charter-interviewer (round-7 T8).
const REVISION_COUNT_FIELD = "revision_count";

/**
 * Count non-overlapping occurrences of a marker in a text body.
 */
function countOccurrences(text: string, marker: string): number {
	let count = 0;
	let pos = 0;
	while ((pos = text.indexOf(marker, pos)) !== -1) {
		count++;
		pos += marker.length;
	}
	return count;
}

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

/**
 * Resolve the output file path for a built skill on a given platform.
 */
function skillPath(
	outputDir: string,
	platform: BuildPlatform,
	skillName: string,
): string {
	const prefix = platform === "claude-code" ? "" : "rp1-";
	return join(outputDir, "dev", "skills", `${prefix}${skillName}`, "SKILL.md");
}

describe("interview agent composition", () => {
	// Per-platform output dirs, agent content, and skill content caches.
	const outputDirs = new Map<BuildPlatform, string>();
	const agentContent = new Map<BuildPlatform, Map<string, string>>();
	const skillContent = new Map<BuildPlatform, Map<string, string>>();

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

		// Read parent skill artifacts for composition assertions.
		for (const { platform, dir } of builds) {
			const contentMap = new Map<string, string>();
			for (const name of PARENT_SKILLS) {
				const path = skillPath(dir, platform, name);
				contentMap.set(name, await readFile(path, "utf-8"));
			}
			skillContent.set(platform, contentMap);
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

	// -----------------------------------------------------------------------
	// Bootstrap parent skill: coordinator directive composition
	// -----------------------------------------------------------------------

	describe("bootstrap parent skill coordinator directive", () => {
		for (const platform of RELAY_PLATFORMS) {
			describe(`${platform}`, () => {
				test("contains coordinator-loop relay directive", () => {
					const c = skillContent.get(platform)!.get("bootstrap")!;
					expect(c).toContain(COORDINATOR_LOOP_HEADING);
					expect(c).toContain(COORDINATOR_LOOP_RELAY_MARKER);
				});

				test("does not contain anti-loop prohibitions", () => {
					const c = skillContent.get(platform)!.get("bootstrap")!;
					expect(c).not.toContain(ANTI_LOOP_HEADING);
					expect(c).not.toContain(ANTI_LOOP_PROHIBITION);
				});

				test("contains dispatch relay-loop instructions", () => {
					const c = skillContent.get(platform)!.get("bootstrap")!;
					expect(c).toContain(RELAY_DISPATCH_LOOP);
				});
			});
		}

		describe("claude-code", () => {
			test("contains single-pass coordinator directive", () => {
				const c = skillContent.get("claude-code")!.get("bootstrap")!;
				expect(c).toContain(COORDINATOR_SINGLE_PASS);
			});

			test("does not contain relay coordinator-loop directive", () => {
				const c = skillContent.get("claude-code")!.get("bootstrap")!;
				expect(c).not.toContain(COORDINATOR_LOOP_HEADING);
				expect(c).not.toContain(COORDINATOR_LOOP_RELAY_MARKER);
			});
		});
	});

	// -----------------------------------------------------------------------
	// Budget enforcement: apply-answer-first ordering on relay platforms
	// -----------------------------------------------------------------------

	describe("relay interview agent budget enforcement", () => {
		for (const platform of RELAY_PLATFORMS) {
			for (const agentName of INTERVIEW_AGENTS) {
				test(`${agentName} on ${platform} contains apply-answer-first budget text`, () => {
					const c = agentContent.get(platform)!.get(agentName)!;
					expect(c).toContain(BUDGET_GATE_ONLY);
					expect(c).toContain(BUDGET_NEVER_ON_RESTORE);
				});
			}
		}
	});

	// -----------------------------------------------------------------------
	// Checkpoint codec: JSON escape instructions on relay platforms
	// -----------------------------------------------------------------------

	describe("relay interview agent checkpoint codec", () => {
		for (const platform of RELAY_PLATFORMS) {
			for (const agentName of INTERVIEW_AGENTS) {
				test(`${agentName} on ${platform} contains codec with JSON escape`, () => {
					const c = agentContent.get(platform)!.get(agentName)!;
					expect(c).toContain(CODEC_HEADING);
					expect(c).toContain(CODEC_GT_ESCAPE);
				});
			}
		}
	});

	// -----------------------------------------------------------------------
	// Exact-count/XOR contract assertions
	// -----------------------------------------------------------------------

	describe("exact contract counts per agent", () => {
		for (const agentName of INTERVIEW_AGENTS) {
			describe(`${agentName} on claude-code`, () => {
				test("has exactly one interview-loop interaction contract", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					expect(countOccurrences(c, INTERVIEW_LOOP_HEADING)).toBe(1);
				});

				test("has exactly one plain-text completion and no relay completion", () => {
					const c = agentContent.get("claude-code")!.get(agentName)!;
					expect(countOccurrences(c, CLAUDE_CODE_COMPLETIONS[agentName])).toBe(
						1,
					);
					expect(countOccurrences(c, RELAY_ENVELOPE_COMPLETION)).toBe(0);
				});
			});
		}

		for (const platform of RELAY_PLATFORMS) {
			for (const agentName of INTERVIEW_AGENTS) {
				describe(`${agentName} on ${platform}`, () => {
					test("has exactly one interview-loop interaction contract", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						expect(countOccurrences(c, INTERVIEW_LOOP_HEADING)).toBe(1);
					});

					test("has exactly one relay-envelope completion and no plain-text completion", () => {
						const c = agentContent.get(platform)!.get(agentName)!;
						expect(countOccurrences(c, RELAY_ENVELOPE_COMPLETION)).toBe(1);
						expect(
							countOccurrences(c, CLAUDE_CODE_COMPLETIONS[agentName]),
						).toBe(0);
					});
				});
			}
		}
	});

	// -----------------------------------------------------------------------
	// Index-order: apply-answer-first precedes budget-gate on relay agents
	// -----------------------------------------------------------------------

	describe("relay agent apply-answer-first ordering", () => {
		for (const platform of RELAY_PLATFORMS) {
			for (const agentName of INTERVIEW_AGENTS) {
				test(`${agentName} on ${platform} has apply-answer-first before budget-gate`, () => {
					const c = agentContent.get(platform)!.get(agentName)!;
					const applyIdx = c.indexOf(APPLY_ANSWER_FIRST);
					const budgetIdx = c.indexOf(BUDGET_GATE_ONLY);
					expect(applyIdx).toBeGreaterThanOrEqual(0);
					expect(budgetIdx).toBeGreaterThanOrEqual(0);
					expect(applyIdx).toBeLessThan(budgetIdx);
				});
			}
		}
	});

	// -----------------------------------------------------------------------
	// Codec round-trip: executable verification of checkpoint encoding rules
	// -----------------------------------------------------------------------

	describe("checkpoint codec round-trip", () => {
		function encodeCodec(value: unknown): string {
			const json = JSON.stringify(value);
			return json.replace(/>/g, "\\u003e");
		}

		function embedInComment(encodedJson: string): string {
			return `<!-- INTERVIEW_CHECKPOINT ${encodedJson} -->`;
		}

		function extractFromComment(comment: string): string {
			const prefix = "<!-- INTERVIEW_CHECKPOINT ";
			const suffix = " -->";
			const start = comment.indexOf(prefix) + prefix.length;
			const end = comment.lastIndexOf(suffix);
			return comment.slice(start, end);
		}

		const vectors: ReadonlyArray<{ name: string; value: unknown }> = [
			{ name: "double quotes", value: { text: 'He said "hello"' } },
			{ name: "backslashes", value: { path: "C:\\Users\\name" } },
			{ name: "newlines", value: { text: "line1\nline2" } },
			{ name: "greater-than", value: { expr: "a > b" } },
			{ name: "comment terminator", value: { html: "comment --> end" } },
			{ name: "emoji", value: { mood: "Happy \u{1F389}" } },
			{ name: "CJK", value: { greeting: "こんにちは" } },
			{
				name: "realistic checkpoint",
				value: {
					pending_question: "What language do you prefer?",
					options: ["TypeScript", "Python"],
					question_count: 3,
					revision_count: 0,
					original_args: {
						PROJECT_NAME: "my-app",
						TARGET_DIR: "/home/user/my-app",
					},
				},
			},
		];

		for (const { name, value } of vectors) {
			test(`round-trips ${name}`, () => {
				const encoded = encodeCodec(value);
				const comment = embedInComment(encoded);
				expect(encoded).not.toContain("-->");
				const extracted = extractFromComment(comment);
				const decoded = JSON.parse(extracted);
				expect(decoded).toEqual(value);
			});
		}

		test("rendered relay agents prescribe the codec rules", () => {
			for (const platform of RELAY_PLATFORMS) {
				for (const agentName of INTERVIEW_AGENTS) {
					const c = agentContent.get(platform)!.get(agentName)!;
					expect(c).toContain(CODEC_JSON_ESCAPE_RULE);
					expect(c).toContain(CODEC_HTML_SAFETY_RULE);
				}
			}
		});
	});

	// -----------------------------------------------------------------------
	// Blueprint parent-skill composition
	// -----------------------------------------------------------------------

	describe("blueprint parent skill composition", () => {
		for (const platform of RELAY_PLATFORMS) {
			test(`${platform} contains dispatch relay-loop instructions`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				expect(c).toContain(RELAY_DISPATCH_LOOP);
			});
		}

		test("claude-code does not contain dispatch relay-loop", () => {
			const c = skillContent.get("claude-code")!.get("blueprint")!;
			expect(c).not.toContain(RELAY_DISPATCH_LOOP);
		});

		for (const platform of ALL_PLATFORMS) {
			test(`${platform} contains sidecar lifecycle wording`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				expect(c).toContain(SIDECAR_LIFECYCLE_HEADING);
				expect(c).toContain(SIDECAR_RESTORE_TEXT);
			});
		}
	});

	// -----------------------------------------------------------------------
	// Bootstrap parent-skill: CC narrowing, marker discovery, probe
	// -----------------------------------------------------------------------

	describe("bootstrap CC prescribed-prompts narrowing", () => {
		test("claude-code contains prescribed-prompts permission", () => {
			const c = skillContent.get("claude-code")!.get("bootstrap")!;
			expect(c).toContain(PRESCRIBED_PROMPTS_PERMISSION);
		});

		test("claude-code contains narrowed prohibition", () => {
			const c = skillContent.get("claude-code")!.get("bootstrap")!;
			expect(c).toContain(NARROWED_PROHIBITION);
		});
	});

	describe("bootstrap marker discovery and probe-gated deletion", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${platform} contains marker-discovery scan`, () => {
				const c = skillContent.get(platform)!.get("bootstrap")!;
				expect(c).toContain(MARKER_DISCOVERY_SCAN);
			});

			test(`${platform} contains probe-gated deletion reference`, () => {
				const c = skillContent.get(platform)!.get("bootstrap")!;
				expect(c).toContain(SCAFFOLD_PROBE_REF);
			});
		}
	});

	// -----------------------------------------------------------------------
	// Round-7 fixes: charter sidecar removal, checkpoint strip step,
	// revision_count removal (REQ-001, REQ-003, REQ-005)
	// -----------------------------------------------------------------------

	describe("blueprint charter-phase sidecar removal (REQ-001)", () => {
		function charterPhaseSection(skillText: string): string {
			const start = skillText.indexOf(CHARTER_PHASE_HEADING);
			const end = skillText.indexOf(PRD_PHASE_HEADING, start);
			expect(start).toBeGreaterThanOrEqual(0);
			expect(end).toBeGreaterThan(start);
			return skillText.slice(start, end);
		}

		for (const platform of ALL_PLATFORMS) {
			test(`${platform} charter phase contains no sidecar management`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				const charterSection = charterPhaseSection(c);
				expect(charterSection.toLowerCase()).not.toContain("sidecar");
			});
		}

		for (const platform of ALL_PLATFORMS) {
			test(`${platform} retains the PRD Extra-Context Sidecar heading and restore text`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				expect(c).toContain(SIDECAR_LIFECYCLE_HEADING);
				expect(c).toContain(SIDECAR_RESTORE_TEXT);
			});
		}
	});

	describe("blueprint-wizard explicit checkpoint-strip step (REQ-003)", () => {
		for (const platform of RELAY_PLATFORMS) {
			test(`${platform} restates the INTERVIEW_CHECKPOINT strip step`, () => {
				const c = agentContent.get(platform)!.get("blueprint-wizard")!;
				expect(c).toContain(CHECKPOINT_STRIP_STEP);
			});
		}
	});

	describe("charter-interviewer dead revision_count removal (REQ-005)", () => {
		// Scoped to charter-interviewer's own checkpoint schema, ahead of the
		// shared Relay Envelope Protocol include -- that shared codec doc
		// documents revision_count generically for all relay agents and is
		// intentionally untouched (see design.md Open Risks).
		for (const platform of RELAY_PLATFORMS) {
			test(`${platform} own checkpoint schema omits revision_count`, () => {
				const c = agentContent.get(platform)!.get("charter-interviewer")!;
				// Boundary must be the include's markdown heading, not the earlier
				// prose cross-reference ("see Relay Envelope Protocol") in the
				// checkpoint procedure, so the slice covers the full own content.
				const ownSectionEnd = c.indexOf(`## ${RELAY_ENVELOPE_HEADING}`);
				expect(ownSectionEnd).toBeGreaterThan(0);
				const ownSection = c.slice(0, ownSectionEnd);
				expect(ownSection).not.toContain(REVISION_COUNT_FIELD);
			});
		}
	});

	// -----------------------------------------------------------------------
	// Round-8 fixes: extra-context persistence (M2), sidecar quoting/key
	// validation (M4), platform-independent marker selection (M3), artifact
	// status lifecycle (M5).
	// -----------------------------------------------------------------------

	describe("blueprint early extra-context persistence (M2)", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${platform} resolves extra-context (Step 1.5) before the charter phase`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				const earlyIdx = c.indexOf("Step 1.5");
				const charterIdx = c.indexOf(CHARTER_PHASE_HEADING);
				expect(earlyIdx).toBeGreaterThanOrEqual(0);
				expect(charterIdx).toBeGreaterThan(earlyIdx);
				// Retention wording covers the partial-charter exit path.
				expect(c).toContain("partial charter");
			});
		}
	});

	describe("blueprint in-prompt sidecar quoting and key validation (M4)", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${platform} quotes sidecar shell paths and relies on the §NAME-GATE key`, () => {
				const c = skillContent.get(platform)!.get("blueprint")!;
				// Sidecar CRUD is in-prompt: quoted shell paths so a spaced work
				// root is safe, the key validated as a single safe path segment,
				// and the payload written via a file-write tool (never the shell).
				expect(c).toContain("Always quote sidecar shell paths");
				expect(c).toContain("single safe path segment");
				expect(c).toContain('mkdir -p "{workRoot}/blueprint/context"');
				expect(c).toContain(
					'rm -f "{workRoot}/blueprint/context/{CONTEXT_KEY}.txt"',
				);
				expect(c).toContain("file-write tool");
				// The withdrawn CLI helper must not be referenced anywhere.
				expect(c).not.toContain("blueprint-context");
			});
		}
	});

	describe("bootstrap platform-independent marker selection (M3)", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${platform} enumerates markers as a parent-coordinator prompt`, () => {
				const c = skillContent.get(platform)!.get("bootstrap")!;
				// Round-9 M5: candidates are enumerated at runtime as a numbered
				// list, never via a compiled option tag (which would render
				// placeholder options and break selection on relay harnesses).
				expect(c).toContain("bounded numbered list");
				expect(c).toContain("PARENT-coordinator prompt");
				expect(c).toContain("Do NOT use a build-time option tag here");
			});
		}
	});

	describe("interview artifact status lifecycle (M5)", () => {
		for (const platform of ALL_PLATFORMS) {
			test(`${platform} charter-interviewer flips status to Complete on completion`, () => {
				const c = agentContent.get(platform)!.get("charter-interviewer")!;
				expect(c).toContain("**Status**: Complete");
				expect(c).toContain("stay `Draft` on any partial exit");
			});

			test(`${platform} blueprint-wizard flips status to Complete on completion`, () => {
				const c = agentContent.get(platform)!.get("blueprint-wizard")!;
				expect(c).toContain("**Status**: Complete");
			});
		}
	});
});
