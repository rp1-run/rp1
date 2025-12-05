/**
 * Manifest parsing module for plugin metadata.
 * TypeScript port of tools/install/src/rp1_opencode/manifest.py
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import { pipe } from "fp-ts/lib/function.js";
import { readFile, readdir, stat } from "fs/promises";
import { join } from "path";
import type { CLIError } from "../../shared/errors.js";
import { parseError } from "../../shared/errors.js";
import type { PluginManifest } from "./models.js";

/**
 * Load and parse plugin manifest.json.
 */
export const loadManifest = (
  manifestPath: string,
): TE.TaskEither<CLIError, PluginManifest> =>
  pipe(
    TE.tryCatch(
      async () => {
        const content = await readFile(manifestPath, "utf-8");
        return JSON.parse(content) as Record<string, unknown>;
      },
      (e) => parseError(manifestPath, `Failed to read manifest: ${e}`),
    ),
    TE.chain((data) => {
      const requiredFields = [
        "plugin",
        "version",
        "generated_at",
        "opencode_version_tested",
        "artifacts",
      ];
      const missingFields = requiredFields.filter((f) => !(f in data));

      if (missingFields.length > 0) {
        return TE.left(
          parseError(
            manifestPath,
            `Manifest missing required fields: ${missingFields.join(", ")}`,
          ),
        );
      }

      const artifacts = data.artifacts as Record<string, unknown>;
      if (typeof artifacts !== "object" || artifacts === null) {
        return TE.left(
          parseError(manifestPath, "Manifest 'artifacts' must be an object"),
        );
      }

      return TE.right({
        plugin: String(data.plugin),
        version: String(data.version),
        generatedAt: String(data.generated_at),
        opencodeVersionTested: String(data.opencode_version_tested),
        commands: (artifacts.commands as string[]) ?? [],
        agents: (artifacts.agents as string[]) ?? [],
        skills: (artifacts.skills as string[]) ?? [],
      });
    }),
  );

/**
 * Discover all plugins in artifacts directory.
 * Scans for plugin directories containing manifest.json.
 */
export const discoverPlugins = (
  artifactsDir: string,
): TE.TaskEither<CLIError, readonly PluginManifest[]> =>
  pipe(
    TE.tryCatch(
      async () => {
        const entries = await readdir(artifactsDir);
        const plugins: PluginManifest[] = [];

        for (const entry of entries) {
          const pluginDir = join(artifactsDir, entry);
          const stats = await stat(pluginDir);

          if (!stats.isDirectory()) {
            continue;
          }

          const manifestPath = join(pluginDir, "manifest.json");
          try {
            const content = await readFile(manifestPath, "utf-8");
            const data = JSON.parse(content) as Record<string, unknown>;

            const artifacts = (data.artifacts ?? {}) as Record<string, unknown>;
            plugins.push({
              plugin: String(data.plugin),
              version: String(data.version),
              generatedAt: String(data.generated_at),
              opencodeVersionTested: String(data.opencode_version_tested),
              commands: (artifacts.commands as string[]) ?? [],
              agents: (artifacts.agents as string[]) ?? [],
              skills: (artifacts.skills as string[]) ?? [],
            });
          } catch {
            // Skip directories without valid manifest
          }
        }

        return plugins;
      },
      (e) => parseError(artifactsDir, `Failed to discover plugins: ${e}`),
    ),
    TE.chain((plugins) => {
      if (plugins.length === 0) {
        return TE.left(
          parseError(
            artifactsDir,
            "No plugin manifests found in artifacts directory",
          ),
        );
      }
      return TE.right(plugins);
    }),
  );

/**
 * Get expected artifact counts from manifests.
 */
export const getExpectedCounts = (
  manifests: readonly PluginManifest[],
): { commands: number; agents: number; skills: number } => {
  let commands = 0;
  let agents = 0;
  let skills = 0;

  for (const manifest of manifests) {
    commands += manifest.commands.length;
    agents += manifest.agents.length;
    skills += manifest.skills.length;
  }

  return { commands, agents, skills };
};

/**
 * Get all artifact names from manifests.
 */
export const getAllArtifactNames = (
  manifests: readonly PluginManifest[],
): { commands: Set<string>; agents: Set<string>; skills: Set<string> } => {
  const commands = new Set<string>();
  const agents = new Set<string>();
  const skills = new Set<string>();

  for (const manifest of manifests) {
    for (const cmd of manifest.commands) commands.add(cmd);
    for (const agent of manifest.agents) agents.add(agent);
    for (const skill of manifest.skills) skills.add(skill);
  }

  return { commands, agents, skills };
};
