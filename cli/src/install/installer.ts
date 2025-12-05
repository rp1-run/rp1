/**
 * Installer module for copying rp1 artifacts to OpenCode directories.
 * TypeScript port of tools/install/src/rp1_opencode/installer.py
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import { pipe } from "fp-ts/lib/function.js";
import {
  readdir,
  stat,
  mkdir,
  copyFile,
  writeFile,
  rm,
  chmod,
} from "fs/promises";
import { existsSync } from "fs";
import { join, relative, dirname } from "path";
import { fileURLToPath } from "url";
import { homedir } from "os";
import type { CLIError } from "../../shared/errors.js";
import { installError, backupError, formatError } from "../../shared/errors.js";
import type { BackupManifest, InstallResult } from "./models.js";

/**
 * Recursively find all files matching a pattern in a directory.
 */
const findFiles = async (dir: string, pattern: RegExp): Promise<string[]> => {
  const results: string[] = [];

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

  return results;
};

/**
 * Recursively copy a directory.
 */
const copyDir = async (src: string, dst: string): Promise<number> => {
  await mkdir(dst, { recursive: true });
  let count = 0;

  const entries = await readdir(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const dstPath = join(dst, entry.name);

    if (entry.isDirectory()) {
      count += await copyDir(srcPath, dstPath);
      await chmod(dstPath, 0o755);
    } else {
      await copyFile(srcPath, dstPath);
      await chmod(dstPath, 0o644);
      count++;
    }
  }

  return count;
};

/**
 * Copy rp1 artifacts from source to target directory.
 * Handles subdirectory namespacing (command/rp1-base/, agent/rp1-base/).
 */
export const copyArtifacts = (
  sourceDir: string,
  targetDir: string,
  onOverwrite?: (path: string) => void,
): TE.TaskEither<CLIError, number> =>
  TE.tryCatch(
    async () => {
      let filesCopied = 0;

      // Copy commands
      const commandSrc = join(sourceDir, "command");
      try {
        const stats = await stat(commandSrc);
        if (stats.isDirectory()) {
          const commandDst = join(targetDir, "command");
          await mkdir(commandDst, { recursive: true });

          const commandFiles = await findFiles(commandSrc, /\.md$/);
          for (const srcFile of commandFiles) {
            const relPath = relative(commandSrc, srcFile);
            const dstFile = join(commandDst, relPath);

            await mkdir(join(dstFile, ".."), { recursive: true });

            try {
              await stat(dstFile);
              onOverwrite?.(`command/${relPath}`);
            } catch {
              // File doesn't exist, no overwrite
            }

            await copyFile(srcFile, dstFile);
            await chmod(dstFile, 0o644);
            filesCopied++;
          }
        }
      } catch {
        // No command directory
      }

      // Copy agents
      const agentSrc = join(sourceDir, "agent");
      try {
        const stats = await stat(agentSrc);
        if (stats.isDirectory()) {
          const agentDst = join(targetDir, "agent");
          await mkdir(agentDst, { recursive: true });

          const agentFiles = await findFiles(agentSrc, /\.md$/);
          for (const srcFile of agentFiles) {
            const relPath = relative(agentSrc, srcFile);
            const dstFile = join(agentDst, relPath);

            await mkdir(join(dstFile, ".."), { recursive: true });

            try {
              await stat(dstFile);
              onOverwrite?.(`agent/${relPath}`);
            } catch {
              // File doesn't exist
            }

            await copyFile(srcFile, dstFile);
            await chmod(dstFile, 0o644);
            filesCopied++;
          }
        }
      } catch {
        // No agent directory
      }

      // Copy skills
      const skillsSrc = join(sourceDir, "skills");
      try {
        const stats = await stat(skillsSrc);
        if (stats.isDirectory()) {
          const skillsDst = join(targetDir, "skills");
          await mkdir(skillsDst, { recursive: true });

          const entries = await readdir(skillsSrc, { withFileTypes: true });
          for (const entry of entries) {
            if (entry.isDirectory()) {
              const srcSkillDir = join(skillsSrc, entry.name);
              const dstSkillDir = join(skillsDst, entry.name);

              try {
                await stat(dstSkillDir);
                onOverwrite?.(`skills/${entry.name}`);
                await rm(dstSkillDir, { recursive: true });
              } catch {
                // Doesn't exist
              }

              filesCopied += await copyDir(srcSkillDir, dstSkillDir);
            }
          }
        }
      } catch {
        // No skills directory
      }

      return filesCopied;
    },
    (e) => installError("copy-artifacts", `Failed to copy artifacts: ${e}`),
  );

/**
 * Create backup of existing rp1 installation.
 */
export const backupExistingInstallation = (): TE.TaskEither<
  CLIError,
  BackupManifest
> =>
  TE.tryCatch(
    async () => {
      const backupDir = join(homedir(), ".opencode-rp1-backups");
      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const backupPath = join(backupDir, `backup_${timestamp}`);
      await mkdir(backupPath, { recursive: true });

      const configDir = join(homedir(), ".config", "opencode");
      let filesBackedUp = 0;

      try {
        await stat(configDir);
      } catch {
        // No existing installation to backup
        return {
          timestamp,
          backupPath,
          filesBackedUp: 0,
        };
      }

      // Backup commands
      const commandDir = join(configDir, "command");
      try {
        const stats = await stat(commandDir);
        if (stats.isDirectory()) {
          const backupCommandDir = join(backupPath, "command");
          const commandFiles = await findFiles(commandDir, /\.md$/);
          for (const srcFile of commandFiles) {
            const relPath = relative(commandDir, srcFile);
            const dstFile = join(backupCommandDir, relPath);
            await mkdir(join(dstFile, ".."), { recursive: true });
            await copyFile(srcFile, dstFile);
            filesBackedUp++;
          }
        }
      } catch {
        // No commands
      }

      // Backup agents
      const agentDir = join(configDir, "agent");
      try {
        const stats = await stat(agentDir);
        if (stats.isDirectory()) {
          const backupAgentDir = join(backupPath, "agent");
          const agentFiles = await findFiles(agentDir, /\.md$/);
          for (const srcFile of agentFiles) {
            const relPath = relative(agentDir, srcFile);
            const dstFile = join(backupAgentDir, relPath);
            await mkdir(join(dstFile, ".."), { recursive: true });
            await copyFile(srcFile, dstFile);
            filesBackedUp++;
          }
        }
      } catch {
        // No agents
      }

      // Backup known rp1 skills
      const skillsDir = join(configDir, "skills");
      const rp1Skills = [
        "maestro",
        "mermaid",
        "markdown-preview",
        "knowledge-base-templates",
      ];
      try {
        const stats = await stat(skillsDir);
        if (stats.isDirectory()) {
          const backupSkillsDir = join(backupPath, "skills");
          for (const skillName of rp1Skills) {
            const skillDir = join(skillsDir, skillName);
            try {
              await stat(skillDir);
              filesBackedUp += await copyDir(
                skillDir,
                join(backupSkillsDir, skillName),
              );
            } catch {
              // Skill doesn't exist
            }
          }
        }
      } catch {
        // No skills
      }

      // Backup config file
      const configFile = join(configDir, "opencode.json");
      try {
        await copyFile(configFile, join(backupPath, "opencode.json"));
        filesBackedUp++;
      } catch {
        // No config file
      }

      // Create backup manifest
      const manifest: BackupManifest = {
        timestamp,
        backupPath,
        filesBackedUp,
      };

      await writeFile(
        join(backupPath, "manifest.json"),
        JSON.stringify(manifest, null, 2),
      );

      return manifest;
    },
    (e) => backupError(`Failed to create backup: ${e}`),
  );

/**
 * Install rp1 artifacts to OpenCode (orchestrator function).
 */
export const installRp1 = (
  pluginDirs: readonly string[],
  skipSkills: boolean = false,
  onProgress?: (message: string) => void,
  onOverwrite?: (path: string) => void,
): TE.TaskEither<CLIError, InstallResult> =>
  pipe(
    backupExistingInstallation(),
    TE.chain((backup) => {
      onProgress?.(`Backup created: ${backup.backupPath}`);

      return TE.tryCatch(
        async () => {
          const targetDir = join(homedir(), ".config", "opencode");
          const pluginsInstalled: string[] = [];
          const warnings: string[] = [];
          let totalFiles = 0;

          for (const pluginDir of pluginDirs) {
            const pluginName = pluginDir.split("/").pop() ?? "unknown";

            const result = await copyArtifacts(
              pluginDir,
              targetDir,
              onOverwrite,
            )();
            if (result._tag === "Left") {
              throw new Error(formatError(result.left, false));
            }

            const filesCopied = result.right;
            onProgress?.(
              `Installed ${pluginName} plugin: ${filesCopied} files`,
            );
            pluginsInstalled.push(pluginName);
            totalFiles += filesCopied;
          }

          if (skipSkills) {
            warnings.push("Skills installation skipped (--skip-skills flag)");
          }

          return {
            pluginsInstalled,
            filesInstalled: totalFiles,
            backupPath: backup.filesBackedUp > 0 ? backup.backupPath : null,
            warnings,
          };
        },
        (e) => installError("install", `Installation failed: ${e}`),
      );
    }),
  );

/**
 * Get the default artifacts directory.
 * Checks for bundled artifacts first, then falls back to cwd.
 */
export const getDefaultArtifactsDir = (): string => {
  // Check for bundled artifacts (when installed as npm package)
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const bundledPaths = [
    join(moduleDir, "..", "..", "dist", "opencode"), // From src/install/ -> dist/opencode
    join(moduleDir, "..", "dist", "opencode"), // Alternative structure
    join(moduleDir, "dist", "opencode"), // Direct child
  ];

  for (const bundledPath of bundledPaths) {
    if (existsSync(bundledPath)) {
      return bundledPath;
    }
  }

  // Fall back to cwd-based path (for development)
  return join(process.cwd(), "dist", "opencode");
};
