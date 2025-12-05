/**
 * CLI entry point for build:opencode command.
 * TypeScript port of tools/build/src/rp1_opencode_builder/cli.py
 */

import {
  readdir,
  mkdir,
  rm,
  writeFile,
  copyFile,
  stat,
  readFile,
} from "fs/promises";
import { join, resolve, dirname } from "path";
import { pipe } from "fp-ts/lib/function.js";
import * as E from "fp-ts/lib/Either.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../shared/logger.js";
import {
  type CLIError,
  usageError,
  runtimeError,
  formatError,
} from "../../shared/errors.js";
import type { BuildConfig, BuildSummary } from "./models.js";
import { defaultRegistry } from "./registry.js";
import { parseCommand, parseAgent, parseSkill } from "./parser.js";
import {
  transformCommand,
  transformAgent,
  transformSkill,
} from "./transformations.js";
import {
  generateCommandFile,
  generateAgentFile,
  generateSkillFile,
  generateManifest,
} from "./generator.js";
import { validateCommand, validateAgent, validateSkill } from "./validator.js";

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

/**
 * Parse build command arguments.
 */
export const parseBuildArgs = (
  args: string[],
): E.Either<CLIError, BuildConfig> => {
  const config: BuildConfig = {
    outputDir: "dist/opencode",
    plugin: "all",
    jsonOutput: false,
    targetInstallTool: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--output-dir" || arg === "-o") {
      const value = args[++i];
      if (!value) {
        return E.left(usageError("--output-dir requires a value"));
      }
      (config as { outputDir: string }).outputDir = value;
    } else if (arg.startsWith("--output-dir=")) {
      (config as { outputDir: string }).outputDir = arg.slice(
        "--output-dir=".length,
      );
    } else if (arg === "--plugin" || arg === "-p") {
      const value = args[++i];
      if (!value || !["base", "dev", "all"].includes(value)) {
        return E.left(usageError("--plugin must be 'base', 'dev', or 'all'"));
      }
      (config as { plugin: "base" | "dev" | "all" }).plugin = value as
        | "base"
        | "dev"
        | "all";
    } else if (arg.startsWith("--plugin=")) {
      const value = arg.slice("--plugin=".length);
      if (!["base", "dev", "all"].includes(value)) {
        return E.left(usageError("--plugin must be 'base', 'dev', or 'all'"));
      }
      (config as { plugin: "base" | "dev" | "all" }).plugin = value as
        | "base"
        | "dev"
        | "all";
    } else if (arg === "--json") {
      (config as { jsonOutput: boolean }).jsonOutput = true;
    } else if (arg === "--target-install-tool") {
      (config as { targetInstallTool: boolean }).targetInstallTool = true;
    } else if (arg === "--help" || arg === "-h") {
      printBuildHelp();
      process.exit(0);
    } else if (!arg.startsWith("-")) {
      (config as { outputDir: string }).outputDir = arg;
    }
  }

  return E.right(config);
};

const printBuildHelp = (): void => {
  console.log(`
${COLORS.bold}rp1 build:opencode${COLORS.reset} - Build OpenCode artifacts from Claude Code sources

${COLORS.bold}Usage:${COLORS.reset}
  rp1 build:opencode [options]

${COLORS.bold}Options:${COLORS.reset}
  -o, --output-dir <dir>   Output directory (default: dist/opencode/)
  -p, --plugin <name>      Build specific plugin (base, dev, or all)
  --json                   Output results as JSON for CI/CD
  --target-install-tool    Generate artifacts under tools/install/dist/
  -h, --help               Show this help message

${COLORS.bold}Examples:${COLORS.reset}
  rp1 build:opencode                    # Build all plugins
  rp1 build:opencode --plugin dev       # Build only dev plugin
  rp1 build:opencode -o ./output        # Custom output directory
  rp1 build:opencode --json             # JSON output for CI
`);
};

/**
 * Find the project root (containing plugins/ directory).
 */
const findProjectRoot = async (startPath: string): Promise<string> => {
  let current = resolve(startPath);
  const root = resolve("/");

  while (current !== root) {
    try {
      const pluginsDir = join(current, "plugins");
      const pluginsStat = await stat(pluginsDir);
      if (pluginsStat.isDirectory()) {
        return current;
      }
    } catch {
      // Continue searching
    }
    current = dirname(current);
  }

  throw new Error("Could not find project root (no plugins/ directory found)");
};

/**
 * Read plugin version from .claude-plugin/plugin.json.
 * Falls back to "0.0.0" if file doesn't exist or is invalid.
 */
const readPluginVersion = async (pluginDir: string): Promise<string> => {
  try {
    const pluginJsonPath = join(pluginDir, ".claude-plugin", "plugin.json");
    const content = await readFile(pluginJsonPath, "utf-8");
    const json = JSON.parse(content) as { version?: string };
    return json.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
};

/**
 * Get list of markdown files in a directory.
 */
const getMarkdownFiles = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.endsWith(".md"))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
};

/**
 * Get list of skill directories.
 */
const getSkillDirs = async (skillsDir: string): Promise<string[]> => {
  try {
    const entries = await readdir(skillsDir, { withFileTypes: true });
    const dirs: string[] = [];
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const skillMd = join(skillsDir, entry.name, "SKILL.md");
        try {
          await stat(skillMd);
          dirs.push(join(skillsDir, entry.name));
        } catch {
          // No SKILL.md, skip
        }
      }
    }
    return dirs;
  } catch {
    return [];
  }
};

/**
 * Recursively copy supporting files.
 */
const copySupportingFiles = async (
  srcDir: string,
  destDir: string,
  files: readonly string[],
): Promise<void> => {
  for (const file of files) {
    const srcPath = join(srcDir, file);
    const destPath = join(destDir, file);
    await mkdir(dirname(destPath), { recursive: true });
    try {
      await copyFile(srcPath, destPath);
    } catch {
      // File might not exist, skip
    }
  }
};

/**
 * Build a single plugin.
 */
const buildPlugin = async (
  pluginName: string,
  projectRoot: string,
  outputPath: string,
  logger: Logger,
  jsonOutput: boolean,
): Promise<BuildSummary> => {
  const errors: string[] = [];
  const commandNames: string[] = [];
  const agentNames: string[] = [];
  const skillNames: string[] = [];

  const pluginDir = join(projectRoot, "plugins", pluginName);
  const pluginOutputDir = join(outputPath, pluginName);
  const pluginVersion = await readPluginVersion(pluginDir);

  // Clean and create output directories with subdirectory namespacing
  try {
    await rm(pluginOutputDir, { recursive: true, force: true });
  } catch {
    // Directory might not exist
  }

  // Create namespaced subdirectories: command/rp1-base/, agent/rp1-base/
  await mkdir(join(pluginOutputDir, "command", `rp1-${pluginName}`), {
    recursive: true,
  });
  await mkdir(join(pluginOutputDir, "agent", `rp1-${pluginName}`), {
    recursive: true,
  });
  await mkdir(join(pluginOutputDir, "skills"), { recursive: true });

  if (!jsonOutput) {
    logger.start(`Building ${pluginName} plugin...`);
  }

  // Process commands
  const commandsDir = join(pluginDir, "commands");
  const commandFiles = await getMarkdownFiles(commandsDir);

  for (const cmdFile of commandFiles) {
    const parseResult = await parseCommand(cmdFile)();
    if (E.isLeft(parseResult)) {
      errors.push(formatError(parseResult.left, false));
      continue;
    }
    const ccCmd = parseResult.right;

    const transformResult = transformCommand(ccCmd, defaultRegistry);
    if (E.isLeft(transformResult)) {
      errors.push(formatError(transformResult.left, false));
      continue;
    }
    const ocCmd = transformResult.right;

    const generateResult = generateCommandFile(ocCmd, ccCmd.name);
    if (E.isLeft(generateResult)) {
      errors.push(formatError(generateResult.left, false));
      continue;
    }
    const { filename, content } = generateResult.right;

    // Validate generated content
    const validateResult = validateCommand(content, filename);
    if (E.isLeft(validateResult)) {
      errors.push(formatError(validateResult.left, false));
      continue;
    }

    // Write to namespaced subdirectory
    const outputFile = join(
      pluginOutputDir,
      "command",
      `rp1-${pluginName}`,
      filename,
    );
    await writeFile(outputFile, content);
    commandNames.push(ccCmd.name);
  }

  // Process agents
  const agentsDir = join(pluginDir, "agents");
  const agentFiles = await getMarkdownFiles(agentsDir);

  for (const agentFile of agentFiles) {
    const parseResult = await parseAgent(agentFile)();
    if (E.isLeft(parseResult)) {
      errors.push(formatError(parseResult.left, false));
      continue;
    }
    const ccAgent = parseResult.right;

    const transformResult = transformAgent(ccAgent, defaultRegistry);
    if (E.isLeft(transformResult)) {
      errors.push(formatError(transformResult.left, false));
      continue;
    }
    const ocAgent = transformResult.right;

    const generateResult = generateAgentFile(ocAgent);
    if (E.isLeft(generateResult)) {
      errors.push(formatError(generateResult.left, false));
      continue;
    }
    const { filename, content } = generateResult.right;

    // Validate generated content
    const validateResult = validateAgent(content, filename);
    if (E.isLeft(validateResult)) {
      errors.push(formatError(validateResult.left, false));
      continue;
    }

    // Write to namespaced subdirectory
    const outputFile = join(
      pluginOutputDir,
      "agent",
      `rp1-${pluginName}`,
      filename,
    );
    await writeFile(outputFile, content);
    agentNames.push(ccAgent.name);
  }

  // Process skills (only in base plugin)
  if (pluginName === "base") {
    const skillsDir = join(pluginDir, "skills");
    const skillDirs = await getSkillDirs(skillsDir);

    for (const skillDir of skillDirs) {
      const parseResult = await parseSkill(skillDir)();
      if (E.isLeft(parseResult)) {
        errors.push(formatError(parseResult.left, false));
        continue;
      }
      const ccSkill = parseResult.right;

      const transformResult = transformSkill(ccSkill, defaultRegistry);
      if (E.isLeft(transformResult)) {
        errors.push(formatError(transformResult.left, false));
        continue;
      }
      const ocSkill = transformResult.right;

      const generateResult = generateSkillFile(ocSkill);
      if (E.isLeft(generateResult)) {
        errors.push(formatError(generateResult.left, false));
        continue;
      }
      const {
        skillDir: outSkillDir,
        skillMdContent,
        supportingFiles,
      } = generateResult.right;

      // Validate generated content
      const validateResult = validateSkill(
        skillMdContent,
        `${outSkillDir}/SKILL.md`,
      );
      if (E.isLeft(validateResult)) {
        errors.push(formatError(validateResult.left, false));
        continue;
      }

      // Write SKILL.md
      const skillOutputDir = join(pluginOutputDir, "skills", outSkillDir);
      await mkdir(skillOutputDir, { recursive: true });
      await writeFile(join(skillOutputDir, "SKILL.md"), skillMdContent);

      // Copy supporting files
      await copySupportingFiles(skillDir, skillOutputDir, supportingFiles);

      skillNames.push(ccSkill.name);
    }
  }

  // Generate manifest
  const manifestResult = generateManifest(
    `rp1-${pluginName}`,
    pluginVersion,
    commandNames,
    agentNames,
    skillNames,
  );
  if (E.isRight(manifestResult)) {
    await writeFile(
      join(pluginOutputDir, "manifest.json"),
      manifestResult.right,
    );
  }

  // Complete spinner
  if (!jsonOutput) {
    const hasErrors = errors.length > 0;
    const summary = `${pluginName}: ${commandNames.length} commands, ${agentNames.length} agents, ${skillNames.length} skills`;
    if (hasErrors) {
      logger.fail(`${summary} (${errors.length} errors)`);
    } else {
      logger.success(summary);
    }
  }

  return {
    plugin: pluginName,
    commands: commandNames.length,
    agents: agentNames.length,
    skills: skillNames.length,
    errors,
  };
};

/**
 * Print build summary table.
 */
const printSummary = (summaries: BuildSummary[], outputPath: string): void => {
  console.log(
    `\n${COLORS.green}${COLORS.bold}✓ Build complete!${COLORS.reset}\n`,
  );

  // Calculate column widths
  const pluginCol = 12;
  const numCol = 10;

  // Header
  console.log(
    `${COLORS.bold}${"Plugin".padEnd(pluginCol)}${"Commands".padStart(numCol)}${"Agents".padStart(numCol)}${"Skills".padStart(numCol)}${COLORS.reset}`,
  );
  console.log("-".repeat(pluginCol + numCol * 3));

  // Rows
  for (const summary of summaries) {
    console.log(
      `${COLORS.cyan}rp1-${summary.plugin.padEnd(pluginCol - 4)}${COLORS.reset}` +
        `${COLORS.green}${String(summary.commands).padStart(numCol)}${COLORS.reset}` +
        `${COLORS.green}${String(summary.agents).padStart(numCol)}${COLORS.reset}` +
        `${COLORS.green}${String(summary.skills).padStart(numCol)}${COLORS.reset}`,
    );
  }

  console.log(
    `\nOutput directory: ${COLORS.cyan}${resolve(outputPath)}${COLORS.reset}`,
  );

  // Show errors if any
  const allErrors = summaries.flatMap((s) => s.errors);
  if (allErrors.length > 0) {
    console.log(
      `\n${COLORS.yellow}⚠ ${allErrors.length} errors occurred:${COLORS.reset}`,
    );
    for (const error of allErrors.slice(0, 5)) {
      console.log(`  • ${error}`);
    }
    if (allErrors.length > 5) {
      console.log(`  ... and ${allErrors.length - 5} more`);
    }
  }
};

/**
 * Main build command execution.
 */
export const executeBuild = (
  args: string[],
  logger: Logger,
): TE.TaskEither<CLIError, void> =>
  pipe(
    TE.fromEither(parseBuildArgs(args)),
    TE.chain((config) =>
      TE.tryCatch(
        async () => {
          // Find project root
          const projectRoot = await findProjectRoot(process.cwd());

          // Determine output directory
          let outputPath: string;
          if (config.targetInstallTool) {
            outputPath = join(
              projectRoot,
              "tools",
              "install",
              "dist",
              "opencode",
            );
          } else {
            outputPath = resolve(config.outputDir);
          }

          if (!config.jsonOutput) {
            logger.debug(`Output directory: ${outputPath}`);
          }

          // Determine which plugins to build
          const pluginsToBuild =
            config.plugin === "all" ? ["base", "dev"] : [config.plugin];

          // Build each plugin
          const summaries: BuildSummary[] = [];
          for (const pluginName of pluginsToBuild) {
            const summary = await buildPlugin(
              pluginName,
              projectRoot,
              outputPath,
              logger,
              config.jsonOutput,
            );
            summaries.push(summary);
          }

          // Output results
          if (config.jsonOutput) {
            const allErrors = summaries.flatMap((s) => s.errors);
            const result = {
              status: allErrors.length === 0 ? "success" : "partial",
              commands: summaries.reduce((sum, s) => sum + s.commands, 0),
              agents: summaries.reduce((sum, s) => sum + s.agents, 0),
              skills: summaries.reduce((sum, s) => sum + s.skills, 0),
              errors: allErrors,
            };
            console.log(JSON.stringify(result, null, 2));
          } else {
            printSummary(summaries, outputPath);
          }

          // Exit with error if there were errors
          const totalErrors = summaries.reduce(
            (sum, s) => sum + s.errors.length,
            0,
          );
          if (totalErrors > 0) {
            process.exit(1);
          }
        },
        (e) => runtimeError(`Build failed: ${e}`),
      ),
    ),
  );
