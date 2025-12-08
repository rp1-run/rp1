/**
 * Unit tests for extractor.ts - Asset extraction.
 * Tests rp1's extraction logic, not filesystem APIs.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import * as E from "fp-ts/lib/Either.js";

import {
  extractPlugins,
  getWebUICacheDir,
} from "../../assets/extractor.js";
import type { BundledAssets } from "../../assets/reader.js";
import { createTempDir, cleanupTempDir } from "../helpers/index.js";

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
      // Create mock embedded files in temp dir for this test
      const mockCommandPath = join(tempDir, "mock-command.md");
      const mockAgentPath = join(tempDir, "mock-agent.md");
      const mockSkillPath = join(tempDir, "mock-skill.md");

      await Bun.write(mockCommandPath, "# Mock Command\nTest content");
      await Bun.write(mockAgentPath, "# Mock Agent\nTest content");
      await Bun.write(mockSkillPath, "# Mock Skill\nTest content");

      const mockAssets: BundledAssets = {
        plugins: {
          base: {
            name: "rp1-base",
            commands: [{ name: "test-cmd", path: mockCommandPath }],
            agents: [{ name: "test-agent", path: mockAgentPath }],
            skills: [{ name: "test-skill", path: mockSkillPath }],
          },
          dev: {
            name: "rp1-dev",
            commands: [],
            agents: [],
            skills: [],
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
        expect(extraction.filesExtracted).toBe(3);
        expect(extraction.plugins).toContain("rp1-base");
        expect(extraction.plugins).toContain("rp1-dev");

        // Verify directory structure matches OpenCode requirements
        const commandPath = join(targetDir, "command", "rp1-base", "test-cmd.md");
        const agentPath = join(targetDir, "agent", "rp1-base", "test-agent.md");
        const skillPath = join(targetDir, "skills", "test-skill", "SKILL.md");

        const cmdStat = await stat(commandPath);
        const agentStat = await stat(agentPath);
        const skillStat = await stat(skillPath);

        expect(cmdStat.isFile()).toBe(true);
        expect(agentStat.isFile()).toBe(true);
        expect(skillStat.isFile()).toBe(true);

        // Verify content was correctly extracted
        const cmdContent = await readFile(commandPath, "utf-8");
        expect(cmdContent).toContain("Mock Command");
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
          },
          dev: {
            name: "rp1-dev",
            commands: [],
            agents: [],
            skills: [],
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

    test("handles multiple commands and agents per plugin", async () => {
      const mockCmd1 = join(tempDir, "cmd1.md");
      const mockCmd2 = join(tempDir, "cmd2.md");
      const mockAgent1 = join(tempDir, "agent1.md");

      await Bun.write(mockCmd1, "# Command 1");
      await Bun.write(mockCmd2, "# Command 2");
      await Bun.write(mockAgent1, "# Agent 1");

      const mockAssets: BundledAssets = {
        plugins: {
          base: {
            name: "rp1-base",
            commands: [
              { name: "cmd-one", path: mockCmd1 },
              { name: "cmd-two", path: mockCmd2 },
            ],
            agents: [{ name: "agent-one", path: mockAgent1 }],
            skills: [],
          },
          dev: {
            name: "rp1-dev",
            commands: [],
            agents: [],
            skills: [],
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
        expect(result.right.filesExtracted).toBe(3);

        // Both commands should exist
        const cmd1Path = join(targetDir, "command", "rp1-base", "cmd-one.md");
        const cmd2Path = join(targetDir, "command", "rp1-base", "cmd-two.md");

        const cmd1Exists = await stat(cmd1Path).then(() => true).catch(() => false);
        const cmd2Exists = await stat(cmd2Path).then(() => true).catch(() => false);

        expect(cmd1Exists).toBe(true);
        expect(cmd2Exists).toBe(true);
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
