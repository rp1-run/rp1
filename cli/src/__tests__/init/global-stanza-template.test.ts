import { describe, expect, test } from "bun:test";
import {
	buildGlobalStanzaContent,
	LATEST_FENCE_VERSION,
} from "../../init/global-stanza-template.js";

describe("LATEST_FENCE_VERSION", () => {
	test("is a semver string without v prefix", () => {
		expect(LATEST_FENCE_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
	});
});

describe("buildGlobalStanzaContent", () => {
	describe("shared KB section (all platforms)", () => {
		const platforms = [
			"claude-code",
			"codex",
			"opencode",
			"copilot",
			"antigravity",
		];

		for (const platform of platforms) {
			test(`${platform} includes KB progressive disclosure pattern`, () => {
				const content = buildGlobalStanzaContent(platform);
				expect(content).toContain("## rp1 Knowledge Base");
				expect(content).toContain("Progressive Disclosure Pattern");
			});

			test(`${platform} uses rp1-root-dir for path discovery`, () => {
				const content = buildGlobalStanzaContent(platform);
				expect(content).toContain("rp1 agent-tools rp1-root-dir");
			});

			test(`${platform} does not contain hardcoded .rp1/context/ paths`, () => {
				const content = buildGlobalStanzaContent(platform);
				expect(content).not.toContain("`.rp1/context/`");
				expect(content).not.toContain("'.rp1/context/'");
			});

			test(`${platform} lists all five KB files`, () => {
				const content = buildGlobalStanzaContent(platform);
				expect(content).toContain("index.md");
				expect(content).toContain("architecture.md");
				expect(content).toContain("modules.md");
				expect(content).toContain("patterns.md");
				expect(content).toContain("concept_map.md");
			});

			test(`${platform} includes loading rules`, () => {
				const content = buildGlobalStanzaContent(platform);
				expect(content).toContain("Code review: patterns.md");
				expect(content).toContain(
					"Bug investigation: architecture.md, modules.md",
				);
				expect(content).toContain("Feature work: modules.md, patterns.md");
			});
		}
	});

	describe("claude-code platform", () => {
		test("includes skill awareness section", () => {
			const content = buildGlobalStanzaContent("claude-code");
			expect(content).toContain("## rp1 Skill Awareness");
			expect(content).toContain("/guide");
		});

		test("does not include codex conventions", () => {
			const content = buildGlobalStanzaContent("claude-code");
			expect(content).not.toContain("Task shorthand");
			expect(content).not.toContain("Subagent waiting");
		});
	});

	describe("codex platform", () => {
		test("includes codex conventions section", () => {
			const content = buildGlobalStanzaContent("codex");
			expect(content).toContain("Codex agent conventions");
			expect(content).toContain("Task shorthand");
			expect(content).toContain("Subagent waiting");
		});

		test("does not include skill awareness section", () => {
			const content = buildGlobalStanzaContent("codex");
			expect(content).not.toContain("## rp1 Skill Awareness");
		});
	});

	describe("default platform (opencode, copilot, antigravity, unknown)", () => {
		test("opencode gets skill awareness, not codex conventions", () => {
			const content = buildGlobalStanzaContent("opencode");
			expect(content).toContain("## rp1 Skill Awareness");
			expect(content).not.toContain("Codex agent conventions");
		});

		test("copilot gets skill awareness, not codex conventions", () => {
			const content = buildGlobalStanzaContent("copilot");
			expect(content).toContain("## rp1 Skill Awareness");
			expect(content).not.toContain("Codex agent conventions");
		});

		test("antigravity gets skill awareness, not codex conventions", () => {
			const content = buildGlobalStanzaContent("antigravity");
			expect(content).toContain("## rp1 Skill Awareness");
			expect(content).not.toContain("Codex agent conventions");
		});

		test("unknown platform falls through to default (skill awareness)", () => {
			const content = buildGlobalStanzaContent("future-platform");
			expect(content).toContain("## rp1 Knowledge Base");
			expect(content).toContain("## rp1 Skill Awareness");
		});
	});
});
