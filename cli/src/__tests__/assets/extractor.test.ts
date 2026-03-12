/**
 * Unit tests for extractor.ts - Asset extraction.
 * Tests rp1's extraction logic, not filesystem APIs.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
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

				const agentPath = join(targetDir, "agents", "rp1-base-test-agent.md");
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

				const agent1Path = join(targetDir, "agents", "rp1-base-agent-one.md");
				const agent2Path = join(targetDir, "agents", "rp1-base-agent-two.md");

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

		test("legacy generated files migrate to flat names during extraction", async () => {
			const mockAgent = join(tempDir, "mock-agent.md");
			await Bun.write(mockAgent, "# New Agent");

			const targetDir = join(tempDir, "opencode");

			// Create legacy subdirectory with a known agent
			await mkdir(join(targetDir, "agents", "rp1-base"), { recursive: true });
			await writeFile(
				join(targetDir, "agents", "rp1-base", "test-agent.md"),
				"Old content",
			);

			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [{ name: "test-agent", path: mockAgent }],
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

			await extractPlugins(mockAssets, targetDir)();

			// Legacy file removed
			const legacyExists = await stat(
				join(targetDir, "agents", "rp1-base", "test-agent.md"),
			)
				.then(() => true)
				.catch(() => false);
			expect(legacyExists).toBe(false);

			// Flat file installed
			const flatContent = await readFile(
				join(targetDir, "agents", "rp1-base-test-agent.md"),
				"utf-8",
			);
			expect(flatContent).toContain("New Agent");
		});

		test("extra user files in legacy dirs survive extraction", async () => {
			const mockAgent = join(tempDir, "mock-agent.md");
			await Bun.write(mockAgent, "# Agent");

			const targetDir = join(tempDir, "opencode");

			// Create legacy dir with known + unknown files
			await mkdir(join(targetDir, "agents", "rp1-base"), { recursive: true });
			await writeFile(
				join(targetDir, "agents", "rp1-base", "test-agent.md"),
				"Known",
			);
			await writeFile(
				join(targetDir, "agents", "rp1-base", "my-custom.md"),
				"User custom",
			);

			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [{ name: "test-agent", path: mockAgent }],
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

			await extractPlugins(mockAssets, targetDir)();

			// User file survives
			const userContent = await readFile(
				join(targetDir, "agents", "rp1-base", "my-custom.md"),
				"utf-8",
			);
			expect(userContent).toBe("User custom");

			// Legacy dir still exists
			const dirExists = await stat(join(targetDir, "agents", "rp1-base"))
				.then((s) => s.isDirectory())
				.catch(() => false);
			expect(dirExists).toBe(true);
		});

		test("legacy dir deleted only when empty after migration", async () => {
			const mockAgent1 = join(tempDir, "a1.md");
			const mockAgent2 = join(tempDir, "a2.md");
			await Bun.write(mockAgent1, "# A1");
			await Bun.write(mockAgent2, "# A2");

			const targetDir = join(tempDir, "opencode");

			// Legacy dir with only known agents
			await mkdir(join(targetDir, "agents", "rp1-base"), { recursive: true });
			await writeFile(
				join(targetDir, "agents", "rp1-base", "agent-a.md"),
				"Old A",
			);
			await writeFile(
				join(targetDir, "agents", "rp1-base", "agent-b.md"),
				"Old B",
			);

			const mockAssets: BundledAssets = {
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [
							{ name: "agent-a", path: mockAgent1 },
							{ name: "agent-b", path: mockAgent2 },
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

			await extractPlugins(mockAssets, targetDir)();

			// Legacy dir removed (was empty after migration)
			const dirExists = await stat(join(targetDir, "agents", "rp1-base"))
				.then(() => true)
				.catch(() => false);
			expect(dirExists).toBe(false);

			// Flat files installed
			const a1 = await readFile(
				join(targetDir, "agents", "rp1-base-agent-a.md"),
				"utf-8",
			);
			expect(a1).toContain("A1");
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
