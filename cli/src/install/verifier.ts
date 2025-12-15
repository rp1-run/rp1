/**
 * Installation verification module.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import { readdir, stat, readFile } from "fs/promises";
import { join } from "path";
import { homedir } from "os";
import { parse as parseYaml } from "yaml";
import type { CLIError } from "../../shared/errors.js";
import { verificationError } from "../../shared/errors.js";
import type { VerificationReport } from "./models.js";
import { discoverPlugins, getAllArtifactNames } from "./manifest.js";

/**
 * Recursively find all files matching a pattern in a directory.
 */
const findFiles = async (dir: string, pattern: RegExp): Promise<string[]> => {
  const results: string[] = [];

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        const subResults = await findFiles(fullPath, pattern);
        results.push(...subResults);
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return results;
};

/**
 * Check file health (exists, readable, valid YAML frontmatter).
 */
const checkFileHealth = async (filePath: string): Promise<string[]> => {
  const issues: string[] = [];
  const fileName = filePath.split("/").pop() ?? filePath;

  try {
    const content = await readFile(filePath, "utf-8");

    if (!content.startsWith("---")) {
      issues.push(`Missing YAML frontmatter in ${fileName}`);
      return issues;
    }

    const parts = content.split("---", 3);
    if (parts.length < 3) {
      issues.push(`Invalid frontmatter structure in ${fileName}`);
      return issues;
    }

    try {
      parseYaml(parts[1]);
    } catch (e) {
      issues.push(`Invalid YAML in ${fileName}: ${e}`);
    }
  } catch (e) {
    issues.push(`Cannot read ${fileName}: ${e}`);
  }

  return issues;
};

/**
 * Verify rp1 installation health.
 */
export const verifyInstallation = (
  artifactsDir?: string,
): TE.TaskEither<CLIError, VerificationReport> =>
  TE.tryCatch(
    async () => {
      const configDir = join(homedir(), ".config", "opencode");

      try {
        await stat(configDir);
      } catch {
        throw new Error(
          "OpenCode configuration directory not found.\nExpected: ~/.config/opencode/\nPlease install OpenCode first.",
        );
      }

      const issues: string[] = [];

      // Discover expected artifacts from manifests
      let expectedCommands: Set<string> = new Set();
      let expectedAgents: Set<string> = new Set();
      let expectedSkills: Set<string> = new Set();

      if (artifactsDir) {
        try {
          const result = await discoverPlugins(artifactsDir)();
          if (result._tag === "Right") {
            const names = getAllArtifactNames(result.right);
            expectedCommands = names.commands;
            expectedAgents = names.agents;
            expectedSkills = names.skills;
          }
        } catch {
          // Can't read manifests, use fallback counts
        }
      }

      // Fallback expected counts (6 base + 19 dev = 25 commands, 9 base + 16 dev = 25 agents)
      const commandsExpected =
        expectedCommands.size > 0 ? expectedCommands.size : 25;
      const agentsExpected = expectedAgents.size > 0 ? expectedAgents.size : 25;
      const skillsExpected = expectedSkills.size > 0 ? expectedSkills.size : 4;

      // Check commands
      const commandDir = join(configDir, "command");
      const rp1Commands = await findFiles(commandDir, /\.md$/);
      const commandsFound = rp1Commands.length;

      if (expectedCommands.size > 0) {
        const installedCommandNames = new Set(
          rp1Commands.map(
            (cmd) => cmd.split("/").pop()?.replace(".md", "") ?? "",
          ),
        );
        const missingCommands = [...expectedCommands].filter(
          (cmd) => !installedCommandNames.has(cmd),
        );
        if (missingCommands.length > 0) {
          issues.push(
            `Missing commands (${missingCommands.length}): ${missingCommands.slice(0, 5).join(", ")}${missingCommands.length > 5 ? "..." : ""}. Re-run installation to fix.`,
          );
        }
      } else if (commandsFound < commandsExpected) {
        issues.push(
          `Missing commands: found ${commandsFound}, expected ${commandsExpected}. Re-run installation to fix.`,
        );
      }

      // Validate command files
      for (const cmdFile of rp1Commands) {
        const fileIssues = await checkFileHealth(cmdFile);
        issues.push(...fileIssues);
      }

      // Check agents
      const agentDir = join(configDir, "agent");
      const rp1Agents = await findFiles(agentDir, /\.md$/);
      const agentsFound = rp1Agents.length;

      if (expectedAgents.size > 0) {
        const installedAgentNames = new Set(
          rp1Agents.map(
            (agent) => agent.split("/").pop()?.replace(".md", "") ?? "",
          ),
        );
        const missingAgents = [...expectedAgents].filter(
          (agent) => !installedAgentNames.has(agent),
        );
        if (missingAgents.length > 0) {
          issues.push(
            `Missing agents (${missingAgents.length}): ${missingAgents.slice(0, 5).join(", ")}${missingAgents.length > 5 ? "..." : ""}. Re-run installation to fix.`,
          );
        }
      } else if (agentsFound < agentsExpected) {
        issues.push(
          `Missing agents: found ${agentsFound}, expected ${agentsExpected}. Re-run installation to fix.`,
        );
      }

      // Validate agent files
      for (const agentFile of rp1Agents) {
        const fileIssues = await checkFileHealth(agentFile);
        issues.push(...fileIssues);
      }

      // Check skills
      const skillsDir = join(configDir, "skills");
      let skillsFound = 0;
      const missingSkillNames: string[] = [];

      const skillNamesToCheck =
        expectedSkills.size > 0
          ? expectedSkills
          : new Set([
              "maestro",
              "mermaid",
              "markdown-preview",
              "knowledge-base-templates",
            ]);

      for (const skillName of skillNamesToCheck) {
        const skillDir = join(skillsDir, skillName);
        const skillFile = join(skillDir, "SKILL.md");

        try {
          await stat(skillFile);
          skillsFound++;

          const fileIssues = await checkFileHealth(skillFile);
          issues.push(...fileIssues);
        } catch {
          missingSkillNames.push(skillName);
        }
      }

      if (missingSkillNames.length > 0) {
        issues.push(
          `Missing skills (${missingSkillNames.length}): ${missingSkillNames.join(", ")}. Note: Skills require opencode-skills plugin. Re-run installation to fix.`,
        );
      }

      // Check plugins
      const pluginDir = join(configDir, "plugin");
      const expectedPlugins = ["rp1-base-hooks"];
      let pluginsFound = 0;
      const missingPluginNames: string[] = [];

      for (const pluginName of expectedPlugins) {
        const pluginPath = join(pluginDir, pluginName);
        try {
          await stat(pluginPath);
          pluginsFound++;
        } catch {
          missingPluginNames.push(pluginName);
        }
      }

      if (missingPluginNames.length > 0) {
        issues.push(
          `Missing plugins (${missingPluginNames.length}): ${missingPluginNames.join(", ")}. Note: Plugins provide session hooks.`,
        );
      }

      const pluginsExpected = expectedPlugins.length;

      return {
        commandsFound,
        commandsExpected,
        agentsFound,
        agentsExpected,
        skillsFound,
        skillsExpected,
        pluginsFound,
        pluginsExpected,
        issues,
      };
    },
    (e) => verificationError(`Verification failed: ${e}`, []),
  );

/**
 * List installed rp1 commands with their metadata.
 */
export const listInstalledCommands = (): TE.TaskEither<
  CLIError,
  Array<{ plugin: string; name: string; description: string }>
> =>
  TE.tryCatch(
    async () => {
      const commandDir = join(homedir(), ".config", "opencode", "command");
      const commands: Array<{
        plugin: string;
        name: string;
        description: string;
      }> = [];

      const files = await findFiles(commandDir, /\.md$/);

      for (const file of files) {
        const name = file.split("/").pop()?.replace(".md", "") ?? "";
        let plugin = "unknown";
        let description = "No description";

        // Determine plugin from path
        if (file.includes("rp1-base")) {
          plugin = "base";
        } else if (file.includes("rp1-dev")) {
          plugin = "dev";
        }

        // Try to read description from frontmatter
        try {
          const content = await readFile(file, "utf-8");
          if (content.startsWith("---")) {
            const parts = content.split("---", 3);
            if (parts.length >= 3) {
              const frontmatter = parseYaml(parts[1]) as Record<
                string,
                unknown
              >;
              description = String(frontmatter.description ?? "No description");
            }
          }
        } catch {
          // Keep default description
        }

        commands.push({ plugin, name, description });
      }

      return commands.sort((a, b) => {
        if (a.plugin !== b.plugin) return a.plugin.localeCompare(b.plugin);
        return a.name.localeCompare(b.name);
      });
    },
    (e) => verificationError(`Failed to list commands: ${e}`, []),
  );
