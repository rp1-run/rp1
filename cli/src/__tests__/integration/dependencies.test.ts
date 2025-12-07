/**
 * Integration tests for cross-plugin dependencies.
 * Tests rp1-dev's dependency on rp1-base during installation.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { join } from "path";
import { readFile, stat } from "fs/promises";
import * as E from "fp-ts/lib/Either.js";

import { copyArtifacts } from "../../install/installer.js";
import { discoverPlugins } from "../../install/manifest.js";
import {
  createTempDir,
  cleanupTempDir,
  writeFixture,
} from "../helpers/index.js";

describe("integration: dependencies", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("deps-");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  /**
   * Helper to create a mock base plugin structure.
   */
  async function setupMockBasePlugin(rootDir: string): Promise<string> {
    const baseDir = join(rootDir, "rp1-base");

    // Create manifest
    await writeFixture(
      baseDir,
      "manifest.json",
      JSON.stringify({
        plugin: "rp1-base",
        version: "1.0.0",
        generated_at: new Date().toISOString(),
        opencode_version_tested: "0.9.0",
        artifacts: {
          commands: ["knowledge-build", "knowledge-load"],
          agents: ["kb-spatial-analyzer"],
          skills: ["maestro"],
        },
      }),
    );

    // Create artifacts
    await writeFixture(
      baseDir,
      "command/rp1-base/knowledge-build.md",
      "---\ndescription: Build knowledge base\n---\nKB build content",
    );
    await writeFixture(
      baseDir,
      "command/rp1-base/knowledge-load.md",
      "---\ndescription: Load knowledge base\n---\nKB load content",
    );
    await writeFixture(
      baseDir,
      "agent/rp1-base/kb-spatial-analyzer.md",
      "---\ndescription: Spatial analyzer\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nAgent content",
    );
    await writeFixture(
      baseDir,
      "skills/maestro/SKILL.md",
      "---\nname: maestro\ndescription: Skill creation wizard for Claude Code\n---\nMaestro skill content",
    );

    return baseDir;
  }

  /**
   * Helper to create a mock dev plugin structure.
   */
  async function setupMockDevPlugin(rootDir: string): Promise<string> {
    const devDir = join(rootDir, "rp1-dev");

    // Create manifest
    await writeFixture(
      devDir,
      "manifest.json",
      JSON.stringify({
        plugin: "rp1-dev",
        version: "1.0.0",
        generated_at: new Date().toISOString(),
        opencode_version_tested: "0.9.0",
        artifacts: {
          commands: ["feature-build", "feature-verify"],
          agents: ["feature-builder"],
          skills: [],
        },
      }),
    );

    // Create artifacts with cross-plugin references
    await writeFixture(
      devDir,
      "command/rp1-dev/feature-build.md",
      "---\ndescription: Build features\n---\nRun /rp1-base/knowledge-load first\nFeature build content",
    );
    await writeFixture(
      devDir,
      "command/rp1-dev/feature-verify.md",
      "---\ndescription: Verify features\n---\nFeature verify content",
    );
    await writeFixture(
      devDir,
      "agent/rp1-dev/feature-builder.md",
      "---\ndescription: Feature builder agent\nmode: subagent\ntools:\n  bash: true\n  write: true\n  edit: true\n---\nAgent content",
    );

    return devDir;
  }

  test(
    "installing plugin with base dependency works when base is installed first",
    async () => {
      const artifactsDir = join(tempDir, "artifacts");
      const targetDir = join(tempDir, "target");

      // Set up both plugins
      const baseDir = await setupMockBasePlugin(artifactsDir);
      const devDir = await setupMockDevPlugin(artifactsDir);

      // Install base first
      const baseResult = await copyArtifacts(baseDir, targetDir)();
      expect(E.isRight(baseResult)).toBe(true);
      if (E.isRight(baseResult)) {
        expect(baseResult.right).toBeGreaterThan(0);
      }

      // Verify base artifacts installed
      const baseKbBuildStat = await stat(
        join(targetDir, "command/rp1-base/knowledge-build.md"),
      );
      expect(baseKbBuildStat.isFile()).toBe(true);

      // Install dev (depends on base)
      const devResult = await copyArtifacts(devDir, targetDir)();
      expect(E.isRight(devResult)).toBe(true);
      if (E.isRight(devResult)) {
        expect(devResult.right).toBeGreaterThan(0);
      }

      // Verify dev artifacts installed alongside base
      const devFeatureBuildStat = await stat(
        join(targetDir, "command/rp1-dev/feature-build.md"),
      );
      expect(devFeatureBuildStat.isFile()).toBe(true);

      // Both plugins' artifacts should coexist
      const baseCmdExists = await stat(
        join(targetDir, "command/rp1-base/knowledge-load.md"),
      )
        .then(() => true)
        .catch(() => false);
      const devCmdExists = await stat(
        join(targetDir, "command/rp1-dev/feature-verify.md"),
      )
        .then(() => true)
        .catch(() => false);

      expect(baseCmdExists).toBe(true);
      expect(devCmdExists).toBe(true);
    },
    { timeout: 60000 },
  );

  test(
    "cross-plugin references resolve correctly after installation",
    async () => {
      const artifactsDir = join(tempDir, "artifacts");
      const targetDir = join(tempDir, "target");

      // Set up and install both plugins
      const baseDir = await setupMockBasePlugin(artifactsDir);
      const devDir = await setupMockDevPlugin(artifactsDir);

      await copyArtifacts(baseDir, targetDir)();
      await copyArtifacts(devDir, targetDir)();

      // Read dev command that references base
      const featureBuildContent = await readFile(
        join(targetDir, "command/rp1-dev/feature-build.md"),
        "utf-8",
      );

      // Verify the cross-plugin reference is present
      expect(featureBuildContent).toContain("rp1-base/knowledge-load");

      // Verify the referenced base command exists
      const knowledgeLoadExists = await stat(
        join(targetDir, "command/rp1-base/knowledge-load.md"),
      )
        .then(() => true)
        .catch(() => false);

      expect(knowledgeLoadExists).toBe(true);
    },
    { timeout: 60000 },
  );

  test(
    "plugin discovery finds all plugins in artifacts directory",
    async () => {
      const artifactsDir = join(tempDir, "artifacts");

      // Set up both plugins
      await setupMockBasePlugin(artifactsDir);
      await setupMockDevPlugin(artifactsDir);

      // Discover plugins
      const discoverResult = await discoverPlugins(artifactsDir)();

      expect(E.isRight(discoverResult)).toBe(true);
      if (E.isRight(discoverResult)) {
        const plugins = discoverResult.right;
        expect(plugins.length).toBe(2);

        const pluginNames = plugins.map((p) => p.plugin);
        expect(pluginNames).toContain("rp1-base");
        expect(pluginNames).toContain("rp1-dev");

        // Verify artifact counts
        const basePlugin = plugins.find((p) => p.plugin === "rp1-base");
        expect(basePlugin?.commands.length).toBe(2);
        expect(basePlugin?.skills.length).toBe(1);

        const devPlugin = plugins.find((p) => p.plugin === "rp1-dev");
        expect(devPlugin?.commands.length).toBe(2);
        expect(devPlugin?.skills.length).toBe(0);
      }
    },
    { timeout: 60000 },
  );
});
