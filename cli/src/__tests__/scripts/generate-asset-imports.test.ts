import { describe, expect, test } from "bun:test";
import {
	type AssetImport,
	collectPlatformAssets,
	type DiscoveredPlatform,
	formatAgentEntry,
} from "../../../scripts/generate-asset-imports.ts";
import type { BundleManifest } from "../../build/models.js";

function makeMinimalManifest(
	agents: BundleManifest["plugins"]["base"]["agents"],
): BundleManifest {
	return {
		plugins: {
			base: {
				name: "rp1-base",
				commands: [],
				agents,
				skills: [],
				stateMachines: [],
				verbatimFiles: [],
			},
			dev: {
				name: "rp1-dev",
				commands: [],
				agents: [],
				skills: [],
				stateMachines: [],
				verbatimFiles: [],
			},
			utils: {
				name: "rp1-utils",
				commands: [],
				agents: [],
				skills: [],
				stateMachines: [],
				verbatimFiles: [],
			},
		},
		version: "0.0.0-test",
		buildTimestamp: "2026-01-01T00:00:00Z",
	};
}

function makePlatform(manifest: BundleManifest): DiscoveredPlatform {
	return {
		name: "claude-code",
		distDir: "/tmp/test-dist/claude-code",
		manifest,
	};
}

describe("collectPlatformAssets", () => {
	test("preserves tier and effort from BundleAgentEntry", () => {
		const manifest = makeMinimalManifest([
			{
				name: "task-builder",
				path: "dev/agents/task-builder.md",
				tier: "deep",
				effort: "high",
			},
			{
				name: "speedrun-builder",
				path: "dev/agents/speedrun-builder.md",
				tier: "standard",
				effort: "medium",
			},
		]);
		const platform = makePlatform(manifest);

		const assets = collectPlatformAssets(platform);
		const agentAssets = assets.filter((a) => a.category === "agent");

		expect(agentAssets).toHaveLength(2);

		const taskBuilder = agentAssets.find(
			(a) => a.outputName === "task-builder",
		);
		expect(taskBuilder).toBeDefined();
		expect(taskBuilder!.tier).toBe("deep");
		expect(taskBuilder!.effort).toBe("high");

		const speedrunBuilder = agentAssets.find(
			(a) => a.outputName === "speedrun-builder",
		);
		expect(speedrunBuilder).toBeDefined();
		expect(speedrunBuilder!.tier).toBe("standard");
		expect(speedrunBuilder!.effort).toBe("medium");
	});

	test("omits tier and effort when not present in BundleAgentEntry", () => {
		const manifest = makeMinimalManifest([
			{ name: "generic-agent", path: "base/agents/generic.md" },
		]);
		const platform = makePlatform(manifest);

		const assets = collectPlatformAssets(platform);
		const agentAssets = assets.filter((a) => a.category === "agent");

		expect(agentAssets).toHaveLength(1);
		expect(agentAssets[0].tier).toBeUndefined();
		expect(agentAssets[0].effort).toBeUndefined();
	});

	test("preserves tier without effort and vice versa", () => {
		const manifest = makeMinimalManifest([
			{ name: "tier-only", path: "base/agents/tier-only.md", tier: "fast" },
			{
				name: "effort-only",
				path: "base/agents/effort-only.md",
				effort: "low",
			},
		]);
		const platform = makePlatform(manifest);

		const assets = collectPlatformAssets(platform);
		const agentAssets = assets.filter((a) => a.category === "agent");

		const tierOnly = agentAssets.find((a) => a.outputName === "tier-only");
		expect(tierOnly!.tier).toBe("fast");
		expect(tierOnly!.effort).toBeUndefined();

		const effortOnly = agentAssets.find((a) => a.outputName === "effort-only");
		expect(effortOnly!.tier).toBeUndefined();
		expect(effortOnly!.effort).toBe("low");
	});
});

describe("formatAgentEntry", () => {
	test("emits tier and effort in output string", () => {
		const entry: AssetImport = {
			varName: "claude_code_dev_agent_task_builder",
			importPath: "../../dist/claude-code/dev/agents/task-builder.md",
			outputName: "task-builder",
			fileName: "task-builder.md",
			category: "agent",
			plugin: "dev",
			platform: "claude-code",
			tier: "deep",
			effort: "high",
		};

		const result = formatAgentEntry(entry);

		expect(result).toContain('tier: "deep"');
		expect(result).toContain('effort: "high"');
		expect(result).toContain('name: "task-builder"');
		expect(result).toContain('fileName: "task-builder.md"');
	});

	test("omits tier and effort when not set", () => {
		const entry: AssetImport = {
			varName: "claude_code_base_agent_generic",
			importPath: "../../dist/claude-code/base/agents/generic.md",
			outputName: "generic",
			category: "agent",
			plugin: "base",
			platform: "claude-code",
		};

		const result = formatAgentEntry(entry);

		expect(result).not.toContain("tier:");
		expect(result).not.toContain("effort:");
		expect(result).toContain('name: "generic"');
	});

	test("emits tier without effort", () => {
		const entry: AssetImport = {
			varName: "claude_code_base_agent_fast_agent",
			importPath: "../../dist/claude-code/base/agents/fast-agent.md",
			outputName: "fast-agent",
			category: "agent",
			plugin: "base",
			platform: "claude-code",
			tier: "fast",
		};

		const result = formatAgentEntry(entry);

		expect(result).toContain('tier: "fast"');
		expect(result).not.toContain("effort:");
	});
});
