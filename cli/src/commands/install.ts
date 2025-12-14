import { Command } from "commander";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../shared/logger.js";
import { formatError, getExitCode } from "../../shared/errors.js";
import {
  executeInstall,
  executeVerify,
  executeList,
} from "../install/index.js";
import { codes } from "../lib/colors.js";

export const installCommand = new Command("install:opencode")
  .description("Install rp1 plugins to OpenCode platform")
  .option("-a, --artifacts-dir <path>", "Path to artifacts directory")
  .option("--skip-skills", "Skip skills installation")
  .option("--dry-run", "Show what would be installed without installing")
  .option("-y, --yes", "Skip confirmation prompts")
  .addHelpText("after", `
Examples:
  rp1 install:opencode                    Install from default artifacts
  rp1 install:opencode --dry-run          Preview installation
  rp1 install:opencode -a ./my-artifacts  Install from custom path
  rp1 install:opencode -y                 Skip confirmation prompts
`)
  .action(async (options, command) => {
    const logger = command.parent?._logger as Logger;
    const isTTY = command.parent?._isTTY ?? false;

    if (!logger) {
      console.error("Logger not initialized");
      process.exit(1);
    }

    const args: string[] = [];
    if (options.artifactsDir) {
      args.push("--artifacts-dir", options.artifactsDir);
    }
    if (options.skipSkills) {
      args.push("--skip-skills");
    }
    if (options.dryRun) {
      args.push("--dry-run");
    }
    if (options.yes) {
      args.push("--yes");
    }

    const result = await executeInstall(args, logger, { isTTY, skipPrompt: options.yes })();

    if (E.isLeft(result)) {
      console.error(formatError(result.left, process.stderr.isTTY ?? false));
      process.exit(getExitCode(result.left));
    }
  });

export const verifyCommand = new Command("verify:opencode")
  .description("Verify rp1 installation health")
  .option("--artifacts-dir <path>", "Path to artifacts for name-based verification")
  .addHelpText("after", `
Examples:
  rp1 verify:opencode                     Verify installation
  rp1 verify:opencode --artifacts-dir .   Verify against specific artifacts
`)
  .action(async (options, command) => {
    const logger = command.parent?._logger as Logger;
    if (!logger) {
      console.error("Logger not initialized");
      process.exit(1);
    }

    const args: string[] = [];
    if (options.artifactsDir) {
      args.push("--artifacts-dir", options.artifactsDir);
    }

    const result = await executeVerify(args, logger)();

    if (E.isLeft(result)) {
      console.error(formatError(result.left, process.stderr.isTTY ?? false));
      process.exit(getExitCode(result.left));
    }
  });

export const listCommand = new Command("list")
  .description("List installed rp1 commands")
  .addHelpText("after", `
Examples:
  rp1 list                                List all installed commands
`)
  .action(async (_options, command) => {
    const logger = command.parent?._logger as Logger;
    if (!logger) {
      console.error("Logger not initialized");
      process.exit(1);
    }

    const result = await executeList([], logger)();

    if (E.isLeft(result)) {
      console.error(formatError(result.left, process.stderr.isTTY ?? false));
      process.exit(getExitCode(result.left));
    }
  });

export const installClaudeCodeCommand = new Command("install:claudecode")
  .description("Show instructions for installing rp1 plugins in Claude Code")
  .action(async () => {
    const { cyan, bold, reset, dim } = codes;

    console.log(`
${bold}Installing rp1 plugins in Claude Code${reset}

Claude Code uses a plugin marketplace. Run these commands in Claude Code:

${cyan}# Add the rp1 marketplace${reset}
${bold}/plugin marketplace add rp1-run/rp1${reset}

${cyan}# Install the plugins${reset}
${bold}/plugin install rp1-base${reset}
${bold}/plugin install rp1-dev${reset}

${cyan}# Verify installation${reset}
${bold}/help${reset}  ${dim}(should show rp1 commands)${reset}

${dim}For detailed instructions, visit:${reset}
${bold}https://rp1.run/getting-started/quickstart/${reset}
`);
  });
