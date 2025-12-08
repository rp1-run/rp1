/**
 * CLI entry point for install commands.
 * Implements install:opencode, verify, and list commands.
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { join } from "path";
import { stat } from "fs/promises";
import type { Logger } from "../../shared/logger.js";
import type { CLIError } from "../../shared/errors.js";
import { usageError } from "../../shared/errors.js";
import { confirmAction } from "../../shared/prompts.js";
import { isHealthy } from "./models.js";
import {
  checkOpenCodeInstalled,
  checkOpenCodeVersion,
  checkOpenCodeSkillsPlugin,
  checkWritePermissions,
  getOpenCodeConfigDir,
  installOpenCodeSkillsPlugin,
} from "./prerequisites.js";
import { discoverPlugins } from "./manifest.js";
import { installRp1, getDefaultArtifactsDir } from "./installer.js";
import { verifyInstallation, listInstalledCommands } from "./verifier.js";
import { updateOpenCodeConfig, getConfigPath } from "./config.js";
import {
  hasBundledAssets,
  getBundledAssets,
  extractPlugins,
} from "../assets/index.js";

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export interface InstallArgs {
  artifactsDir: string | null;
  skipSkills: boolean;
  dryRun: boolean;
  yes: boolean;
}

export interface InstallOptions {
  isTTY: boolean;
  skipPrompt: boolean;
}

export const parseInstallArgs = (
  args: string[],
): InstallArgs & { showHelp: boolean } => {
  let artifactsDir: string | null = null;
  let skipSkills = false;
  let dryRun = false;
  let showHelp = false;
  let yes = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      showHelp = true;
      continue;
    }

    if (arg === "--artifacts-dir" || arg === "-a") {
      if (i + 1 >= args.length) {
        console.error("Error: --artifacts-dir requires a path argument");
        showHelp = true;
        continue;
      }
      artifactsDir = args[++i];
    } else if (arg === "--skip-skills") {
      skipSkills = true;
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (!arg.startsWith("-")) {
      if (artifactsDir === null) {
        artifactsDir = arg;
      }
    }
  }

  return { artifactsDir, skipSkills, dryRun, showHelp, yes };
};

/**
 * Install plugins from bundled assets embedded in the release binary.
 */
const executeInstallFromBundled = (
  config: InstallArgs,
  logger: Logger,
  _options?: InstallOptions,
): TE.TaskEither<CLIError, void> => {
  return pipe(
    TE.fromEither(getBundledAssets()),
    TE.chain((assets) => {
      console.log(bold("\n🚀 rp1-opencode Installation (from bundled assets)\n"));
      console.log(dim(`Version: ${assets.version}\n`));

      // Run prerequisites checks
      logger.start("Checking prerequisites...");
      return pipe(
        checkOpenCodeInstalled(),
        TE.chainFirst((result) => {
          logger.success(result.message);
          return TE.right(undefined);
        }),
        TE.chain((result) => {
          const versionResult = checkOpenCodeVersion(result.value ?? "");
          if (E.isLeft(versionResult)) {
            return TE.left(versionResult.left);
          }
          logger.success(versionResult.right.message);
          return TE.right(undefined);
        }),
        TE.chain(() => checkOpenCodeSkillsPlugin()),
        TE.chain((result) => {
          if (result.value === "true") {
            logger.success("opencode-skills plugin detected");
            return TE.right({ skipSkills: config.skipSkills });
          }
          console.log(yellow("⚠ opencode-skills plugin not configured"));
          console.log(dim("  Configuring opencode-skills plugin..."));
          return pipe(
            installOpenCodeSkillsPlugin(),
            TE.map((installed) => {
              if (installed) {
                logger.success("opencode-skills plugin configured");
                console.log(dim("  OpenCode will install it on next startup"));
              } else {
                console.log(dim("  opencode-skills already in config"));
              }
              return { skipSkills: config.skipSkills };
            }),
          );
        }),
        TE.chain((_state) => {
          const targetDir = getOpenCodeConfigDir();
          return pipe(
            checkWritePermissions(targetDir),
            TE.map((result) => {
              logger.success(result.message);
              return { targetDir };
            }),
          );
        }),
        TE.chain(({ targetDir }) => {
          if (config.dryRun) {
            console.log(yellow("\nDRY RUN MODE - No files will be modified\n"));
            console.log("Would install from bundled assets:");
            console.log(`  • rp1-base: ${assets.plugins.base.commands.length} commands, ${assets.plugins.base.agents.length} agents, ${assets.plugins.base.skills.length} skills`);
            console.log(`  • rp1-dev: ${assets.plugins.dev.commands.length} commands, ${assets.plugins.dev.agents.length} agents`);
            return TE.right(undefined);
          }

          logger.start("Extracting bundled plugins...");
          return pipe(
            extractPlugins(assets, targetDir, (msg) => logger.success(msg)),
            TE.chain((result) => {
              logger.success(
                `Installed ${result.filesExtracted} files from ${result.plugins.length} plugins`,
              );

              // Get skills list for config update
              const allSkills = assets.plugins.base.skills.map((s) => s.name);

              logger.start("Validating configuration...");
              const configPath = getConfigPath();

              return pipe(
                updateOpenCodeConfig(configPath, assets.version, allSkills),
                TE.map(() => {
                  logger.success("Configuration validated");
                  return { targetDir };
                }),
              );
            }),
            TE.chain(() => {
              logger.start("Verifying installation...");
              return pipe(
                verifyInstallation(undefined),
                TE.map((report) => {
                  if (isHealthy(report)) {
                    console.log(
                      green(bold("\n✓ Installation complete and verified!")),
                    );
                    console.log(
                      dim(
                        `\nCommands: ${report.commandsFound}/${report.commandsExpected}`,
                      ),
                    );
                    console.log(
                      dim(
                        `Agents: ${report.agentsFound}/${report.agentsExpected}`,
                      ),
                    );
                    console.log(
                      dim(
                        `Skills: ${report.skillsFound}/${report.skillsExpected}`,
                      ),
                    );
                  } else {
                    console.log(
                      yellow("\n⚠ Installation complete with warnings"),
                    );
                    for (const issue of report.issues) {
                      console.log(yellow(`  • ${issue}`));
                    }
                  }
                }),
              );
            }),
          );
        }),
      );
    }),
  );
};

export const executeInstall = (
  args: string[],
  logger: Logger,
  options?: InstallOptions,
): TE.TaskEither<CLIError, void> => {
  const config = parseInstallArgs(args);
  const isTTY = options?.isTTY ?? process.stdout.isTTY ?? false;
  const skipPrompt = options?.skipPrompt ?? config.yes;

  if (config.showHelp) {
    return TE.right(undefined);
  }

  // Check for bundled assets first (release binary), unless explicit artifacts-dir provided
  if (config.artifactsDir === null && hasBundledAssets()) {
    return executeInstallFromBundled(config, logger, options);
  }

  const artifactsDir = config.artifactsDir ?? getDefaultArtifactsDir();

  if (artifactsDir === null) {
    return TE.left(
      usageError(
        "No artifacts found",
        "This appears to be a development build without bundled assets.\n\n" +
          "Options:\n" +
          "  1. Install a release binary from: https://github.com/rp1-run/rp1/releases\n" +
          "  2. Build artifacts first: rp1 build:opencode\n" +
          "  3. Specify path: rp1 install:opencode --artifacts-dir <path>",
      ),
    );
  }

  if (artifactsDir === null) {
    return TE.left(
      usageError(
        "No artifacts directory found",
        "Build artifacts first with: rp1 build:opencode\nOr specify a path with: rp1 install:opencode --artifacts-dir <path>",
      ),
    );
  }

  console.log(bold("\n🚀 rp1-opencode Installation\n"));
  console.log(dim(`Using artifacts: ${artifactsDir}\n`));

  return pipe(
    TE.tryCatch(
      async () => {
        await stat(artifactsDir);
        return artifactsDir;
      },
      () =>
        usageError(
          `Artifacts directory not found: ${artifactsDir}`,
          "Build artifacts first with: rp1 build:opencode",
        ),
    ),
    TE.chain(() => {
      logger.start("Checking prerequisites...");
      return checkOpenCodeInstalled();
    }),
    TE.chainFirst((result) => {
      logger.success(result.message);
      return TE.right(undefined);
    }),
    TE.chain((result) => {
      const versionResult = checkOpenCodeVersion(result.value ?? "");
      if (E.isLeft(versionResult)) {
        return TE.left(versionResult.left);
      }
      logger.success(versionResult.right.message);
      return TE.right(undefined);
    }),
    TE.chain(() => checkOpenCodeSkillsPlugin()),
    TE.chain((result) => {
      if (result.value === "true") {
        logger.success("opencode-skills plugin detected");
        return TE.right({ skipSkills: config.skipSkills });
      }
      console.log(yellow("⚠ opencode-skills plugin not configured"));
      console.log(dim("  Configuring opencode-skills plugin..."));
      return pipe(
        installOpenCodeSkillsPlugin(),
        TE.map((installed) => {
          if (installed) {
            logger.success("opencode-skills plugin configured");
            console.log(dim("  OpenCode will install it on next startup"));
          } else {
            console.log(dim("  opencode-skills already in config"));
          }
          return { skipSkills: config.skipSkills };
        }),
      );
    }),
    TE.chain((state) => {
      const targetDir = getOpenCodeConfigDir();
      return pipe(
        checkWritePermissions(targetDir),
        TE.map((result) => {
          logger.success(result.message);
          return state;
        }),
      );
    }),
    TE.chain((state) => {
      if (config.dryRun) {
        console.log(yellow("\nDRY RUN MODE - No files will be modified\n"));
        console.log(`Would install from: ${artifactsDir}`);
        console.log("  • Base plugin: commands, agents, skills");
        console.log("  • Dev plugin: commands, agents");
        return TE.right(undefined);
      }

      logger.start("Discovering plugins...");
      return pipe(
        discoverPlugins(artifactsDir),
        TE.chain((plugins) => {
          const pluginNames = plugins.map((p) => p.plugin).join(", ");
          logger.success(`Found ${plugins.length} plugin(s): ${pluginNames}`);

          const allSkills = plugins.flatMap((p) => [...p.skills]);
          if (allSkills.length > 0) {
            console.log(dim(`  Skills to install: ${allSkills.join(", ")}`));
          }

          logger.start("Installing rp1 artifacts...");

          const pluginDirs = plugins.map((p) =>
            join(artifactsDir, p.plugin.replace("rp1-", "")),
          );

          return pipe(
            installRp1(
              pluginDirs,
              state.skipSkills,
              (msg) => logger.success(msg),
              async (path) => {
                if (!skipPrompt) {
                  const proceed = await confirmAction(
                    `Overwrite existing file: ${path}?`,
                    { isTTY, defaultOnNonTTY: false },
                  );
                  if (!proceed) {
                    console.log(yellow(`  Skipped: ${path}`));
                    return;
                  }
                }
                console.log(yellow(`  ⚠ Overwriting: ${path}`));
              },
            ),
            TE.chain((result) => {
              logger.success(
                `Installed ${result.filesInstalled} total files across ${result.pluginsInstalled.length} plugins`,
              );

              for (const warning of result.warnings) {
                console.log(yellow(`⚠ ${warning}`));
              }

              logger.start("Validating configuration...");
              const configPath = getConfigPath();
              const latestVersion = plugins[0]?.version ?? "0.0.0";

              return pipe(
                updateOpenCodeConfig(configPath, latestVersion, allSkills),
                TE.map(() => {
                  logger.success("Configuration validated");
                  return { artifactsDir };
                }),
              );
            }),
            TE.chain(({ artifactsDir: verifyDir }) => {
              logger.start("Verifying installation...");
              return pipe(
                verifyInstallation(verifyDir),
                TE.map((report) => {
                  if (isHealthy(report)) {
                    console.log(
                      green(bold("\n✓ Installation complete and verified!")),
                    );
                    console.log(
                      dim(
                        `\nCommands: ${report.commandsFound}/${report.commandsExpected}`,
                      ),
                    );
                    console.log(
                      dim(
                        `Agents: ${report.agentsFound}/${report.agentsExpected}`,
                      ),
                    );
                    console.log(
                      dim(
                        `Skills: ${report.skillsFound}/${report.skillsExpected}`,
                      ),
                    );
                  } else {
                    console.log(
                      yellow("\n⚠ Installation complete with warnings"),
                    );
                    for (const issue of report.issues) {
                      console.log(yellow(`  • ${issue}`));
                    }
                  }
                }),
              );
            }),
          );
        }),
      );
    }),
  );
};

export const executeVerify = (
  args: string[],
  _logger: Logger,
): TE.TaskEither<CLIError, void> => {
  let artifactsDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--artifacts-dir" && i + 1 < args.length) {
      artifactsDir = args[i + 1];
    }
  }

  console.log(bold("\n🔍 Verifying rp1 Installation\n"));

  return pipe(
    verifyInstallation(artifactsDir),
    TE.map((report) => {
      console.log("┌───────────┬───────┬──────────┬────────┐");
      console.log("│ Component │ Found │ Expected │ Status │");
      console.log("├───────────┼───────┼──────────┼────────┤");

      const cmdOk = report.commandsFound === report.commandsExpected;
      console.log(
        `│ Commands  │ ${String(report.commandsFound).padStart(5)} │ ${String(report.commandsExpected).padStart(8)} │   ${cmdOk ? green("✓") : red("✗")}    │`,
      );

      const agentOk = report.agentsFound === report.agentsExpected;
      console.log(
        `│ Agents    │ ${String(report.agentsFound).padStart(5)} │ ${String(report.agentsExpected).padStart(8)} │   ${agentOk ? green("✓") : red("✗")}    │`,
      );

      const skillOk = report.skillsFound === report.skillsExpected;
      console.log(
        `│ Skills    │ ${String(report.skillsFound).padStart(5)} │ ${String(report.skillsExpected).padStart(8)} │   ${skillOk ? green("✓") : yellow("⚠")}    │`,
      );

      console.log("└───────────┴───────┴──────────┴────────┘");

      if (report.issues.length > 0) {
        console.log(yellow("\nIssues Found:"));
        for (const issue of report.issues) {
          console.log(yellow(`  • ${issue}`));
        }
      }

      if (isHealthy(report)) {
        console.log(green(bold("\n✓ Installation is healthy!")));
      } else {
        console.log(red(bold("\n✗ Installation is unhealthy")));
        process.exit(1);
      }
    }),
  );
};

export const executeList = (
  _args: string[],
  _logger: Logger,
): TE.TaskEither<CLIError, void> => {
  console.log(bold("\n📋 Installed rp1 Commands\n"));

  return pipe(
    listInstalledCommands(),
    TE.map((commands) => {
      if (commands.length === 0) {
        console.log(yellow("No rp1 commands found"));
        return;
      }

      console.log(
        "┌────────┬─────────────────────────────────────┬────────────────────────────────────────────────────────────┐",
      );
      console.log(
        "│ Plugin │ Command                             │ Description                                                │",
      );
      console.log(
        "├────────┼─────────────────────────────────────┼────────────────────────────────────────────────────────────┤",
      );

      for (const cmd of commands) {
        const plugin = cmd.plugin.padEnd(6);
        const name = cmd.name.padEnd(35);
        const desc = cmd.description.slice(0, 58).padEnd(58);
        console.log(`│ ${plugin} │ ${name} │ ${desc} │`);
      }

      console.log(
        "└────────┴─────────────────────────────────────┴────────────────────────────────────────────────────────────┘",
      );
      console.log(dim(`\nTotal: ${commands.length} commands`));
    }),
  );
};
