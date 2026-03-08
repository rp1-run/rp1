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
import { basename, dirname, join, resolve } from "node:path";
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
import { createSpinner } from "../../shared/spinner.js";
import { extractStateMachineMermaid } from "../agent-tools/state-machine/extractor.js";
import { colorFns } from "../lib/colors.js";
import {
	generateAgentToml,
	generateCodexManifest,
	generateCodexSkillDir,
	generateOpenaiYaml,
	transformAgentForCodex,
	transformSkillForCodex,
	validateCodexSkill,
	validateCodexToml,
} from "./codex/index.js";
import type { CodexAgent } from "./codex/models.js";
import {
	generateAgentFile,
	generateBundleManifest,
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
import { parseAgent, parseSkill } from "./parser.js";
import { defaultRegistry } from "./registry.js";
import { transformAgent, transformSkill } from "./transformations.js";
import { validateAgent, validateSkill } from "./validator.js";

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
			if (!value || !["base", "dev", "utils", "all"].includes(value)) {
				return E.left(
					usageError("--plugin must be 'base', 'dev', 'utils', or 'all'"),
				);
			}
			(config as { plugin: "base" | "dev" | "utils" | "all" }).plugin = value as
				| "base"
				| "dev"
				| "utils"
				| "all";
		} else if (arg.startsWith("--plugin=")) {
			const value = arg.slice("--plugin=".length);
			if (!["base", "dev", "utils", "all"].includes(value)) {
				return E.left(
					usageError("--plugin must be 'base', 'dev', 'utils', or 'all'"),
				);
			}
			(config as { plugin: "base" | "dev" | "utils" | "all" }).plugin = value as
				| "base"
				| "dev"
				| "utils"
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
	const { bold } = colorFns;
	console.log(`
${bold("rp1 build:opencode")} - Build OpenCode artifacts from Claude Code sources

${bold("Usage:")}
  rp1 build:opencode [options]

${bold("Options:")}
  -o, --output-dir <dir>   Output directory (default: dist/opencode/)
  -p, --plugin <name>      Build specific plugin (base, dev, utils, or all)
  --json                   Output results as JSON for CI/CD
  -h, --help               Show this help message

${bold("Examples:")}
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
 * Recursively collect all file paths relative to a directory.
 */
const collectAllFiles = async (dir: string, prefix = ""): Promise<string[]> => {
	const files: string[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				files.push(...(await collectAllFiles(join(dir, entry.name), relPath)));
			} else if (entry.isFile()) {
				files.push(relPath);
			}
		}
	} catch {
		// Directory doesn't exist
	}
	return files;
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
export interface PluginBuildResult {
	summary: BuildSummary;
	assets: BundlePluginAssets;
	hasOpenCodePlugin: boolean;
}

/**
 * Build a single plugin.
 * Processes skills from all plugins.
 */
export const buildPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	_logger: Logger,
	jsonOutput: boolean,
): Promise<PluginBuildResult> => {
	const errors: string[] = [];
	const commandEntries: BundleAssetEntry[] = [];
	const agentEntries: BundleAssetEntry[] = [];
	const skillEntries: BundleAssetEntry[] = [];
	const skillFileEntries: BundleAssetEntry[] = [];
	const stateMachineEntries: BundleAssetEntry[] = [];

	const pluginDir = join(projectRoot, "plugins", pluginName);
	const pluginOutputDir = join(outputPath, pluginName);
	const pluginVersion = await readPluginVersion(pluginDir);

	// Create spinner for progress indication (only in interactive mode)
	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	// Clean and create output directories
	try {
		await rm(pluginOutputDir, { recursive: true, force: true });
	} catch {
		// Directory might not exist
	}

	// Create output directories: agents/ (flat), skills/
	await mkdir(join(pluginOutputDir, "agents"), { recursive: true });
	await mkdir(join(pluginOutputDir, "skills"), { recursive: true });

	if (!jsonOutput) {
		spinner.start(`Building ${pluginName} plugin...`);
	}

	// Process skills from all plugins
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

		// Namespace skill directories with rp1- prefix to avoid collisions with user skills
		const namespacedSkillDir = `rp1-${outSkillDir}`;

		// Update the name field in SKILL.md frontmatter to match the namespaced directory
		const namespacedSkillMdContent = skillMdContent.replace(
			/^(name:\s*).+$/m,
			`$1${namespacedSkillDir}`,
		);

		// Validate generated content
		const validateResult = validateSkill(
			namespacedSkillMdContent,
			`${namespacedSkillDir}/SKILL.md`,
		);
		if (E.isLeft(validateResult)) {
			errors.push(formatError(validateResult.left, false));
			continue;
		}

		// Write SKILL.md
		const skillOutputDir = join(pluginOutputDir, "skills", namespacedSkillDir);
		await mkdir(skillOutputDir, { recursive: true });
		await writeFile(join(skillOutputDir, "SKILL.md"), namespacedSkillMdContent);

		// Copy supporting files
		await copySupportingFiles(skillDir, skillOutputDir, supportingFiles);

		// Track skill directory name for manifest
		const relativePath = `${pluginName}/skills/${namespacedSkillDir}/SKILL.md`;
		skillEntries.push({ name: namespacedSkillDir, path: relativePath });

		// Collect all files in skill dir for bundle embedding (SKILL.md + supporting files)
		const allSkillFiles = await collectAllFiles(skillOutputDir);
		for (const file of allSkillFiles) {
			const fileRelPath = `${pluginName}/skills/${namespacedSkillDir}/${file}`;
			skillFileEntries.push({
				name: `${namespacedSkillDir}/${file}`,
				path: fileRelPath,
			});
		}

		const extractedSkillMermaid = extractStateMachineMermaid(
			namespacedSkillMdContent,
		);
		if (extractedSkillMermaid) {
			stateMachineEntries.push({
				name: outSkillDir,
				path: "",
				content: extractedSkillMermaid,
			});
		}
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

		// Write to flat namespaced file: agents/rp1-{plugin}-{filename}
		const relativePath = `${pluginName}/agents/rp1-${pluginName}-${filename}`;
		const outputFile = join(outputPath, relativePath);
		await writeFile(outputFile, content);
		agentEntries.push({ name: ccAgent.name, path: relativePath });

		const extractedAgentMermaid = extractStateMachineMermaid(ccAgent.content);
		if (extractedAgentMermaid) {
			stateMachineEntries.push({
				name: ccAgent.name,
				path: "",
				content: extractedAgentMermaid,
			});
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
		const summary = `${pluginName}: ${agentEntries.length} agents, ${skillEntries.length} skills${ocPluginNote}`;
		if (hasErrors) {
			spinner.fail(`${summary} (${errors.length} errors)`);
		} else {
			spinner.succeed(summary);
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
			skills: skillFileEntries,
			stateMachines: stateMachineEntries,
			openCodePlugin: openCodePluginAsset,
		},
		hasOpenCodePlugin,
	};
};

/**
 * Derive the Codex output directory from the OpenCode output directory.
 * If outputDir is "dist/opencode", codex goes to "dist/codex".
 * If custom (e.g., "./output"), codex goes to "./output-codex".
 */
const deriveCodexOutputDir = (opencodeOutputDir: string): string => {
	const dir = basename(opencodeOutputDir);
	const parent = dirname(opencodeOutputDir);
	if (dir === "opencode") {
		return join(parent, "codex");
	}
	return `${opencodeOutputDir}-codex`;
};

/**
 * Build Codex artifacts for a single plugin.
 * Orchestrates: parse -> transform -> generate -> validate for skills and agents.
 */
export const buildCodexPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	_logger: Logger,
	jsonOutput: boolean,
): Promise<BuildSummary> => {
	const errors: string[] = [];
	const skillNames: string[] = [];
	const agentNames: string[] = [];

	const pluginDir = join(projectRoot, "plugins", pluginName);
	const pluginOutputDir = join(outputPath, pluginName);
	const pluginVersion = await readPluginVersion(pluginDir);

	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	try {
		await rm(pluginOutputDir, { recursive: true, force: true });
	} catch {
		// Directory might not exist
	}

	await mkdir(join(pluginOutputDir, "skills"), { recursive: true });

	if (!jsonOutput) {
		spinner.start(`Building ${pluginName} plugin (codex)...`);
	}

	// Process skills
	const skillsDir = join(pluginDir, "skills");
	const skillDirs = await getSkillDirs(skillsDir);

	for (const skillDir of skillDirs) {
		const parseResult = await parseSkill(skillDir)();
		if (E.isLeft(parseResult)) {
			errors.push(`[codex] ${formatError(parseResult.left, false)}`);
			continue;
		}
		const ccSkill = parseResult.right;

		const transformResult = transformSkillForCodex(ccSkill);
		if (E.isLeft(transformResult)) {
			errors.push(`[codex] ${formatError(transformResult.left, false)}`);
			continue;
		}
		const codexSkill = transformResult.right;

		const generateResult = generateCodexSkillDir(codexSkill);
		if (E.isLeft(generateResult)) {
			errors.push(`[codex] ${formatError(generateResult.left, false)}`);
			continue;
		}
		const {
			skillDir: outSkillDir,
			skillMdContent,
			supportingFiles,
		} = generateResult.right;

		const namespacedSkillDir = `rp1-${outSkillDir}`;
		const namespacedSkillMdContent = skillMdContent.replace(
			/^(name:\s*).+$/m,
			`$1${namespacedSkillDir}`,
		);

		const validateResult = validateCodexSkill(
			namespacedSkillMdContent,
			`${namespacedSkillDir}/SKILL.md`,
		);
		if (E.isLeft(validateResult)) {
			errors.push(`[codex] ${formatError(validateResult.left, false)}`);
			continue;
		}

		const skillOutputDir = join(pluginOutputDir, "skills", namespacedSkillDir);
		await mkdir(skillOutputDir, { recursive: true });
		await writeFile(join(skillOutputDir, "SKILL.md"), namespacedSkillMdContent);

		// Generate agents/openai.yaml
		const yamlResult = generateOpenaiYaml(namespacedSkillDir);
		if (E.isRight(yamlResult)) {
			const agentsDir = join(skillOutputDir, "agents");
			await mkdir(agentsDir, { recursive: true });
			await writeFile(join(agentsDir, "openai.yaml"), yamlResult.right);
		}

		// Copy supporting files
		await copySupportingFiles(skillDir, skillOutputDir, supportingFiles);

		skillNames.push(namespacedSkillDir);
	}

	// Process agents
	const agentsDir = join(pluginDir, "agents");
	const agentFiles = await getMarkdownFiles(agentsDir);
	const codexAgents: CodexAgent[] = [];

	for (const agentFile of agentFiles) {
		const parseResult = await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(`[codex] ${formatError(parseResult.left, false)}`);
			continue;
		}
		const ccAgent = parseResult.right;

		const transformResult = transformAgentForCodex(ccAgent);
		if (E.isLeft(transformResult)) {
			errors.push(`[codex] ${formatError(transformResult.left, false)}`);
			continue;
		}
		const codexAgent = transformResult.right;
		codexAgents.push(codexAgent);
		agentNames.push(codexAgent.name);
	}

	// Generate rp1-agents.toml
	if (codexAgents.length > 0) {
		const tomlResult = generateAgentToml(codexAgents);
		if (E.isRight(tomlResult)) {
			const tomlContent = tomlResult.right;
			const validateTomlResult = validateCodexToml(
				tomlContent,
				`${pluginName}/rp1-agents.toml`,
			);
			if (E.isLeft(validateTomlResult)) {
				errors.push(`[codex] ${formatError(validateTomlResult.left, false)}`);
			} else {
				await writeFile(join(pluginOutputDir, "rp1-agents.toml"), tomlContent);
			}
		} else {
			errors.push(`[codex] ${formatError(tomlResult.left, false)}`);
		}
	}

	// Generate manifest.json
	const manifestResult = generateCodexManifest(
		`rp1-${pluginName}`,
		pluginVersion,
		skillNames,
		agentNames,
	);
	if (E.isRight(manifestResult)) {
		await writeFile(
			join(pluginOutputDir, "manifest.json"),
			manifestResult.right,
		);
	}

	if (!jsonOutput) {
		const hasErrors = errors.length > 0;
		const summary = `${pluginName} (codex): ${agentNames.length} agents, ${skillNames.length} skills`;
		if (hasErrors) {
			spinner.fail(`${summary} (${errors.length} errors)`);
		} else {
			spinner.succeed(summary);
		}
	}

	return {
		plugin: pluginName,
		commands: 0,
		agents: agentNames.length,
		skills: skillNames.length,
		errors,
	};
};

/**
 * Print build summary table.
 */
const printSummary = (
	summaries: BuildSummary[],
	outputPath: string,
	codexSummaries?: BuildSummary[],
	codexOutputPath?: string,
): void => {
	const { bold, green, cyan, yellow, boldGreen } = colorFns;
	console.log(`\n${boldGreen("✓ Build complete!")}\n`);

	const pluginCol = 12;
	const numCol = 10;

	// OpenCode summary
	console.log(bold("OpenCode"));
	console.log(
		bold(
			`${"Plugin".padEnd(pluginCol)}${"Agents".padStart(numCol)}${"Skills".padStart(numCol)}`,
		),
	);
	console.log("-".repeat(pluginCol + numCol * 2));

	for (const summary of summaries) {
		console.log(
			cyan(`rp1-${summary.plugin.padEnd(pluginCol - 4)}`) +
				green(String(summary.agents).padStart(numCol)) +
				green(String(summary.skills).padStart(numCol)),
		);
	}

	console.log(`Output: ${cyan(resolve(outputPath))}`);

	// Codex summary
	if (codexSummaries && codexSummaries.length > 0) {
		console.log(`\n${bold("Codex")}`);
		console.log(
			bold(
				`${"Plugin".padEnd(pluginCol)}${"Agents".padStart(numCol)}${"Skills".padStart(numCol)}`,
			),
		);
		console.log("-".repeat(pluginCol + numCol * 2));

		for (const summary of codexSummaries) {
			console.log(
				cyan(`rp1-${summary.plugin.padEnd(pluginCol - 4)}`) +
					green(String(summary.agents).padStart(numCol)) +
					green(String(summary.skills).padStart(numCol)),
			);
		}

		if (codexOutputPath) {
			console.log(`Output: ${cyan(resolve(codexOutputPath))}`);
		}
	}

	// Show errors if any (from both platforms)
	const allErrors = [
		...summaries.flatMap((s) => s.errors),
		...(codexSummaries ?? []).flatMap((s) => s.errors),
	];
	if (allErrors.length > 0) {
		console.log(`\n${yellow(`⚠ ${allErrors.length} errors occurred:`)}`);
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
					const projectRoot = await findProjectRoot(process.cwd());
					const outputPath = resolve(config.outputDir);
					const codexOutputPath = resolve(
						deriveCodexOutputDir(config.outputDir),
					);

					if (!config.jsonOutput) {
						logger.debug(`OpenCode output: ${outputPath}`);
						logger.debug(`Codex output: ${codexOutputPath}`);
					}

					const pluginsToBuild =
						config.plugin === "all"
							? ["base", "dev", "utils"]
							: [config.plugin];

					// Build OpenCode artifacts
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

					// Build Codex artifacts (errors do not block OpenCode output)
					const codexSummaries: BuildSummary[] = [];

					for (const pluginName of pluginsToBuild) {
						try {
							const codexResult = await buildCodexPlugin(
								pluginName,
								projectRoot,
								codexOutputPath,
								logger,
								config.jsonOutput,
							);
							codexSummaries.push(codexResult);
						} catch (e) {
							codexSummaries.push({
								plugin: pluginName,
								commands: 0,
								agents: 0,
								skills: 0,
								errors: [`[codex] Build failed for ${pluginName}: ${e}`],
							});
						}
					}

					// Generate bundle manifest if building all plugins (OpenCode only)
					if (config.plugin === "all") {
						const baseAssets = pluginAssets.get("base");
						const devAssets = pluginAssets.get("dev");
						const utilsAssets = pluginAssets.get("utils");

						if (baseAssets && devAssets && utilsAssets) {
							const pkgPath = join(projectRoot, "cli", "package.json");
							let version = "0.0.0";
							try {
								const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
								version = pkg.version ?? "0.0.0";
							} catch {
								// Fallback
							}

							const bundleManifestResult = generateBundleManifest(
								baseAssets,
								devAssets,
								utilsAssets,
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
						const allErrors = [
							...summaries.flatMap((s) => s.errors),
							...codexSummaries.flatMap((s) => s.errors),
						];
						const result = {
							status: allErrors.length === 0 ? "success" : "partial",
							opencode: {
								commands: summaries.reduce((sum, s) => sum + s.commands, 0),
								agents: summaries.reduce((sum, s) => sum + s.agents, 0),
								skills: summaries.reduce((sum, s) => sum + s.skills, 0),
							},
							codex: {
								agents: codexSummaries.reduce((sum, s) => sum + s.agents, 0),
								skills: codexSummaries.reduce((sum, s) => sum + s.skills, 0),
							},
							errors: allErrors,
						};
						console.log(JSON.stringify(result, null, 2));
					} else {
						printSummary(
							summaries,
							outputPath,
							codexSummaries,
							codexOutputPath,
						);
					}

					// Exit with error if there were errors
					const totalErrors = [...summaries, ...codexSummaries].reduce(
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
