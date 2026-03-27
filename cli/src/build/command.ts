/**
 * CLI entry point for build:opencode command.
 * Uses the LiquidJS template engine for all artifact generation across
 * OpenCode, Codex, and Claude Code platforms.
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
import { createSpinner } from "../../shared/spinner.js";
import { extractStateMachineMermaid } from "../agent-tools/state-machine/extractor.js";
import { serializeStateMachine } from "../agent-tools/state-machine/serialization.js";
import { parseAndTransform } from "../agent-tools/state-machine/transform.js";
import type { SupportedTool } from "../config/supported-tools.js";
import { colorFns } from "../lib/colors.js";
import { claudeCodeRegistry } from "./claude-code/registry.js";
import { codexRegistry } from "./codex/registry.js";
import { mapAgentToRoleType } from "./codex/role-mapper.js";
import { discoverSkillMap } from "./codex/skill-map.js";
import { validateSubAgents } from "./codex/sub-agent-validator.js";
import { validateCodexToml } from "./codex/validator.js";
import { type LintDiagnostic, lintArtifact } from "./lint/index.js";
import {
	lintAgentArguments,
	lintSkillArguments,
} from "./lint/rules/legacy-arguments.js";
import type {
	BuildConfig,
	BuildSummary,
	BundleAssetEntry,
	BundlePluginAssets,
	ClaudeCodeSkill,
	OpenCodePluginAsset,
} from "./models.js";
import { parseAgent, parseSkill } from "./parser.js";
import { preprocessConditionals } from "./preprocessor.js";
import { defaultRegistry } from "./registry.js";
import { transformNamespace } from "./tags/index.js";
import type { BuildPlatform } from "./template-context.js";
import {
	buildTemplateContext,
	withDerivedArgumentHint,
} from "./template-context.js";
import { createTemplateEngine } from "./template-engine.js";
import { injectEmitHarness } from "./transforms.js";
import { validateAgent, validateSkill } from "./validator.js";

const VALID_PLATFORMS = ["opencode", "codex", "claude-code", "all"];

/**
 * Format a lint diagnostic into a human-readable string.
 */
const formatLintDiagnostic = (d: LintDiagnostic): string => {
	const location = d.line ? `${d.file}:${d.line}` : d.file;
	return `[${d.rule}] ${location} ${d.severity}: ${d.message}`;
};

/**
 * Stub SupportedTool for platforms when the full registry is not loaded.
 * Build scripts run from source where supported-tools.generated.js may
 * not yet exist, so we provide inline defaults.
 */
const platformConfigs: Record<BuildPlatform, SupportedTool> = {
	opencode: {
		id: "opencode",
		name: "OpenCode",
		enabled: true,
		binary: "opencode",
		min_version: "0.8.0",
		instruction_file: "AGENTS.md",
		install_url: "https://opencode.ai/docs/installation",
		plugin_install_cmd: null,
		capabilities: ["plugins", "slash-commands", "agents"],
	},
	codex: {
		id: "codex",
		name: "Codex CLI",
		enabled: true,
		binary: "codex",
		min_version: "0.116.0",
		instruction_file: "AGENTS.md",
		install_url: "https://github.com/openai/codex",
		plugin_install_cmd: null,
		capabilities: ["skills", "agents"],
	},
	"claude-code": {
		id: "claude-code",
		name: "Claude Code",
		enabled: true,
		binary: "claude",
		min_version: "1.0.33",
		instruction_file: "CLAUDE.md",
		install_url:
			"https://docs.anthropic.com/en/docs/claude-code/getting-started",
		plugin_install_cmd: "claude plugin install {plugin}",
		capabilities: ["plugins", "slash-commands", "agents", "skills"],
	},
};

/**
 * Get the PlatformRegistry for a given build platform.
 */
const getRegistryForPlatform = (platform: BuildPlatform) => {
	switch (platform) {
		case "opencode":
			return defaultRegistry;
		case "codex":
			return codexRegistry;
		case "claude-code":
			return claudeCodeRegistry;
	}
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
		platform: "opencode",
		jsonOutput: false,
		lintOnly: false,
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
		} else if (arg === "--platform") {
			const value = args[++i];
			if (!value || !VALID_PLATFORMS.includes(value)) {
				return E.left(
					usageError(
						"--platform must be 'opencode', 'codex', 'claude-code', or 'all'",
					),
				);
			}
			(
				config as {
					platform: "opencode" | "codex" | "claude-code" | "all";
				}
			).platform = value as "opencode" | "codex" | "claude-code" | "all";
		} else if (arg.startsWith("--platform=")) {
			const value = arg.slice("--platform=".length);
			if (!VALID_PLATFORMS.includes(value)) {
				return E.left(
					usageError(
						"--platform must be 'opencode', 'codex', 'claude-code', or 'all'",
					),
				);
			}
			(
				config as {
					platform: "opencode" | "codex" | "claude-code" | "all";
				}
			).platform = value as "opencode" | "codex" | "claude-code" | "all";
		} else if (arg === "--json") {
			(config as { jsonOutput: boolean }).jsonOutput = true;
		} else if (arg === "--lint") {
			(config as { lintOnly: boolean }).lintOnly = true;
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
${bold("rp1 build:opencode")} - Build platform artifacts from Claude Code sources

${bold("Usage:")}
  rp1 build:opencode [options]

${bold("Options:")}
  -o, --output-dir <dir>       Output directory (default: dist/opencode/)
  -p, --plugin <name>          Build specific plugin (base, dev, utils, or all)
  --platform <name>            Target platform (opencode, codex, claude-code, or all)
  --json                       Output results as JSON for CI/CD
  --lint                       Run build pipeline with lint validation only (no file output)
  -h, --help                   Show this help message

${bold("Examples:")}
  rp1 build:opencode                              # Build all plugins for OpenCode
  rp1 build:opencode --plugin dev                  # Build only dev plugin
  rp1 build:opencode --platform claude-code        # Build for Claude Code
  rp1 build:opencode --platform codex              # Build for Codex
  rp1 build:opencode --platform all                # Build for all platforms
  rp1 build:opencode -o ./output                   # Custom output directory
  rp1 build:opencode --json                        # JSON output for CI
  rp1 build:opencode --lint                        # Lint-only mode (no file output)
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
 * Read CLI version from cli/package.json.
 */
const readCliVersion = async (projectRoot: string): Promise<string> => {
	try {
		const pkgPath = join(projectRoot, "cli", "package.json");
		const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
		return pkg.version ?? "0.0.0";
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
			.map((e) => join(dir, e.name))
			.sort();
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
		return dirs.sort();
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
 * Build a single plugin for the OpenCode platform.
 * Uses the template engine for all artifact generation.
 */
export const buildPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	_logger: Logger,
	jsonOutput: boolean,
	lintOnly = false,
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
	const cliVersion = await readCliVersion(projectRoot);

	const engine = createTemplateEngine();
	const platform: BuildPlatform = "opencode";
	const registry = getRegistryForPlatform(platform);
	const platformConfig = platformConfigs[platform];

	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	if (!lintOnly) {
		// Clean and create output directories
		try {
			await rm(pluginOutputDir, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}

		// Create output directories: agents/ (flat), skills/
		await mkdir(join(pluginOutputDir, "agents"), { recursive: true });
		await mkdir(join(pluginOutputDir, "skills"), { recursive: true });
	}

	if (!jsonOutput) {
		const mode = lintOnly ? " (lint)" : "";
		spinner.start(`Building ${pluginName} plugin${mode}...`);
	}

	const skillsDir = join(pluginDir, "skills");
	const skillDirs = await getSkillDirs(skillsDir);

	for (const skillDir of skillDirs) {
		const parseResult = await parseSkill(skillDir)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccSkill = parseResult.right;

		// Source-level argument validation (L007-L012) -- runs before rendering
		const skillArgLint = lintSkillArguments(
			ccSkill.metadata,
			ccSkill.content,
			skillDir,
		);
		const skillArgErrors = skillArgLint.filter((d) => d.severity === "error");
		if (skillArgErrors.length > 0) {
			for (const d of skillArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccSkill.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const namespacedSkillDir = `rp1-${ccSkill.name}`;

		const ctx = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "skill",
				name: ccSkill.name,
				namespacedName: namespacedSkillDir,
				description: ccSkill.description,
				allowedTools: ccSkill.allowedTools,
				content: processedContent,
				metadata: withDerivedArgumentHint(ccSkill.metadata),
				supportingFiles: ccSkill.supportingFiles,
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const renderResult = await engine.render("opencode/skill", ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const skillMdContent = injectEmitHarness(renderResult.right, platform);

		const validateResult = validateSkill(
			skillMdContent,
			`${namespacedSkillDir}/SKILL.md`,
		);
		if (E.isLeft(validateResult)) {
			errors.push(formatError(validateResult.left, false));
			continue;
		}

		const skillLint = lintArtifact(
			skillMdContent,
			platform,
			`${namespacedSkillDir}/SKILL.md`,
		);
		for (const d of skillLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (skillLint.hasErrors) {
			for (const d of skillLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		if (!lintOnly) {
			const skillOutputDir = join(
				pluginOutputDir,
				"skills",
				namespacedSkillDir,
			);
			await mkdir(skillOutputDir, { recursive: true });
			await writeFile(join(skillOutputDir, "SKILL.md"), skillMdContent);

			await copySupportingFiles(
				skillDir,
				skillOutputDir,
				ccSkill.supportingFiles,
			);
		}

		const relativePath = `${pluginName}/skills/${namespacedSkillDir}/SKILL.md`;
		skillEntries.push({ name: namespacedSkillDir, path: relativePath });

		const skillOutputDir = join(pluginOutputDir, "skills", namespacedSkillDir);
		const allSkillFiles = lintOnly ? [] : await collectAllFiles(skillOutputDir);
		for (const file of allSkillFiles) {
			const fileRelPath = `${pluginName}/skills/${namespacedSkillDir}/${file}`;
			skillFileEntries.push({
				name: `${namespacedSkillDir}/${file}`,
				path: fileRelPath,
			});
		}

		const extractedSkillMermaid = extractStateMachineMermaid(skillMdContent);
		if (extractedSkillMermaid) {
			const smParseResult = parseAndTransform(
				ccSkill.name,
				extractedSkillMermaid,
			);
			if (E.isLeft(smParseResult)) {
				errors.push(
					`State machine parse error in skill '${ccSkill.name}': ${formatError(smParseResult.left, false)}`,
				);
				continue;
			}
			stateMachineEntries.push({
				name: ccSkill.name,
				path: "",
				content: serializeStateMachine(smParseResult.right),
			});
		}
	}

	const agentsDir = join(pluginDir, "agents");
	const agentFiles = await getMarkdownFiles(agentsDir);

	for (const agentFile of agentFiles) {
		const parseResult = await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccAgent = parseResult.right;

		// Source-level argument validation (L008, L010-L012) -- runs before rendering
		const agentArgLint = lintAgentArguments(
			ccAgent.arguments,
			ccAgent.content,
			agentFile,
		);
		const agentArgErrors = agentArgLint.filter((d) => d.severity === "error");
		if (agentArgErrors.length > 0) {
			for (const d of agentArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccAgent.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const ctx = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "agent",
				name: ccAgent.name,
				description: ccAgent.description,
				model: ccAgent.model,
				tools: ccAgent.tools,
				content: processedContent,
				...(ccAgent.arguments && { arguments: ccAgent.arguments }),
				...(ccAgent.environment && { environment: ccAgent.environment }),
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const renderResult = await engine.render("opencode/agent", ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const content = injectEmitHarness(renderResult.right, platform);
		const filename = `${ccAgent.name}.md`;

		const validateResult = validateAgent(content, filename);
		if (E.isLeft(validateResult)) {
			errors.push(formatError(validateResult.left, false));
			continue;
		}

		const agentLint = lintArtifact(content, platform, filename);
		for (const d of agentLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (agentLint.hasErrors) {
			for (const d of agentLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		// Write to flat namespaced file: agents/rp1-{plugin}-{filename}
		const relativePath = `${pluginName}/agents/rp1-${pluginName}-${filename}`;
		if (!lintOnly) {
			const outputFile = join(outputPath, relativePath);
			await writeFile(outputFile, content);
		}
		agentEntries.push({ name: ccAgent.name, path: relativePath });

		const extractedAgentMermaid = extractStateMachineMermaid(ccAgent.content);
		if (extractedAgentMermaid) {
			const smParseResult = parseAndTransform(
				ccAgent.name,
				extractedAgentMermaid,
			);
			if (E.isLeft(smParseResult)) {
				errors.push(
					`State machine parse error in agent '${ccAgent.name}': ${formatError(smParseResult.left, false)}`,
				);
				continue;
			}
			stateMachineEntries.push({
				name: ccAgent.name,
				path: "",
				content: serializeStateMachine(smParseResult.right),
			});
		}
	}

	let hasOpenCodePlugin = false;
	let openCodePluginAsset: OpenCodePluginAsset | undefined;

	if (!lintOnly) {
		hasOpenCodePlugin = await copyOpenCodePlugin(pluginDir, pluginOutputDir);

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

		const commandNames = commandEntries.map((e) => e.name);
		const agentNames = agentEntries.map((e) => e.name);
		const skillNames = skillEntries.map((e) => e.name);

		const manifestCtx = buildTemplateContext(
			platform,
			`rp1-${pluginName}`,
			pluginVersion,
			{
				type: "manifest",
				skills: skillNames,
				agents: agentNames,
				commands: commandNames,
				hasOpenCodePlugin: hasOpenCodePlugin || undefined,
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const manifestResult = await engine.render(
			"opencode/manifest",
			manifestCtx,
		);
		if (E.isRight(manifestResult)) {
			await writeFile(
				join(pluginOutputDir, "manifest.json"),
				manifestResult.right,
			);
		}
	}

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
 * Derive Claude Code output directory from the OpenCode output directory.
 * Maps "dist/opencode" to "dist/claude-code".
 */
export const deriveCCOutputDir = (opencodeOutputDir: string): string => {
	const normalized = opencodeOutputDir.replace(/\/+$/, "");
	const parent = dirname(normalized);
	return join(parent, "claude-code");
};

/**
 * Derive Codex output directory from the OpenCode output directory.
 * Maps "dist/opencode" to "dist/codex".
 */
export const deriveCodexOutputDir = (opencodeOutputDir: string): string => {
	const normalized = opencodeOutputDir.replace(/\/+$/, "");
	const parent = dirname(normalized);
	return join(parent, "codex");
};

/**
 * Build a single plugin for the Claude Code platform.
 * Uses the template engine for all artifact generation.
 */
export const buildCCPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	_logger: Logger,
	jsonOutput: boolean,
	lintOnly = false,
): Promise<BuildSummary> => {
	const errors: string[] = [];

	const pluginDir = join(projectRoot, "plugins", pluginName);
	const pluginOutputDir = join(outputPath, pluginName);
	const pluginVersion = await readPluginVersion(pluginDir);
	const cliVersion = await readCliVersion(projectRoot);

	const engine = createTemplateEngine();
	const platform: BuildPlatform = "claude-code";
	const registry = getRegistryForPlatform(platform);
	const platformConfig = platformConfigs[platform];

	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	if (!lintOnly) {
		try {
			await rm(pluginOutputDir, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}

		await mkdir(join(pluginOutputDir, "skills"), { recursive: true });
		await mkdir(join(pluginOutputDir, "agents"), { recursive: true });
	}

	if (!jsonOutput) {
		const mode = lintOnly ? " (lint)" : "";
		spinner.start(`Building ${pluginName} plugin (claude-code)${mode}...`);
	}

	const skillsDir = join(pluginDir, "skills");
	const skillDirs = await getSkillDirs(skillsDir);
	let skillCount = 0;
	const skillNames: string[] = [];

	for (const skillDir of skillDirs) {
		const parseResult = await parseSkill(skillDir)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccSkill = parseResult.right;

		// Source-level argument validation (L007-L012) -- runs before rendering
		const ccSkillArgLint = lintSkillArguments(
			ccSkill.metadata,
			ccSkill.content,
			skillDir,
		);
		const ccSkillArgErrors = ccSkillArgLint.filter(
			(d) => d.severity === "error",
		);
		if (ccSkillArgErrors.length > 0) {
			for (const d of ccSkillArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccSkill.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		// CC: no prefix — Claude Code already namespaces with the plugin name
		const skillDirName = ccSkill.name;

		const ctx = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "skill",
				name: ccSkill.name,
				namespacedName: skillDirName,
				description: ccSkill.description,
				allowedTools: ccSkill.allowedTools,
				content: processedContent,
				metadata: withDerivedArgumentHint(ccSkill.metadata),
				supportingFiles: ccSkill.supportingFiles,
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const renderResult = await engine.render("claude-code/skill", ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const ccSkillContent = injectEmitHarness(renderResult.right, platform);

		const ccSkillLint = lintArtifact(
			ccSkillContent,
			platform,
			`${skillDirName}/SKILL.md`,
		);
		for (const d of ccSkillLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (ccSkillLint.hasErrors) {
			for (const d of ccSkillLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		if (!lintOnly) {
			const skillOutputDir = join(pluginOutputDir, "skills", skillDirName);
			await mkdir(skillOutputDir, { recursive: true });
			await writeFile(join(skillOutputDir, "SKILL.md"), ccSkillContent);

			await copySupportingFiles(
				skillDir,
				skillOutputDir,
				ccSkill.supportingFiles,
			);
		}

		skillNames.push(skillDirName);
		skillCount++;
	}

	const agentsDir = join(pluginDir, "agents");
	const agentFiles = await getMarkdownFiles(agentsDir);
	let agentCount = 0;
	const agentNames: string[] = [];

	for (const agentFile of agentFiles) {
		const parseResult = await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccAgent = parseResult.right;

		// Source-level argument validation (L008, L010-L012) -- runs before rendering
		const ccAgentArgLint = lintAgentArguments(
			ccAgent.arguments,
			ccAgent.content,
			agentFile,
		);
		const ccAgentArgErrors = ccAgentArgLint.filter(
			(d) => d.severity === "error",
		);
		if (ccAgentArgErrors.length > 0) {
			for (const d of ccAgentArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccAgent.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const ctx = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "agent",
				name: ccAgent.name,
				description: ccAgent.description,
				model: ccAgent.model,
				tools: ccAgent.tools,
				content: processedContent,
				...(ccAgent.arguments && { arguments: ccAgent.arguments }),
				...(ccAgent.environment && { environment: ccAgent.environment }),
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const renderResult = await engine.render("claude-code/agent", ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const ccAgentContent = injectEmitHarness(renderResult.right, platform);

		const ccAgentLint = lintArtifact(
			ccAgentContent,
			platform,
			`${ccAgent.name}.md`,
		);
		for (const d of ccAgentLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (ccAgentLint.hasErrors) {
			for (const d of ccAgentLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		if (!lintOnly) {
			const outputFile = join(pluginOutputDir, "agents", `${ccAgent.name}.md`);
			await writeFile(outputFile, ccAgentContent);
		}

		agentNames.push(ccAgent.name);
		agentCount++;
	}

	if (!lintOnly) {
		const manifestCtx = buildTemplateContext(
			platform,
			`rp1-${pluginName}`,
			pluginVersion,
			{
				type: "manifest",
				skills: skillNames,
				agents: agentNames,
				commands: [],
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const manifestResult = await engine.render(
			"claude-code/manifest",
			manifestCtx,
		);
		if (E.isRight(manifestResult)) {
			await writeFile(
				join(pluginOutputDir, "manifest.json"),
				manifestResult.right,
			);
		}

		// Copy plugin metadata and hooks for marketplace installation
		for (const dir of [".claude-plugin", "hooks"]) {
			const srcDir = join(pluginDir, dir);
			try {
				const dirStat = await stat(srcDir);
				if (dirStat.isDirectory()) {
					await copyDirectory(srcDir, join(pluginOutputDir, dir));
				}
			} catch {
				// Directory doesn't exist — skip
			}
		}
	}

	if (!jsonOutput) {
		const hasErrors = errors.length > 0;
		const mode = lintOnly ? " lint" : "";
		const summary = `${pluginName} (claude-code${mode}): ${agentCount} agents, ${skillCount} skills`;
		if (hasErrors) {
			spinner.fail(`${summary} (${errors.length} errors)`);
		} else {
			spinner.succeed(summary);
		}
	}

	return {
		plugin: pluginName,
		commands: 0,
		agents: agentCount,
		skills: skillCount,
		errors,
	};
};

/**
 * Build a single plugin for the Codex platform.
 * Uses the template engine for all artifact generation.
 * Produces: skill dirs with SKILL.md + agents/openai.yaml, per-agent TOML files,
 * rp1-agents.toml config, AGENTS.md listing, and manifest.json.
 */
export const buildCodexPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	_logger: Logger,
	jsonOutput: boolean,
	lintOnly = false,
): Promise<BuildSummary> => {
	const errors: string[] = [];

	const pluginDir = join(projectRoot, "plugins", pluginName);
	const pluginOutputDir = join(outputPath, pluginName);
	const pluginVersion = await readPluginVersion(pluginDir);
	const cliVersion = await readCliVersion(projectRoot);

	const engine = createTemplateEngine();
	const platform: BuildPlatform = "codex";
	const registry = getRegistryForPlatform(platform);
	const platformConfig = platformConfigs[platform];
	const skillMap = discoverSkillMap(projectRoot);

	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	if (!lintOnly) {
		try {
			await rm(pluginOutputDir, { recursive: true, force: true });
		} catch {
			// Directory might not exist
		}

		await mkdir(join(pluginOutputDir, "skills"), { recursive: true });
		await mkdir(join(pluginOutputDir, "agents"), { recursive: true });
	}

	if (!jsonOutput) {
		const mode = lintOnly ? " (lint)" : "";
		spinner.start(`Building ${pluginName} plugin (codex)${mode}...`);
	}

	const skillsDir = join(pluginDir, "skills");
	const skillDirs = await getSkillDirs(skillsDir);
	let skillCount = 0;
	const skillNames: string[] = [];
	const parsedSkills: ClaudeCodeSkill[] = [];

	for (const skillDir of skillDirs) {
		const parseResult = await parseSkill(skillDir)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccSkill = parseResult.right;
		parsedSkills.push(ccSkill);

		// Source-level argument validation (L007-L012) -- runs before rendering
		const codexSkillArgLint = lintSkillArguments(
			ccSkill.metadata,
			ccSkill.content,
			skillDir,
		);
		const codexSkillArgErrors = codexSkillArgLint.filter(
			(d) => d.severity === "error",
		);
		if (codexSkillArgErrors.length > 0) {
			for (const d of codexSkillArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccSkill.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const namespacedSkillDir = `rp1-${ccSkill.name}`;

		const ctx = {
			...buildTemplateContext(
				platform,
				pluginName,
				pluginVersion,
				{
					type: "skill" as const,
					name: ccSkill.name,
					namespacedName: namespacedSkillDir,
					description: ccSkill.description,
					allowedTools: ccSkill.allowedTools,
					content: processedContent,
					metadata: withDerivedArgumentHint(ccSkill.metadata),
					supportingFiles: ccSkill.supportingFiles,
				},
				registry,
				cliVersion,
				platformConfig,
			),
			skillMap,
		};

		const renderResult = await engine.render("codex/skill", ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const codexSkillContent = injectEmitHarness(renderResult.right, platform);

		const codexSkillLint = lintArtifact(
			codexSkillContent,
			platform,
			`${namespacedSkillDir}/SKILL.md`,
		);
		for (const d of codexSkillLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (codexSkillLint.hasErrors) {
			for (const d of codexSkillLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		if (!lintOnly) {
			const skillOutputDir = join(
				pluginOutputDir,
				"skills",
				namespacedSkillDir,
			);
			await mkdir(skillOutputDir, { recursive: true });
			await writeFile(join(skillOutputDir, "SKILL.md"), codexSkillContent);

			await copySupportingFiles(
				skillDir,
				skillOutputDir,
				ccSkill.supportingFiles,
			);

			const agentsSubDir = join(skillOutputDir, "agents");
			await mkdir(agentsSubDir, { recursive: true });

			const openaiYamlCtx = {
				...buildTemplateContext(
					platform,
					pluginName,
					pluginVersion,
					{
						type: "skill" as const,
						name: ccSkill.name,
						namespacedName: namespacedSkillDir,
						description: ccSkill.description,
						content: processedContent,
						supportingFiles: ccSkill.supportingFiles,
					},
					registry,
					cliVersion,
					platformConfig,
				),
			};

			const yamlResult = await engine.render(
				"codex/openai-yaml",
				openaiYamlCtx,
			);
			if (E.isRight(yamlResult)) {
				await writeFile(join(agentsSubDir, "openai.yaml"), yamlResult.right);
			}
		}

		skillNames.push(namespacedSkillDir);
		skillCount++;
	}

	const subAgentValidation = validateSubAgents(projectRoot, parsedSkills);
	errors.push(...subAgentValidation.errors);
	if (!jsonOutput) {
		for (const warning of subAgentValidation.warnings) {
			console.warn(`[sub-agent] ${warning}`);
		}
		for (const info of subAgentValidation.info) {
			console.info(`[sub-agent] ${info}`);
		}
	}

	const agentsDir = join(pluginDir, "agents");
	const agentFiles = await getMarkdownFiles(agentsDir);
	let agentCount = 0;
	const agentNames: string[] = [];

	interface CodexAgentInfo {
		name: string;
		description: string;
		roleType: string;
	}
	const codexAgents: CodexAgentInfo[] = [];

	for (const agentFile of agentFiles) {
		const parseResult = await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccAgent = parseResult.right;

		// Source-level argument validation (L008, L010-L012) -- runs before rendering
		const codexAgentArgLint = lintAgentArguments(
			ccAgent.arguments,
			ccAgent.content,
			agentFile,
		);
		const codexAgentArgErrors = codexAgentArgLint.filter(
			(d) => d.severity === "error",
		);
		if (codexAgentArgErrors.length > 0) {
			for (const d of codexAgentArgErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			ccAgent.content,
			platform,
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const roleTypeValue = mapAgentToRoleType(ccAgent.name, ccAgent.description);
		const codexAgentName = transformNamespace(
			`rp1-${pluginName}:${ccAgent.name}`,
			"codex",
		);

		const agentTomlCtx = {
			...buildTemplateContext(
				platform,
				pluginName,
				pluginVersion,
				{
					type: "agent" as const,
					name: ccAgent.name,
					description: ccAgent.description,
					model: ccAgent.model,
					tools: ccAgent.tools,
					content: processedContent,
					roleType: roleTypeValue,
					...(ccAgent.arguments && { arguments: ccAgent.arguments }),
					...(ccAgent.environment && { environment: ccAgent.environment }),
				},
				registry,
				cliVersion,
				platformConfig,
			),
			skillMap,
		};

		const tomlResult = await engine.render("codex/agent-toml", agentTomlCtx);
		if (E.isLeft(tomlResult)) {
			errors.push(formatError(tomlResult.left, false));
			continue;
		}
		const codexAgentContent = injectEmitHarness(tomlResult.right, platform);

		const codexAgentLint = lintArtifact(
			codexAgentContent,
			platform,
			`${codexAgentName}.toml`,
		);
		for (const d of codexAgentLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput) {
				console.warn(formatLintDiagnostic(d));
			}
		}
		if (codexAgentLint.hasErrors) {
			for (const d of codexAgentLint.diagnostics.filter(
				(d) => d.severity === "error",
			)) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		if (!lintOnly) {
			const tomlFilename = `${codexAgentName}.toml`;
			await writeFile(
				join(pluginOutputDir, "agents", tomlFilename),
				codexAgentContent,
			);
		}

		codexAgents.push({
			name: codexAgentName,
			description: ccAgent.description,
			roleType: roleTypeValue,
		});
		agentNames.push(codexAgentName);
		agentCount++;
	}

	if (!lintOnly && codexAgents.length > 0) {
		const agentConfigCtx = {
			platform,
			pluginName,
			artifact: { agents: codexAgents },
			registry,
		};
		const configResult = await engine.render(
			"codex/agent-config",
			agentConfigCtx,
		);
		if (E.isRight(configResult)) {
			const tomlValidation = validateCodexToml(
				configResult.right,
				`${pluginName}/rp1-agents.toml`,
			);
			if (E.isLeft(tomlValidation)) {
				errors.push(formatError(tomlValidation.left, false));
			} else {
				await writeFile(
					join(pluginOutputDir, "rp1-agents.toml"),
					configResult.right,
				);
			}
		} else {
			errors.push(formatError(configResult.left, false));
		}

		const agentsMdCtx = {
			platform,
			pluginName,
			artifact: { agents: codexAgents },
			registry,
		};
		const agentsMdResult = await engine.render("codex/agents-md", agentsMdCtx);
		if (E.isRight(agentsMdResult)) {
			await writeFile(join(pluginOutputDir, "AGENTS.md"), agentsMdResult.right);
		}
	}

	if (!lintOnly) {
		const manifestCtx = buildTemplateContext(
			platform,
			`rp1-${pluginName}`,
			pluginVersion,
			{
				type: "manifest",
				skills: skillNames,
				agents: agentNames,
				commands: [],
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const manifestResult = await engine.render("codex/manifest", manifestCtx);
		if (E.isRight(manifestResult)) {
			await writeFile(
				join(pluginOutputDir, "manifest.json"),
				manifestResult.right,
			);
		}
	}

	if (!jsonOutput) {
		const hasErrors = errors.length > 0;
		const mode = lintOnly ? " lint" : "";
		const summary = `${pluginName} (codex${mode}): ${agentCount} agents, ${skillCount} skills`;
		if (hasErrors) {
			spinner.fail(`${summary} (${errors.length} errors)`);
		} else {
			spinner.succeed(summary);
		}
	}

	return {
		plugin: pluginName,
		commands: 0,
		agents: agentCount,
		skills: skillCount,
		errors,
	};
};

/**
 * Print build summary table.
 */
const printSummary = (summaries: BuildSummary[], outputPath: string): void => {
	const { bold, green, cyan, yellow, boldGreen } = colorFns;
	console.log(`\n${boldGreen("✓ Build complete!")}\n`);

	// Calculate column widths
	const pluginCol = 12;
	const numCol = 10;

	// Header
	console.log(
		bold(
			`${"Plugin".padEnd(pluginCol)}${"Agents".padStart(numCol)}${"Skills".padStart(numCol)}`,
		),
	);
	console.log("-".repeat(pluginCol + numCol * 2));

	// Rows
	for (const summary of summaries) {
		console.log(
			cyan(`rp1-${summary.plugin.padEnd(pluginCol - 4)}`) +
				green(String(summary.agents).padStart(numCol)) +
				green(String(summary.skills).padStart(numCol)),
		);
	}

	console.log(`\nOutput directory: ${cyan(resolve(outputPath))}`);

	// Show errors if any
	const allErrors = summaries.flatMap((s) => s.errors);
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
 * Build OpenCode artifacts for the given plugins.
 */
const buildOpenCodeArtifacts = async (
	pluginsToBuild: string[],
	projectRoot: string,
	outputPath: string,
	config: BuildConfig,
	logger: Logger,
): Promise<{
	summaries: BuildSummary[];
	pluginAssets: Map<string, BundlePluginAssets>;
}> => {
	const summaries: BuildSummary[] = [];
	const pluginAssets: Map<string, BundlePluginAssets> = new Map();

	for (const pluginName of pluginsToBuild) {
		const result = await buildPlugin(
			pluginName,
			projectRoot,
			outputPath,
			logger,
			config.jsonOutput,
			config.lintOnly,
		);
		summaries.push(result.summary);
		pluginAssets.set(pluginName, result.assets);
	}

	if (!config.lintOnly && config.plugin === "all") {
		const baseAssets = pluginAssets.get("base");
		const devAssets = pluginAssets.get("dev");
		const utilsAssets = pluginAssets.get("utils");

		if (baseAssets && devAssets) {
			const cliVersion = await readCliVersion(projectRoot);
			const engine = createTemplateEngine();

			const bundleCtx = {
				platform: "opencode",
				pluginName: "bundle",
				version: cliVersion,
				buildTimestamp: new Date().toISOString(),
				artifact: {
					type: "bundle-manifest",
					baseJson: JSON.stringify(baseAssets, null, 2),
					devJson: JSON.stringify(devAssets, null, 2),
					...(utilsAssets && {
						utilsJson: JSON.stringify(utilsAssets, null, 2),
					}),
				},
				registry: defaultRegistry,
			};

			const bundleResult = await engine.render(
				"opencode/bundle-manifest",
				bundleCtx,
			);
			if (E.isRight(bundleResult)) {
				await writeFile(
					join(outputPath, "bundle-manifest.json"),
					bundleResult.right,
				);
				if (!config.jsonOutput) {
					logger.debug("Generated bundle-manifest.json");
				}
			}
		}
	}

	return { summaries, pluginAssets };
};

/**
 * Build Claude Code artifacts for the given plugins.
 */
const buildClaudeCodeArtifacts = async (
	pluginsToBuild: string[],
	projectRoot: string,
	outputPath: string,
	config: BuildConfig,
	logger: Logger,
): Promise<BuildSummary[]> => {
	const summaries: BuildSummary[] = [];

	for (const pluginName of pluginsToBuild) {
		const result = await buildCCPlugin(
			pluginName,
			projectRoot,
			outputPath,
			logger,
			config.jsonOutput,
			config.lintOnly,
		);
		summaries.push(result);
	}

	return summaries;
};

/**
 * Build Codex artifacts for the given plugins.
 */
const buildCodexArtifacts = async (
	pluginsToBuild: string[],
	projectRoot: string,
	outputPath: string,
	config: BuildConfig,
	logger: Logger,
): Promise<BuildSummary[]> => {
	const summaries: BuildSummary[] = [];

	for (const pluginName of pluginsToBuild) {
		const result = await buildCodexPlugin(
			pluginName,
			projectRoot,
			outputPath,
			logger,
			config.jsonOutput,
			config.lintOnly,
		);
		summaries.push(result);
	}

	return summaries;
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
					const ccOutputPath = deriveCCOutputDir(outputPath);
					const codexOutputPath = deriveCodexOutputDir(outputPath);

					if (!config.jsonOutput) {
						logger.debug(`Output directory: ${outputPath}`);
						if (
							config.platform === "claude-code" ||
							config.platform === "all"
						) {
							logger.debug(`Claude Code output directory: ${ccOutputPath}`);
						}
						if (
							(config.platform === "codex" || config.platform === "all") &&
							platformConfigs.codex.enabled !== false
						) {
							logger.debug(`Codex output directory: ${codexOutputPath}`);
						}
					}

					// Only distributable plugins by default; utils is internal-only
					// and excluded from the production marketplace. Set
					// RP1_BUILD_INTERNAL=1 to include it (used by build-local-dev).
					const pluginsToBuild =
						config.plugin === "all"
							? process.env.RP1_BUILD_INTERNAL
								? ["base", "dev", "utils"]
								: ["base", "dev"]
							: [config.plugin];

					const allSummaries: BuildSummary[] = [];

					if (config.platform === "opencode" || config.platform === "all") {
						const { summaries } = await buildOpenCodeArtifacts(
							pluginsToBuild,
							projectRoot,
							outputPath,
							config,
							logger,
						);
						allSummaries.push(...summaries);
					}

					if (config.platform === "claude-code" || config.platform === "all") {
						const ccSummaries = await buildClaudeCodeArtifacts(
							pluginsToBuild,
							projectRoot,
							ccOutputPath,
							config,
							logger,
						);
						allSummaries.push(...ccSummaries);
					}

					if (config.platform === "codex" || config.platform === "all") {
						if (platformConfigs.codex.enabled !== false) {
							const codexSummaries = await buildCodexArtifacts(
								pluginsToBuild,
								projectRoot,
								codexOutputPath,
								config,
								logger,
							);
							allSummaries.push(...codexSummaries);
						} else if (config.platform === "codex") {
							logger.warn(
								"Codex platform is disabled — skipping artifact generation",
							);
						}
					}

					if (config.jsonOutput) {
						const allErrors = allSummaries.flatMap((s) => s.errors);
						const result = {
							status: allErrors.length === 0 ? "success" : "partial",
							commands: allSummaries.reduce((sum, s) => sum + s.commands, 0),
							agents: allSummaries.reduce((sum, s) => sum + s.agents, 0),
							skills: allSummaries.reduce((sum, s) => sum + s.skills, 0),
							errors: allErrors,
						};
						console.log(JSON.stringify(result, null, 2));
					} else {
						printSummary(allSummaries, outputPath);
					}

					const totalErrors = allSummaries.reduce(
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
