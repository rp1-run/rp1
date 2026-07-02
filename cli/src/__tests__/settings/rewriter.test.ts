/**
 * Unit tests for artifact rewriter with effort correction and protected-agent warnings.
 */

import { describe, expect, test } from "bun:test";
import {
	modelSupportsEffort,
	type RewriteAgentParams,
	rewriteAgentArtifact,
} from "../../settings/rewriter.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CC_AGENT_WITH_EFFORT = [
	"---",
	"model: opus",
	"effort: high",
	"---",
	"",
	"## Host Context",
	"",
	"This is the agent prompt body content.",
	"",
	"It should remain byte-identical after rewriting.",
].join("\n");

const CC_AGENT_NO_EFFORT = [
	"---",
	"model: haiku",
	"---",
	"",
	"## Host Context",
	"",
	"Body content without effort.",
].join("\n");

const CODEX_AGENT_WITH_EFFORT = [
	'name = "rp1-dev-feature-architect"',
	'description = "Designs features with deep architectural analysis"',
	'model = "gpt-5.5"',
	'model_reasoning_effort = "high"',
	"",
	"developer_instructions = '''",
	"This is the multiline",
	"developer instructions.",
	"",
	"It should remain verbatim after rewriting.",
	"'''",
].join("\n");

const CODEX_AGENT_NO_EFFORT = [
	'name = "rp1-dev-build-task-parser"',
	'description = "Extracts structured task information"',
	'model = "gpt-5.4-mini"',
	"",
	"developer_instructions = '''",
	"Multiline content here.",
	"'''",
].join("\n");

// ---------------------------------------------------------------------------
// Claude Code rewriting
// ---------------------------------------------------------------------------

describe("rewriteAgentArtifact - Claude Code", () => {
	test("rewrites model field in YAML frontmatter and preserves body byte-identical", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "strategic-advisor",
			newModel: "sonnet",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		// Frontmatter should contain new model
		expect(result.content).toContain("model: sonnet");
		expect(result.content).not.toContain("model: opus");
		// Body must be byte-identical
		const bodyAfterFrontmatter = result.content
			.split("---\n")
			.slice(2)
			.join("---\n");
		const originalBody = CC_AGENT_WITH_EFFORT.split("---\n")
			.slice(2)
			.join("---\n");
		expect(bodyAfterFrontmatter).toBe(originalBody);
	});

	test("preserves effort field when remapped model supports effort", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "strategic-advisor",
			newModel: "sonnet",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.content).toContain("effort: high");
		expect(result.effortAdjustment).toBeUndefined();
	});

	test("returns modified=false when model is already the target", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "strategic-advisor",
			newModel: "opus",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(false);
		expect(result.content).toBe(CC_AGENT_WITH_EFFORT);
	});

	test("handles agent without effort field", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_NO_EFFORT,
			agentName: "build-task-parser",
			newModel: "sonnet",
			originalTier: "fast",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		expect(result.content).toContain("model: sonnet");
		expect(result.content).not.toContain("effort:");
	});
});

// ---------------------------------------------------------------------------
// Codex rewriting
// ---------------------------------------------------------------------------

describe("rewriteAgentArtifact - Codex", () => {
	test("rewrites model field and preserves multiline developer_instructions", () => {
		const params: RewriteAgentParams = {
			content: CODEX_AGENT_WITH_EFFORT,
			agentName: "feature-architect",
			newModel: "gpt-5.4",
			originalTier: "deep",
			originalEffort: "high",
			platform: "codex",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		// Model should be updated
		expect(result.content).toContain('model = "gpt-5.4"');
		expect(result.content).not.toContain('model = "gpt-5.5"');
		// developer_instructions must be preserved verbatim
		const diStart = "developer_instructions = '''";
		const diEnd = "'''";
		const originalDI = CODEX_AGENT_WITH_EFFORT.slice(
			CODEX_AGENT_WITH_EFFORT.indexOf(diStart),
		);
		const resultDI = result.content.slice(result.content.indexOf(diStart));
		expect(resultDI).toBe(originalDI);
	});

	test("preserves effort field when remapped model supports effort", () => {
		const params: RewriteAgentParams = {
			content: CODEX_AGENT_WITH_EFFORT,
			agentName: "feature-architect",
			newModel: "gpt-5.4",
			originalTier: "deep",
			originalEffort: "high",
			platform: "codex",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.content).toContain('model_reasoning_effort = "high"');
		expect(result.effortAdjustment).toBeUndefined();
	});

	test("handles agent without effort field", () => {
		const params: RewriteAgentParams = {
			content: CODEX_AGENT_NO_EFFORT,
			agentName: "build-task-parser",
			newModel: "gpt-5.4",
			originalTier: "fast",
			platform: "codex",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		expect(result.content).toContain('model = "gpt-5.4"');
		expect(result.content).not.toContain("model_reasoning_effort");
	});
});

// ---------------------------------------------------------------------------
// Effort stripping
// ---------------------------------------------------------------------------

describe("effort correction", () => {
	test("strips effort when deep tier remapped to haiku (fast-class model)", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "strategic-advisor",
			newModel: "haiku",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		expect(result.content).toContain("model: haiku");
		expect(result.content).not.toContain("effort:");
		// Effort adjustment should be reported
		expect(result.effortAdjustment).toBeDefined();
		expect(result.effortAdjustment!.agentName).toBe("strategic-advisor");
		expect(result.effortAdjustment!.originalEffort).toBe("high");
		expect(result.effortAdjustment!.action).toBe("stripped");
	});

	test("strips Codex effort when remapped to fast-class model", () => {
		const params: RewriteAgentParams = {
			content: CODEX_AGENT_WITH_EFFORT,
			agentName: "feature-architect",
			newModel: "gpt-5.4-mini",
			originalTier: "deep",
			originalEffort: "high",
			platform: "codex",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(true);
		expect(result.content).toContain('model = "gpt-5.4-mini"');
		expect(result.content).not.toContain("model_reasoning_effort");
		expect(result.effortAdjustment).toBeDefined();
		expect(result.effortAdjustment!.action).toBe("stripped");
	});

	test("no effort adjustment when agent has no original effort", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_NO_EFFORT,
			agentName: "build-task-parser",
			newModel: "sonnet",
			originalTier: "fast",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.effortAdjustment).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Protected agent warnings
// ---------------------------------------------------------------------------

describe("protected agent warnings", () => {
	test("emits warning when protected agent remapped from deep to haiku", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "feature-architect",
			newModel: "haiku",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.protectedWarning).toBeDefined();
		expect(result.protectedWarning!.agentName).toBe("feature-architect");
		expect(result.protectedWarning!.message).toContain("feature-architect");
	});

	test("no warning for non-protected agent downgrade", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "some-regular-agent",
			newModel: "haiku",
			originalTier: "deep",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.protectedWarning).toBeUndefined();
	});

	test("no warning when protected agent stays at same or higher tier", () => {
		const params: RewriteAgentParams = {
			content: CC_AGENT_WITH_EFFORT,
			agentName: "feature-architect",
			newModel: "sonnet",
			originalTier: "standard",
			originalEffort: "high",
			platform: "claude-code",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.protectedWarning).toBeUndefined();
	});
});

// ---------------------------------------------------------------------------
// Platform skipping
// ---------------------------------------------------------------------------

describe("unsupported platforms", () => {
	test("skips copilot with no error", () => {
		const params: RewriteAgentParams = {
			content: "some content",
			agentName: "test-agent",
			newModel: "sonnet",
			originalTier: "deep",
			platform: "copilot",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(false);
		expect(result.content).toBe("some content");
	});

	test("skips opencode with no error", () => {
		const params: RewriteAgentParams = {
			content: "some content",
			agentName: "test-agent",
			newModel: "sonnet",
			originalTier: "deep",
			platform: "opencode",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(false);
		expect(result.content).toBe("some content");
	});

	test("skips antigravity with no error", () => {
		const params: RewriteAgentParams = {
			content: "some content",
			agentName: "test-agent",
			newModel: "sonnet",
			originalTier: "deep",
			platform: "antigravity",
		};

		const result = rewriteAgentArtifact(params);

		expect(result.modified).toBe(false);
		expect(result.content).toBe("some content");
	});
});

// ---------------------------------------------------------------------------
// modelSupportsEffort
// ---------------------------------------------------------------------------

describe("modelSupportsEffort", () => {
	test("returns false for haiku on claude-code (fast-class)", () => {
		expect(modelSupportsEffort("haiku", "claude-code")).toBe(false);
	});

	test("returns true for opus on claude-code", () => {
		expect(modelSupportsEffort("opus", "claude-code")).toBe(true);
	});

	test("returns true for sonnet on claude-code", () => {
		expect(modelSupportsEffort("sonnet", "claude-code")).toBe(true);
	});

	test("returns false for gpt-5.4-mini on codex (fast-class)", () => {
		expect(modelSupportsEffort("gpt-5.4-mini", "codex")).toBe(false);
	});

	test("returns true for gpt-5.5 on codex", () => {
		expect(modelSupportsEffort("gpt-5.5", "codex")).toBe(true);
	});

	test("returns true for unknown model (conservative: assume supports effort)", () => {
		expect(modelSupportsEffort("custom-model", "claude-code")).toBe(true);
	});
});
