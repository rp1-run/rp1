/**
 * Unit tests for extractor.ts - Asset extraction.
 * Tests rp1's extraction logic, not filesystem APIs.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import { extractPlugins, getWebUICacheDir } from "../../assets/extractor.js";
import type { BundledAssets } from "../../assets/reader.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

describe("extractor", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("extractor-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("extractPlugins", () => {
		test("creates correct OpenCode directory structure", async () => {
			const mockAgentPath = join(tempDir, "mock-agent.md");
			const mockSkillPath = join(tempDir, "mock-skill.md");

			await Bun.write(mockAgentPath, "# Mock Agent\nTest content");
			await Bun.write(mockSkillPath, "# Mock Skill\nTest content");

			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [{ name: "test-agent", path: mockAgentPath }],
						skills: [{ name: "rp1-test-skill/SKILL.md", path: mockSkillPath }],
						stateMachines: [],
					},
					dev: {
						name: "rp1-dev",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
					utils: {
						name: "rp1-utils",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
				},
				webui: [],
				version: "1.0.0",
				buildTimestamp: new Date().toISOString(),
			};

			const targetDir = join(tempDir, "opencode");
			const result = await extractPlugins(mockAssets, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				const extraction = result.right;
				expect(extraction.filesExtracted).toBe(2);
				expect(extraction.plugins).toContain("rp1-base");
				expect(extraction.plugins).toContain("rp1-dev");

				const agentPath = join(
					targetDir,
					"agents",
					"rp1-base",
					"test-agent.md",
				);
				const skillPath = join(
					targetDir,
					"skills",
					"rp1-test-skill",
					"SKILL.md",
				);

				const agentStat = await stat(agentPath);
				const skillStat = await stat(skillPath);

				expect(agentStat.isFile()).toBe(true);
				expect(skillStat.isFile()).toBe(true);

				const agentContent = await readFile(agentPath, "utf-8");
				expect(agentContent).toContain("Mock Agent");
			}
		});

		test("reports progress via callback", async () => {
			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
					dev: {
						name: "rp1-dev",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
					utils: {
						name: "rp1-utils",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
				},
				webui: [],
				version: "1.0.0",
				buildTimestamp: new Date().toISOString(),
			};

			const targetDir = join(tempDir, "opencode");
			const progressMessages: string[] = [];

			await extractPlugins(mockAssets, targetDir, (msg) =>
				progressMessages.push(msg),
			)();

			expect(progressMessages.length).toBeGreaterThan(0);
			expect(progressMessages.some((m) => m.includes("Extracting"))).toBe(true);
		});

		test("handles multiple agents per plugin", async () => {
			const mockAgent1 = join(tempDir, "agent1.md");
			const mockAgent2 = join(tempDir, "agent2.md");

			await Bun.write(mockAgent1, "# Agent 1");
			await Bun.write(mockAgent2, "# Agent 2");

			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [
							{ name: "agent-one", path: mockAgent1 },
							{ name: "agent-two", path: mockAgent2 },
						],
						skills: [],
						stateMachines: [],
					},
					dev: {
						name: "rp1-dev",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
					utils: {
						name: "rp1-utils",
						commands: [],
						agents: [],
						skills: [],
						stateMachines: [],
					},
				},
				webui: [],
				version: "1.0.0",
				buildTimestamp: new Date().toISOString(),
			};

			const targetDir = join(tempDir, "opencode");
			const result = await extractPlugins(mockAssets, targetDir)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right.filesExtracted).toBe(2);

				const agent1Path = join(
					targetDir,
					"agents",
					"rp1-base",
					"agent-one.md",
				);
				const agent2Path = join(
					targetDir,
					"agents",
					"rp1-base",
					"agent-two.md",
				);

				const agent1Exists = await stat(agent1Path)
					.then(() => true)
					.catch(() => false);
				const agent2Exists = await stat(agent2Path)
					.then(() => true)
					.catch(() => false);

				expect(agent1Exists).toBe(true);
				expect(agent2Exists).toBe(true);
			}
		});
	});

	describe("getWebUICacheDir", () => {
		test("returns path under ~/.rp1/", () => {
			const cacheDir = getWebUICacheDir();

			expect(cacheDir).toContain(".rp1");
			expect(cacheDir).toContain("web-ui");
		});
	});
});
