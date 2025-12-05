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

const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;

export interface InstallArgs {
  artifactsDir: string | null;
  skipSkills: boolean;
  dryRun: boolean;
}

export const parseInstallArgs = (
  args: string[],
): InstallArgs & { showHelp: boolean } => {
  let artifactsDir: string | null = null;
  let skipSkills = false;
  let dryRun = false;
  let showHelp = false;

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
    } else if (!arg.startsWith("-")) {
      if (artifactsDir === null) {
        artifactsDir = arg;
      }
    }
  }

  return { artifactsDir, skipSkills, dryRun, showHelp };
};

const printInstallHelp = (): void => {
  console.log(`
${bold("rp1 install:opencode")} - Install rp1 plugins to OpenCode

${bold("Usage:")}
  rp1 install:opencode [options]

${bold("Options:")}
  -a, --artifacts-dir <path>  Path to artifacts directory (default: dist/opencode/)
  --skip-skills               Skip skills installation
  --dry-run                   Show what would be installed without installing
  -h, --help                  Show this help message

${bold("Examples:")}
  rp1 install:opencode                    # Install from default artifacts
  rp1 install:opencode --dry-run          # Preview installation
  rp1 install:opencode -a ./my-artifacts  # Install from custom path
`);
};

export const executeInstall = (
  args: string[],
  _logger: Logger,
): TE.TaskEither<CLIError, void> => {
  const config = parseInstallArgs(args);

  if (config.showHelp) {
    printInstallHelp();
    return TE.right(undefined);
  }

  const artifactsDir = config.artifactsDir ?? getDefaultArtifactsDir();

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
      console.log(bold("Checking prerequisites..."));
      return checkOpenCodeInstalled();
    }),
    TE.chainFirst((result) => {
      console.log(green(`✓ ${result.message}`));
      return TE.right(undefined);
    }),
    TE.chain((result) => {
      const versionResult = checkOpenCodeVersion(result.value ?? "");
      if (E.isLeft(versionResult)) {
        return TE.left(versionResult.left);
      }
      console.log(green(`✓ ${versionResult.right.message}`));
      return TE.right(undefined);
    }),
    TE.chain(() => checkOpenCodeSkillsPlugin()),
    TE.chain((result) => {
      if (result.value === "true") {
        console.log(green("✓ opencode-skills plugin detected"));
        return TE.right({ skipSkills: config.skipSkills });
      }
      console.log(yellow("⚠ opencode-skills plugin not configured"));
      console.log(dim("  Configuring opencode-skills plugin..."));
      return pipe(
        installOpenCodeSkillsPlugin(),
        TE.map((installed) => {
          if (installed) {
            console.log(green("✓ opencode-skills plugin configured"));
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
          console.log(green(`✓ ${result.message}`));
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

      console.log(bold("\nDiscovering plugins..."));
      return pipe(
        discoverPlugins(artifactsDir),
        TE.chain((plugins) => {
          const pluginNames = plugins.map((p) => p.plugin).join(", ");
          console.log(
            green(`✓ Found ${plugins.length} plugin(s): ${pluginNames}`),
          );

          const allSkills = plugins.flatMap((p) => [...p.skills]);
          if (allSkills.length > 0) {
            console.log(dim(`  Skills to install: ${allSkills.join(", ")}`));
          }

          console.log(bold("\nInstalling rp1 artifacts..."));

          const pluginDirs = plugins.map((p) =>
            join(artifactsDir, p.plugin.replace("rp1-", "")),
          );

          return pipe(
            installRp1(
              pluginDirs,
              state.skipSkills,
              (msg) => console.log(green(`✓ ${msg}`)),
              (path) => console.log(yellow(`  ⚠ Overwriting: ${path}`)),
            ),
            TE.chain((result) => {
              console.log(
                green(
                  `✓ Installed ${result.filesInstalled} total files across ${result.pluginsInstalled.length} plugins`,
                ),
              );

              for (const warning of result.warnings) {
                console.log(yellow(`⚠ ${warning}`));
              }

              console.log(bold("\nValidating configuration..."));
              const configPath = getConfigPath();
              const latestVersion = plugins[0]?.version ?? "0.0.0";

              return pipe(
                updateOpenCodeConfig(configPath, latestVersion, allSkills),
                TE.map(() => {
                  console.log(green("✓ Configuration validated"));
                  return { artifactsDir };
                }),
              );
            }),
            TE.chain(({ artifactsDir: verifyDir }) => {
              console.log(bold("\nVerifying installation..."));
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

const printVerifyHelp = (): void => {
  console.log(`
${bold("rp1 verify:opencode")} - Verify rp1 installation health

${bold("Usage:")}
  rp1 verify:opencode [options]

${bold("Options:")}
  --artifacts-dir <path>  Path to artifacts for name-based verification
  -h, --help              Show this help message
`);
};

export const executeVerify = (
  args: string[],
  _logger: Logger,
): TE.TaskEither<CLIError, void> => {
  if (args.includes("--help") || args.includes("-h")) {
    printVerifyHelp();
    return TE.right(undefined);
  }

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

const printListHelp = (): void => {
  console.log(`
${bold("rp1 list")} - List installed rp1 commands

${bold("Usage:")}
  rp1 list [options]

${bold("Options:")}
  -h, --help  Show this help message
`);
};

export const executeList = (
  args: string[],
  _logger: Logger,
): TE.TaskEither<CLIError, void> => {
  if (args.includes("--help") || args.includes("-h")) {
    printListHelp();
    return TE.right(undefined);
  }

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
