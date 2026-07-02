/**
 * Unit tests for the tier remapping apply orchestrator.
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { DEFAULT_MARKETPLACE_DIR } from "../../install/claudecode/marketplace.js";
import {
	type AgentFileEntry,
	type ApplyDeps,
	applyRemappingsToAgents,
	applyTierRemappings,
	resolveConfig,
} from "../../settings/apply.js";
import { resetSettingsCache } from "../../settings/loader.js";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CC_AGENT_DEEP = [
	"---",
	"model: opus",
	"effort: high",
	"---",
	"",
	"# Feature Architect",
	"",
	"You are a feature architect.",
].join("\n");

const CC_AGENT_STANDARD = [
	"---",
	"model: sonnet",
	"---",
	"",
	"# Task Builder",
	"",
	"You are a task builder.",
].join("\n");

const CODEX_AGENT_DEEP = [
	'name = "rp1-dev-feature-architect"',
	'description = "Designs features"',
	'model = "gpt-5.5"',
	'model_reasoning_effort = "high"',
	"",
	"developer_instructions = '''",
	"This is the multiline",
	"developer instructions.",
	"'''",
].join("\n");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const createDeps = (): ApplyDeps => ({
	readFile: (path) => readFileSync(path, "utf-8"),
	writeFile: (path, content) => {
		const fs = require("node:fs");
		fs.writeFileSync(path, content, "utf-8");
	},
	fileExists: (path) => {
		const fs = require("node:fs");
		return fs.existsSync(path);
	},
	refreshClaudeCodePlugins: async () => {},
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let tempDir: string;

beforeEach(async () => {
	resetSettingsCache();
	tempDir = await createTempDir("apply");
});

afterEach(async () => {
	await cleanupTempDir(tempDir);
});

describe("applyRemappingsToAgents", () => {
	test("updates Claude Code agent model field when tier is remapped", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "sonnet" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(1);
		expect(result.applied).toBe(true);

		const updated = readFileSync(agentPath, "utf-8");
		expect(updated).toContain("model: sonnet");
		expect(updated).not.toContain("model: opus");
		expect(updated).toContain("# Feature Architect");
		expect(updated).toContain("You are a feature architect.");
	});

	test("dry-run reports changes without modifying files", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "sonnet" } },
			true,
			createDeps(),
		);

		expect(result.agentsModified).toBe(1);
		expect(result.applied).toBe(true);

		const content = readFileSync(agentPath, "utf-8");
		expect(content).toBe(CC_AGENT_DEEP);
	});

	test("skips agents with tiers not present in remapping", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/task-builder.md",
			CC_AGENT_STANDARD,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "task-builder",
				filePath: agentPath,
				tier: "standard",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "sonnet" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(0);
		expect(result.applied).toBe(false);
	});

	test("skips agents on platforms without remappings", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ codex: { deep: "gpt-5.4" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(0);
	});

	test("produces warning for unreadable agent artifact and continues", async () => {
		const goodPath = await writeFixture(
			tempDir,
			"agents/task-builder.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "broken-agent",
				filePath: "/nonexistent/path/agent.md",
				tier: "deep",
				platform: "claude-code",
			},
			{
				name: "task-builder",
				filePath: goodPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "sonnet" } },
			false,
			createDeps(),
		);

		expect(result.warnings.length).toBeGreaterThan(0);
		expect(result.warnings[0]).toContain("broken-agent");
		expect(result.agentsModified).toBe(1);
	});

	test("reports effort adjustments when remapping to fast-class model", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "haiku" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(1);
		expect(result.effortAdjustments).toHaveLength(1);
		expect(result.effortAdjustments[0].agentName).toBe("feature-architect");
		expect(result.effortAdjustments[0].action).toBe("stripped");

		const updated = readFileSync(agentPath, "utf-8");
		expect(updated).toContain("model: haiku");
		expect(updated).not.toContain("effort:");
	});

	test("reports protected agent downgrade warnings", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "haiku" } },
			false,
			createDeps(),
		);

		expect(result.protectedWarnings).toHaveLength(1);
		expect(result.protectedWarnings[0].agentName).toBe("feature-architect");
	});

	test("updates Codex TOML agent model field", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/rp1-dev-feature-architect.toml",
			CODEX_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: agentPath,
				tier: "deep",
				effort: "high",
				platform: "codex",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ codex: { deep: "gpt-5.4" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(1);
		const updated = readFileSync(agentPath, "utf-8");
		expect(updated).toContain('model = "gpt-5.4"');
		expect(updated).not.toContain('model = "gpt-5.5"');
		expect(updated).toContain("developer_instructions = '''");
	});

	test("handles multiple agents across platforms", async () => {
		const ccPath = await writeFixture(
			tempDir,
			"cc/feature-architect.md",
			CC_AGENT_DEEP,
		);
		const codexPath = await writeFixture(
			tempDir,
			"codex/rp1-dev-feature-architect.toml",
			CODEX_AGENT_DEEP,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: ccPath,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
			{
				name: "feature-architect",
				filePath: codexPath,
				tier: "deep",
				effort: "high",
				platform: "codex",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{
				"claude-code": { deep: "sonnet" },
				codex: { deep: "gpt-5.4" },
			},
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(2);
	});

	test("skips agents with inherit tier", async () => {
		const agentPath = await writeFixture(
			tempDir,
			"agents/agent.md",
			CC_AGENT_STANDARD,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "some-agent",
				filePath: agentPath,
				tier: "inherit",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "sonnet", standard: "haiku" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(0);
	});

	test("summary includes all counts across agents", async () => {
		const path1 = await writeFixture(
			tempDir,
			"agents/feature-architect.md",
			CC_AGENT_DEEP,
		);
		const path2 = await writeFixture(
			tempDir,
			"agents/task-builder.md",
			CC_AGENT_STANDARD,
		);

		const agents: AgentFileEntry[] = [
			{
				name: "feature-architect",
				filePath: path1,
				tier: "deep",
				effort: "high",
				platform: "claude-code",
			},
			{
				name: "task-builder",
				filePath: path2,
				tier: "standard",
				platform: "claude-code",
			},
		];

		const result = applyRemappingsToAgents(
			agents,
			{ "claude-code": { deep: "haiku", standard: "haiku" } },
			false,
			createDeps(),
		);

		expect(result.agentsModified).toBe(2);
		expect(result.effortAdjustments.length).toBeGreaterThanOrEqual(1);
		expect(result.protectedWarnings.length).toBeGreaterThanOrEqual(1);
	});
});

describe("resolveConfig", () => {
	test("loads config from settings.toml", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"'].join("\n"),
		);

		const { config, errors } = await resolveConfig(tempDir);
		expect(errors).toHaveLength(0);
		expect(config.platforms["claude-code"]?.deep).toBe("sonnet");
	});

	test("resolves named preset from CLI flag", async () => {
		const { config, errors } = await resolveConfig(tempDir, "budget");
		expect(errors).toHaveLength(0);
		expect(config.preset).toBe("budget");
		expect(config.platforms["claude-code"]?.deep).toBe("haiku");
		expect(config.platforms.codex?.deep).toBe("gpt-5.4-mini");
	});

	test("returns error for unknown preset", async () => {
		const { errors } = await resolveConfig(tempDir, "nonexistent");
		expect(errors.length).toBeGreaterThan(0);
		expect(errors[0]).toContain("nonexistent");
	});

	test("CLI preset replaces custom mapping entirely", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"', 'standard = "haiku"'].join(
				"\n",
			),
		);

		const { config, errors } = await resolveConfig(tempDir, "premium");
		expect(errors).toHaveLength(0);
		expect(config.platforms["claude-code"]?.deep).toBe("opus");
		expect(config.platforms["claude-code"]?.standard).toBe("sonnet");
	});

	test("settings.toml preset merges with per-platform overrides", async () => {
		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			[
				"[models]",
				'preset = "budget"',
				"",
				"[models.claude-code]",
				'deep = "sonnet"',
			].join("\n"),
		);

		const { config, errors } = await resolveConfig(tempDir);
		expect(errors).toHaveLength(0);
		expect(config.platforms["claude-code"]?.deep).toBe("sonnet");
		expect(config.platforms["claude-code"]?.standard).toBe("haiku");
	});

	test("returns empty config when no settings exist", async () => {
		const { config, errors } = await resolveConfig(tempDir);
		expect(errors).toHaveLength(0);
		expect(Object.keys(config.platforms)).toHaveLength(0);
		expect(config.preset).toBeUndefined();
	});
});

describe("applyTierRemappings - cache refresh warnings", () => {
	const emptyPlugin = {
		name: "",
		agents: [],
		commands: [],
		skills: [],
		stateMachines: [],
		verbatimFiles: [],
	};

	const minimalManifest = {
		platforms: {
			"claude-code": {
				plugins: {
					base: {
						...emptyPlugin,
						name: "rp1-base",
						agents: [
							{
								name: "feature-architect",
								path: "",
								tier: "deep",
								effort: "high",
							},
						],
					},
					dev: { ...emptyPlugin, name: "rp1-dev" },
				},
			},
		},
		version: "0.0.0-test",
		buildTimestamp: new Date().toISOString(),
	};

	test("produces warning when refreshClaudeCodePlugins throws", async () => {
		mock.module("../../assets/reader.js", () => ({
			getBundledAssets: () => E.right(minimalManifest),
			ALL_PLUGIN_KEYS: ["base", "dev", "utils"],
		}));

		await writeFixture(
			tempDir,
			".rp1/settings.toml",
			["[models.claude-code]", 'deep = "sonnet"'].join("\n"),
		);

		const expectedPath = join(
			DEFAULT_MARKETPLACE_DIR,
			"base",
			"agents",
			"feature-architect.md",
		);

		const deps: ApplyDeps = {
			readFile: (path) => {
				if (path === expectedPath) return CC_AGENT_DEEP;
				throw new Error(`unexpected read: ${path}`);
			},
			writeFile: () => {},
			fileExists: (path) => path === expectedPath,
			refreshClaudeCodePlugins: async () => {
				throw new Error("plugin cache connection refused");
			},
		};

		const result = await applyTierRemappings(
			{ projectRoot: tempDir, dryRun: false },
			deps,
		);

		expect(result.agentsModified).toBe(1);
		const refreshWarning = result.warnings.find((w) =>
			w.includes("plugin cache"),
		);
		expect(refreshWarning).toBeDefined();
		expect(refreshWarning).toContain("connection refused");
	});
});
