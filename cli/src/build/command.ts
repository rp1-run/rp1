/**
 * CLI entry point for build:opencode command.
 */

import {
	copyFile,
	mkdir,
	readdir,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import {
	type CLIError,
	formatError,
	runtimeError,
	usageError,
} from "../../shared/errors.js";
import type { Logger } from "../../shared/logger.js";
import { codes as COLORS } from "../lib/colors.js";
import {
	generateAgentFile,
	generateBundleManifest,
	generateCommandFile,
	generateManifest,
	generateSkillFile,
} from "./generator.js";
import type {
	BuildConfig,
	BuildSummary,
	BundleAssetEntry,
	BundlePluginAssets,
	OpenCodePluginAsset,
} from "./models.js";
import { parseAgent, parseCommand, parseSkill } from "./parser.js";
import { defaultRegistry } from "./registry.js";
import {
	transformAgent,
	transformCommand,
	transformSkill,
} from "./transformations.js";
import { validateAgent, validateCommand, validateSkill } from "./validator.js";

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
 * Recursively copy a directory tree.
 */
const copyDirectory = async (
	srcDir: string,
	destDir: string,
): Promise<void> => {
	await mkdir(destDir, { recursive: true });
	const entries = await readdir(srcDir, { withFileTypes: true });

	for (const entry of entries) {
		const srcPath = join(srcDir, entry.name);
		const destPath = join(destDir, entry.name);

		if (entry.isDirectory()) {
			await copyDirectory(srcPath, destPath);
		} else if (entry.isFile()) {
			await copyFile(srcPath, destPath);
		}
	}
};

/**
 * Copy OpenCode plugin files from platforms/opencode/ to platforms/opencode/ in output.
 * Source and output use the same structure for consistency.
 * Returns true if plugin was found and copied, false otherwise.
 */
const copyOpenCodePlugin = async (
	pluginDir: string,
	pluginOutputDir: string,
): Promise<boolean> => {
	const openCodeSrcDir = join(pluginDir, "platforms", "opencode");

	try {
		const srcStat = await stat(openCodeSrcDir);
		if (!srcStat.isDirectory()) {
			return false;
		}

		const openCodeDestDir = join(pluginOutputDir, "platforms", "opencode");
		await copyDirectory(openCodeSrcDir, openCodeDestDir);
		return true;
	} catch {
		return false;
	}
};

/**
 * Collect OpenCode plugin files into BundleAssetEntry array.
 * Recursively collects all files from the platforms/opencode/ directory.
 */
const collectOpenCodePluginFiles = async (
	pluginOutputDir: string,
	pluginName: string,
): Promise<BundleAssetEntry[]> => {
	const entries: BundleAssetEntry[] = [];
	const openCodeDir = join(pluginOutputDir, "platforms", "opencode");

	const collectFiles = async (
		dir: string,
		relativePath: string,
	): Promise<void> => {
		const items = await readdir(dir, { withFileTypes: true });
		for (const item of items) {
			const fullPath = join(dir, item.name);
			const itemRelativePath = relativePath
				? `${relativePath}/${item.name}`
				: item.name;
			if (item.isDirectory()) {
				await collectFiles(fullPath, itemRelativePath);
			} else if (item.isFile()) {
				entries.push({
					name: itemRelativePath,
					path: `${pluginName}/platforms/opencode/${itemRelativePath}`,
				});
			}
		}
	};

	try {
		await collectFiles(openCodeDir, "");
	} catch {
		// Directory doesn't exist or is not readable
	}

	return entries;
};

/**
 * Get OpenCode plugin name for a given plugin.
 * Returns "{pluginName}-hooks" (e.g., "rp1-base-hooks" for base plugin).
 */
const getOpenCodePluginName = (pluginName: string): string => {
	return `rp1-${pluginName}-hooks`;
};

/**
 * Extended build result with asset paths for bundle manifest.
 */
interface PluginBuildResult {
	summary: BuildSummary;
	assets: BundlePluginAssets;
	hasOpenCodePlugin: boolean;
}

/**
 * Build a single plugin.
 */
const buildPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	logger: Logger,
	jsonOutput: boolean,
): Promise<PluginBuildResult> => {
	const errors: string[] = [];
	const commandEntries: BundleAssetEntry[] = [];
	const agentEntries: BundleAssetEntry[] = [];
	const skillEntries: BundleAssetEntry[] = [];

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
		const relativePath = `${pluginName}/command/rp1-${pluginName}/${filename}`;
		const outputFile = join(outputPath, relativePath);
		await writeFile(outputFile, content);
		commandEntries.push({ name: ccCmd.name, path: relativePath });
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
		const relativePath = `${pluginName}/agent/rp1-${pluginName}/${filename}`;
		const outputFile = join(outputPath, relativePath);
		await writeFile(outputFile, content);
		agentEntries.push({ name: ccAgent.name, path: relativePath });
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
			const relativePath = `${pluginName}/skills/${outSkillDir}/SKILL.md`;
			await mkdir(skillOutputDir, { recursive: true });
			await writeFile(join(skillOutputDir, "SKILL.md"), skillMdContent);

			// Copy supporting files
			await copySupportingFiles(skillDir, skillOutputDir, supportingFiles);

			skillEntries.push({ name: ccSkill.name, path: relativePath });
		}
	}

	// Copy OpenCode plugin if present
	const hasOpenCodePlugin = await copyOpenCodePlugin(
		pluginDir,
		pluginOutputDir,
	);

	// Collect OpenCode plugin files for bundle manifest
	let openCodePluginAsset: OpenCodePluginAsset | undefined;
	if (hasOpenCodePlugin) {
		const pluginFiles = await collectOpenCodePluginFiles(
			pluginOutputDir,
			pluginName,
		);
		openCodePluginAsset = {
			name: getOpenCodePluginName(pluginName),
			files: pluginFiles,
		};
	}

	// Generate manifest
	const commandNames = commandEntries.map((e) => e.name);
	const agentNames = agentEntries.map((e) => e.name);
	const skillNames = skillEntries.map((e) => e.name);

	const manifestResult = generateManifest(
		`rp1-${pluginName}`,
		pluginVersion,
		commandNames,
		agentNames,
		skillNames,
		hasOpenCodePlugin || undefined,
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
		const ocPluginNote = hasOpenCodePlugin ? " + OpenCode plugin" : "";
		const summary = `${pluginName}: ${commandEntries.length} commands, ${agentEntries.length} agents, ${skillEntries.length} skills${ocPluginNote}`;
		if (hasErrors) {
			logger.fail(`${summary} (${errors.length} errors)`);
		} else {
			logger.success(summary);
		}
	}

	return {
		summary: {
			plugin: pluginName,
			commands: commandEntries.length,
			agents: agentEntries.length,
			skills: skillEntries.length,
			errors,
		},
		assets: {
			name: `rp1-${pluginName}`,
			commands: commandEntries,
			agents: agentEntries,
			skills: skillEntries,
			openCodePlugin: openCodePluginAsset,
		},
		hasOpenCodePlugin,
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
					const outputPath = resolve(config.outputDir);

					if (!config.jsonOutput) {
						logger.debug(`Output directory: ${outputPath}`);
					}

					// Determine which plugins to build
					const pluginsToBuild =
						config.plugin === "all" ? ["base", "dev"] : [config.plugin];

					// Build each plugin
					const summaries: BuildSummary[] = [];
					const pluginAssets: Map<string, BundlePluginAssets> = new Map();

					for (const pluginName of pluginsToBuild) {
						const result = await buildPlugin(
							pluginName,
							projectRoot,
							outputPath,
							logger,
							config.jsonOutput,
						);
						summaries.push(result.summary);
						pluginAssets.set(pluginName, result.assets);
					}

					// Generate bundle manifest if building all plugins
					if (config.plugin === "all") {
						const baseAssets = pluginAssets.get("base");
						const devAssets = pluginAssets.get("dev");

						if (baseAssets && devAssets) {
							// Read version from CLI package.json
							const pkgPath = join(projectRoot, "cli", "package.json");
							let version = "0.0.0";
							try {
								const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
								version = pkg.version ?? "0.0.0";
							} catch {
								// Fallback to version from plugin
							}

							const bundleManifestResult = generateBundleManifest(
								baseAssets,
								devAssets,
								version,
							);
							if (E.isRight(bundleManifestResult)) {
								await writeFile(
									join(outputPath, "bundle-manifest.json"),
									bundleManifestResult.right,
								);
								if (!config.jsonOutput) {
									logger.debug("Generated bundle-manifest.json");
								}
							}
						}
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
