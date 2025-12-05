/**
 * Configuration management module for OpenCode.
 * TypeScript port of tools/install/src/rp1_opencode/config.py
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import { readFile, writeFile, mkdir, copyFile } from "fs/promises";
import { join, dirname } from "path";
import { homedir } from "os";
import type { CLIError } from "../../shared/errors.js";
import { configError } from "../../shared/errors.js";

/**
 * Create backup of existing config file.
 */
export const backupConfig = (
  configPath: string,
): TE.TaskEither<CLIError, string | null> =>
  TE.tryCatch(
    async () => {
      try {
        await readFile(configPath);
      } catch {
        return null; // No existing config
      }

      const backupDir = join(homedir(), ".opencode-rp1-backups");
      await mkdir(backupDir, { recursive: true });

      const timestamp = new Date()
        .toISOString()
        .replace(/[:.]/g, "-")
        .slice(0, 19);
      const fileName = configPath.split("/").pop() ?? "config";
      const backupPath = join(backupDir, `${fileName}.backup.${timestamp}`);

      await copyFile(configPath, backupPath);

      return backupPath;
    },
    (e) => configError(`Failed to backup config: ${e}`),
  );

/**
 * Read OpenCode configuration.
 */
export const readOpenCodeConfig = (
  configPath: string,
): TE.TaskEither<CLIError, Record<string, unknown>> =>
  TE.tryCatch(
    async () => {
      try {
        const content = await readFile(configPath, "utf-8");
        return JSON.parse(content) as Record<string, unknown>;
      } catch {
        return {};
      }
    },
    (e) => configError(`Failed to read config: ${e}`),
  );

/**
 * Update opencode.json with rp1 configuration.
 * OpenCode config only supports specific keys. Since opencode-skills plugin
 * handles skill discovery automatically, we don't need custom_tools entries.
 */
export const updateOpenCodeConfig = (
  configPath: string,
  _rp1Version: string,
  _skills: readonly string[],
): TE.TaskEither<CLIError, void> =>
  TE.tryCatch(
    async () => {
      let config: Record<string, unknown> = {};

      try {
        const content = await readFile(configPath, "utf-8");
        config = JSON.parse(content) as Record<string, unknown>;
      } catch {
        // File doesn't exist or is invalid
      }

      // Ensure plugin array exists
      if (!("plugin" in config)) {
        config.plugin = [];
      }

      // Ensure parent directory exists
      await mkdir(dirname(configPath), { recursive: true });

      // Write config (preserving existing valid keys)
      await writeFile(configPath, JSON.stringify(config, null, 2));
    },
    (e) => configError(`Failed to update config: ${e}`),
  );

/**
 * Get the default OpenCode config directory.
 */
export const getConfigDir = (): string =>
  join(homedir(), ".config", "opencode");

/**
 * Get the default OpenCode config file path.
 */
export const getConfigPath = (): string =>
  join(getConfigDir(), "opencode.json");
