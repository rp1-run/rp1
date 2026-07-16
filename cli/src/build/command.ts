/**
 * CLI entry point for the build command.
 * Uses the LiquidJS template engine for all artifact generation across
 * OpenCode, Codex, and Claude Code platforms via a single data-driven
 * buildPlatformPlugin() function backed by PlatformDefinition configuration.
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
import { dirname, join, relative, resolve } from "node:path";
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
import { colorFns } from "../lib/colors.js";
import { generateCatalog } from "./catalog-generator.js";
import { validateCodexSkill } from "./codex/validator.js";
import { type LintDiagnostic, lintArtifact } from "./lint/index.js";
import { lintSkillDescriptionLength } from "./lint/rules/description-length.js";
import {
	lintAgentArguments,
	lintSkillArguments,
} from "./lint/rules/legacy-arguments.js";
import type {
	BuildConfig,
	BuildSummary,
	BundleAgentEntry,
	BundleAssetEntry,
	BundlePluginAssets,
	EffortLevel,
	ModelTier,
	OpenCodePluginAsset,
	SkillCategory,
	SkillMetadata,
} from "./models.js";
import { ParseCache } from "./parse-cache.js";
import { parseAgent, parseSkill } from "./parser.js";
import type {
	HookContext,
	PlatformBuildState,
	PlatformDefinition,
} from "./platform-definitions.js";
import { PLATFORM_DEFINITIONS } from "./platform-definitions.js";
import {
	preprocessConditionals,
	resolveSharedIncludes,
} from "./preprocessor.js";
import { defaultRegistry } from "./registry.js";
import type { BuildPlatform } from "./template-context.js";
import {
	buildTemplateContext,
	withDerivedArgumentHint,
} from "./template-context.js";
import { createTemplateEngine } from "./template-engine.js";
import { resolveEffort, resolveTier } from "./tier-resolution.js";
import { injectEmitHarness } from "./transforms.js";
import {
	validateAgent,
	validateAgentTierAndEffort,
	validateSkill,
} from "./validator.js";

const VALID_PLATFORMS = [
	"opencode",
	"codex",
	"claude-code",
	"copilot",
	"antigravity",
	"all",
];
const PLATFORM_ERROR =
	"--platform must be 'opencode', 'codex', 'claude-code', 'copilot', 'antigravity', or 'all'";

/**
 * Format a lint diagnostic into a human-readable string.
 */
const formatLintDiagnostic = (d: LintDiagnostic): string => {
	const location = d.line ? `${d.file}:${d.line}` : d.file;
	return `[${d.rule}] ${location} ${d.severity}: ${d.message}`;
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
				return E.left(usageError(PLATFORM_ERROR));
			}
			(
				config as {
					platform:
						| "opencode"
						| "codex"
						| "claude-code"
						| "copilot"
						| "antigravity"
						| "all";
				}
			).platform = value as
				| "opencode"
				| "codex"
				| "claude-code"
				| "copilot"
				| "antigravity"
				| "all";
		} else if (arg.startsWith("--platform=")) {
			const value = arg.slice("--platform=".length);
			if (!VALID_PLATFORMS.includes(value)) {
				return E.left(usageError(PLATFORM_ERROR));
			}
			(
				config as {
					platform:
						| "opencode"
						| "codex"
						| "claude-code"
						| "copilot"
						| "antigravity"
						| "all";
				}
			).platform = value as
				| "opencode"
				| "codex"
				| "claude-code"
				| "copilot"
				| "antigravity"
				| "all";
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
  --platform <name>            Target platform (opencode, codex, claude-code, copilot, antigravity, or all)
  --json                       Output results as JSON for CI/CD
  --lint                       Run build pipeline with lint validation only (no file output)
  -h, --help                   Show this help message

${bold("Examples:")}
  rp1 build:opencode                              # Build all plugins for OpenCode
  rp1 build:opencode --plugin dev                  # Build only dev plugin
  rp1 build:opencode --platform claude-code        # Build for Claude Code
  rp1 build:opencode --platform codex              # Build for Codex
  rp1 build:opencode --platform antigravity        # Build for Antigravity CLI
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
		} catch {}
		current = dirname(current);
	}

	throw new Error("Could not find project root (no plugins/ directory found)");
};

/**
 * Read plugin version from .claude-plugin/plugin.json.
 * Falls back to "0.0.0" if file doesn't exist or is invalid.
 */
const formatBuildPluginVersion = (
	version: string,
	platform: string,
): string => {
	if (platform !== "claude-code" || !process.env.RP1_BUILD_INTERNAL) {
		return version;
	}

	return version.includes("-") ? version : `${version}-dev`;
};

const readPluginVersion = async (
	pluginDir: string,
	platform: string,
): Promise<string> => {
	try {
		const pluginJsonPath = join(pluginDir, ".claude-plugin", "plugin.json");
		const content = await readFile(pluginJsonPath, "utf-8");
		const json = JSON.parse(content) as { version?: string };
		return formatBuildPluginVersion(json.version ?? "0.0.0", platform);
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
				} catch {}
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
	} catch {}
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
		} catch {}
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

const maybeRewriteClaudePluginManifest = async (
	destDir: string,
	platform: string,
	pluginVersion: string,
): Promise<void> => {
	if (platform !== "claude-code" || !process.env.RP1_BUILD_INTERNAL) {
		return;
	}

	const pluginJsonPath = join(destDir, "plugin.json");

	try {
		const content = await readFile(pluginJsonPath, "utf-8");
		const json = JSON.parse(content) as Record<string, unknown>;
		json.version = pluginVersion;
		await writeFile(pluginJsonPath, `${JSON.stringify(json, null, 2)}\n`);
	} catch {
		// Leave copied manifest untouched if it's missing or invalid.
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
	} catch {}

	return entries;
};

/**
 * Get OpenCode plugin name for a given plugin.
 * Returns "{pluginName}-hooks" (e.g., "rp1-base-hooks" for base plugin).
 */
const getOpenCodePluginName = (pluginName: string): string => {
	return `rp1-${pluginName}-hooks`;
};

const LEGACY_OPEN_CODE_SKILL_CATEGORY: Readonly<Record<string, SkillCategory>> =
	{
		base: "knowledge",
		dev: "development",
		utils: "prompt",
	};

const ensureOpenCodeDiscoveryMetadata = (
	pluginName: string,
	metadata: SkillMetadata | undefined,
): SkillMetadata => ({
	...(metadata ?? {}),
	category:
		metadata?.category ??
		LEGACY_OPEN_CODE_SKILL_CATEGORY[pluginName] ??
		"development",
	isWorkflow: metadata?.isWorkflow ?? false,
});

/**
 * Unified build result for all platforms. Platforms that do not produce
 * bundle assets return empty arrays.
 */
export interface PlatformBuildResult {
	summary: BuildSummary;
	assets: BundlePluginAssets;
	hasOpenCodePlugin: boolean;
}

/**
 * Build a single plugin for any platform using the data-driven PlatformDefinition.
 * Replaces the previous per-platform buildPlugin, buildCCPlugin, and buildCodexPlugin
 * functions with a single generic parse-preprocess-render-lint-write loop that
 * dispatches to platform-specific lifecycle hooks.
 */
export const buildPlatformPlugin = async (
	pluginName: string,
	projectRoot: string,
	outputPath: string,
	definition: PlatformDefinition,
	_logger: Logger,
	jsonOutput: boolean,
	lintOnly = false,
	cache?: ParseCache,
	diagnostics?: string[],
): Promise<PlatformBuildResult> => {
	const errors: string[] = [];
	const commandEntries: BundleAssetEntry[] = [];
	const agentEntries: BundleAgentEntry[] = [];
	const skillEntries: BundleAssetEntry[] = [];
	const skillFileEntries: BundleAssetEntry[] = [];
	const stateMachineEntries: BundleAssetEntry[] = [];
	const verbatimFileEntries: BundleAssetEntry[] = [];

	const platform = definition.id;
	const pluginDir = join(projectRoot, "plugins", pluginName);
	const pluginOutputDir = join(outputPath, pluginName);
	const pluginVersion = await readPluginVersion(pluginDir, definition.id);
	const cliVersion = await readCliVersion(projectRoot);

	const engine = createTemplateEngine();
	const registry = definition.registry;
	const platformConfig = definition.config;

	const spinner = createSpinner(!jsonOutput && (process.stdout.isTTY ?? false));

	const hookCtx: HookContext = {
		projectRoot,
		pluginName,
		pluginDir,
		outputDir: pluginOutputDir,
		engine,
		registry,
		platformConfig,
		pluginVersion,
		cliVersion,
		platform,
		jsonOutput,
	};

	let buildState: PlatformBuildState = {};
	if (definition.hooks?.preparePlugin) {
		buildState = await definition.hooks.preparePlugin(hookCtx);
	}

	if (!lintOnly) {
		try {
			await rm(pluginOutputDir, { recursive: true, force: true });
		} catch {}

		await mkdir(join(pluginOutputDir, "agents"), { recursive: true });
		await mkdir(join(pluginOutputDir, "skills"), { recursive: true });
	}

	if (!jsonOutput && !diagnostics) {
		const platformLabel = platform === "opencode" ? "" : ` (${platform})`;
		const mode = lintOnly ? " (lint)" : "";
		spinner.start(`Building ${pluginName} plugin${platformLabel}${mode}...`);
	}

	const skillsDir = join(pluginDir, "skills");
	const skillDirs = await getSkillDirs(skillsDir);
	const skillNames: string[] = [];

	const suppressOutput = diagnostics !== undefined;
	const emitWarn = (msg: string): void => {
		if (diagnostics) {
			diagnostics.push(msg);
		} else {
			console.warn(msg);
		}
	};

	for (const skillDir of skillDirs) {
		const parseResult = cache
			? await cache.getSkill(skillDir)
			: await parseSkill(skillDir)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccSkill = parseResult.right;

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

		const descLint = lintSkillDescriptionLength(ccSkill.description, skillDir);
		for (const d of descLint) {
			if (d.severity === "warning" && !jsonOutput && !suppressOutput) {
				emitWarn(formatLintDiagnostic(d));
			}
		}
		const descErrors = descLint.filter((d) => d.severity === "error");
		if (descErrors.length > 0) {
			for (const d of descErrors) {
				errors.push(formatLintDiagnostic(d));
			}
			continue;
		}

		const includeResult = await resolveSharedIncludes(
			ccSkill.content,
			projectRoot,
		);
		if (E.isLeft(includeResult)) {
			errors.push(formatError(includeResult.left, false));
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			includeResult.right,
			platform,
			undefined,
			undefined,
			{ platformConfig, artifactKind: "skill" },
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		const namespacedSkillDir = `${definition.naming.skillDirPrefix}${ccSkill.name}`;
		const skillMetadata = withDerivedArgumentHint(ccSkill.metadata);
		const renderedSkillMetadata =
			platform === "opencode"
				? ensureOpenCodeDiscoveryMetadata(pluginName, skillMetadata)
				: skillMetadata;

		const skillSchemaPath = relative(projectRoot, join(skillDir, "SKILL.md"))
			.split("\\")
			.join("/");
		const workflowTarget =
			ccSkill.metadata?.isWorkflow === true
				? {
						name: ccSkill.name,
						schemaPath: skillSchemaPath,
					}
				: undefined;

		let ctx: Record<string, unknown> = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "skill",
				name: ccSkill.name,
				namespacedName: namespacedSkillDir,
				schemaPath: skillSchemaPath,
				workflowTarget,
				description: ccSkill.description,
				allowedTools: ccSkill.allowedTools,
				content: processedContent,
				metadata: renderedSkillMetadata,
				supportingFiles: ccSkill.supportingFiles,
			},
			registry,
			cliVersion,
			platformConfig,
		);

		if (definition.hooks?.enrichSkillContext) {
			ctx = definition.hooks.enrichSkillContext(ctx, buildState);
		}

		const renderResult = await engine.render(definition.templates.skill, ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const skillContent = injectEmitHarness(renderResult.right, platform);

		const validateResult =
			platform === "codex" || platform === "copilot"
				? validateCodexSkill(skillContent, `${namespacedSkillDir}/SKILL.md`)
				: validateSkill(skillContent, `${namespacedSkillDir}/SKILL.md`);
		if (E.isLeft(validateResult)) {
			errors.push(formatError(validateResult.left, false));
			continue;
		}

		const skillLint = lintArtifact(
			skillContent,
			platform,
			`${namespacedSkillDir}/SKILL.md`,
		);
		for (const d of skillLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput && !suppressOutput) {
				emitWarn(formatLintDiagnostic(d));
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
			await writeFile(join(skillOutputDir, "SKILL.md"), skillContent);

			await copySupportingFiles(
				skillDir,
				skillOutputDir,
				ccSkill.supportingFiles,
			);

			if (definition.hooks?.postSkillWrite) {
				await definition.hooks.postSkillWrite(
					skillOutputDir,
					ccSkill,
					buildState,
					hookCtx,
				);
			}
		}

		skillNames.push(namespacedSkillDir);

		if (definition.producesBundleAssets) {
			const relativePath = `${pluginName}/skills/${namespacedSkillDir}/SKILL.md`;
			skillEntries.push({ name: namespacedSkillDir, path: relativePath });

			const skillOutputDir = join(
				pluginOutputDir,
				"skills",
				namespacedSkillDir,
			);
			const allSkillFiles = lintOnly
				? []
				: await collectAllFiles(skillOutputDir);
			for (const file of allSkillFiles) {
				const fileRelPath = `${pluginName}/skills/${namespacedSkillDir}/${file}`;
				skillFileEntries.push({
					name: `${namespacedSkillDir}/${file}`,
					path: fileRelPath,
				});
			}
		}

		const extractedSkillMermaid = extractStateMachineMermaid(skillContent);
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
	const agentNames: string[] = [];

	for (const agentFile of agentFiles) {
		const parseResult = cache
			? await cache.getAgent(agentFile)
			: await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}
		const ccAgent = parseResult.right;

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

		const tierValidation = validateAgentTierAndEffort(
			ccAgent.name,
			ccAgent.model,
			ccAgent.effort,
			agentFile,
		);
		for (const warning of tierValidation.warnings) {
			emitWarn(warning);
		}
		if (tierValidation.errors.length > 0) {
			for (const err of tierValidation.errors) {
				errors.push(err);
			}
			continue;
		}

		const agentIncludeResult = await resolveSharedIncludes(
			ccAgent.content,
			projectRoot,
		);
		if (E.isLeft(agentIncludeResult)) {
			errors.push(formatError(agentIncludeResult.left, false));
			continue;
		}

		const preprocessResult = await preprocessConditionals(
			agentIncludeResult.right,
			platform,
			undefined,
			undefined,
			{ platformConfig, artifactKind: "agent" },
		);
		if (E.isLeft(preprocessResult)) {
			errors.push(formatError(preprocessResult.left, false));
			continue;
		}
		const processedContent = preprocessResult.right;

		// resolveTier returns null for unmapped platforms (opencode, copilot) and
		// "inherit" tier. Falling back to "inherit" ensures templates omit the
		// model field rather than emitting a raw tier alias like "deep".
		const resolvedModel =
			resolveTier(ccAgent.model as ModelTier, platform) ?? "inherit";
		const effortResolution = resolveEffort(
			ccAgent.effort as EffortLevel | undefined,
			ccAgent.model as ModelTier,
			platform,
		);

		let ctx: Record<string, unknown> = buildTemplateContext(
			platform,
			pluginName,
			pluginVersion,
			{
				type: "agent",
				name: ccAgent.name,
				description: ccAgent.description,
				model: resolvedModel,
				tools: ccAgent.tools,
				content: processedContent,
				...(effortResolution && {
					effortFieldName: effortResolution.fieldName,
					effortValue: effortResolution.value,
				}),
				...(ccAgent.arguments && { arguments: ccAgent.arguments }),
				...(ccAgent.environment && { environment: ccAgent.environment }),
			},
			registry,
			cliVersion,
			platformConfig,
		);

		if (definition.hooks?.enrichAgentContext) {
			ctx = definition.hooks.enrichAgentContext(ctx, ccAgent, buildState);
		}

		const renderResult = await engine.render(definition.templates.agent, ctx);
		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			continue;
		}
		const content = injectEmitHarness(renderResult.right, platform);

		const agentOutputName = definition.naming.agentFileName(
			pluginName,
			ccAgent.name,
		);
		const agentFilename = `${agentOutputName}${definition.naming.agentExtension}`;

		const agentLint = lintArtifact(content, platform, agentFilename);
		for (const d of agentLint.diagnostics) {
			if (d.severity === "warning" && !jsonOutput && !suppressOutput) {
				emitWarn(formatLintDiagnostic(d));
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

		// Validate agent (OpenCode only -- validateAgent checks for YAML
		// frontmatter which only the OpenCode agent template produces;
		// Claude Code agents are raw markdown without frontmatter).
		if (platform === "opencode") {
			const validateResult = validateAgent(content, agentFilename);
			if (E.isLeft(validateResult)) {
				errors.push(formatError(validateResult.left, false));
				continue;
			}
		}

		if (!lintOnly) {
			await writeFile(join(pluginOutputDir, "agents", agentFilename), content);
		}

		agentNames.push(agentOutputName);

		if (definition.producesBundleAssets) {
			const relativePath = `${pluginName}/agents/${agentFilename}`;
			agentEntries.push({
				name: ccAgent.name,
				path: relativePath,
				tier: ccAgent.model as ModelTier,
				...(ccAgent.effort && { effort: ccAgent.effort as EffortLevel }),
			});
		}

		// Track Codex agent metadata in build state for postPluginBuild hooks
		if (buildState.codexAgents !== undefined) {
			const { mapAgentToRoleType } = await import("./codex/role-mapper.js");
			const roleTypeValue = mapAgentToRoleType(
				ccAgent.name,
				ccAgent.description,
			);
			(
				buildState.codexAgents as Array<{
					name: string;
					description: string;
					roleType: string;
				}>
			).push({
				name: agentOutputName,
				description: ccAgent.description,
				roleType: roleTypeValue,
			});
		}

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

	if (!lintOnly && definition.hooks?.postPluginBuild) {
		const hookResult = await definition.hooks.postPluginBuild(
			pluginOutputDir,
			buildState,
			hookCtx,
		);
		errors.push(...hookResult.errors);
		if (definition.producesBundleAssets && hookResult.commandFiles) {
			for (const file of hookResult.commandFiles) {
				commandEntries.push({
					name: file.name,
					path: `${pluginName}/${file.path}`,
				});
			}
		}
		if (definition.producesBundleAssets && hookResult.verbatimFiles) {
			for (const file of hookResult.verbatimFiles) {
				verbatimFileEntries.push({
					name: file.name,
					path: `${pluginName}/${file.path}`,
				});
			}
		}
	}

	if (!lintOnly && definition.copyDirs) {
		for (const dir of definition.copyDirs) {
			const srcDir = join(pluginDir, dir);
			try {
				const dirStat = await stat(srcDir);
				if (dirStat.isDirectory()) {
					const destDir = join(pluginOutputDir, dir);
					await copyDirectory(srcDir, destDir);
					if (dir === ".claude-plugin") {
						await maybeRewriteClaudePluginManifest(
							destDir,
							platform,
							pluginVersion,
						);
					}
					if (definition.producesBundleAssets) {
						const copiedFiles = await collectAllFiles(destDir, dir);
						for (const file of copiedFiles) {
							verbatimFileEntries.push({
								name: file,
								path: `${pluginName}/${file}`,
							});
						}
					}
				}
			} catch {}
		}
	}

	let hasOpenCodePlugin = false;
	let openCodePluginAsset: OpenCodePluginAsset | undefined;

	if (!lintOnly && platform === "opencode") {
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
	}

	if (!lintOnly) {
		const manifestSkillNames = skillNames;
		const manifestAgentNames = agentNames;
		const manifestCommandNames = commandEntries.map((e) => e.name);

		const manifestCtx = buildTemplateContext(
			platform,
			`rp1-${pluginName}`,
			pluginVersion,
			{
				type: "manifest",
				skills: manifestSkillNames,
				agents: manifestAgentNames,
				commands: manifestCommandNames,
				...(hasOpenCodePlugin && { hasOpenCodePlugin: true }),
			},
			registry,
			cliVersion,
			platformConfig,
		);

		const manifestResult = await engine.render(
			definition.templates.manifest,
			manifestCtx,
		);
		if (E.isRight(manifestResult)) {
			await writeFile(
				join(pluginOutputDir, "manifest.json"),
				manifestResult.right,
			);
		}
	}

	if (!jsonOutput && !suppressOutput) {
		const hasErrors = errors.length > 0;
		const platformLabel = platform === "opencode" ? "" : ` ${platform}`;
		const ocPluginNote = hasOpenCodePlugin ? " + OpenCode plugin" : "";
		const mode = lintOnly ? " lint" : "";
		const summary =
			`${pluginName}${platformLabel ? ` (${platform}${mode})` : ""}:` +
			` ${agentNames.length} agents, ${skillNames.length} skills${ocPluginNote}`;
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
			agents: agentNames.length,
			skills: skillNames.length,
			errors,
		},
		assets: {
			name: `rp1-${pluginName}`,
			commands: commandEntries,
			agents: agentEntries,
			skills: skillFileEntries,
			stateMachines: stateMachineEntries,
			verbatimFiles: verbatimFileEntries,
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
 * Derive Copilot output directory from the OpenCode output directory.
 * Maps "dist/opencode" to "dist/copilot".
 */
export const deriveCopilotOutputDir = (opencodeOutputDir: string): string => {
	const normalized = opencodeOutputDir.replace(/\/+$/, "");
	const parent = dirname(normalized);
	return join(parent, "copilot");
};

/**
 * Derive Antigravity output directory from the OpenCode output directory.
 * Maps "dist/opencode" to "dist/antigravity".
 */
export const deriveAntigravityOutputDir = (
	opencodeOutputDir: string,
): string => {
	const normalized = opencodeOutputDir.replace(/\/+$/, "");
	const parent = dirname(normalized);
	return join(parent, "antigravity");
};

/**
 * Print build summary table.
 */
const printSummary = (
	summaries: BuildSummary[],
	outputPaths: readonly string[],
): void => {
	const { bold, green, cyan, yellow, boldGreen } = colorFns;
	console.log(`\n${boldGreen("✓ Build complete!")}\n`);

	const pluginCol = 12;
	const numCol = 10;

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

	const uniqueOutputPaths = [
		...new Set(outputPaths.map((path) => resolve(path))),
	];
	if (uniqueOutputPaths.length === 1) {
		console.log(`\nOutput directory: ${cyan(uniqueOutputPaths[0])}`);
	} else {
		console.log("\nOutput directories:");
		for (const outputPath of uniqueOutputPaths) {
			console.log(`  ${cyan(outputPath)}`);
		}
	}

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
 * Build artifacts for a given platform and plugin set.
 * Uses the unified buildPlatformPlugin with PlatformDefinition lookup.
 */
const buildPlatformArtifacts = async (
	platform: BuildPlatform,
	pluginsToBuild: string[],
	projectRoot: string,
	outputPath: string,
	config: BuildConfig,
	logger: Logger,
	cache?: ParseCache,
	diagnostics?: string[],
): Promise<{
	summaries: BuildSummary[];
	pluginAssets: Map<string, BundlePluginAssets>;
}> => {
	const definition = PLATFORM_DEFINITIONS.get(platform);
	if (!definition) throw new Error(`Unknown platform: ${platform}`);

	const summaries: BuildSummary[] = [];
	const pluginAssets: Map<string, BundlePluginAssets> = new Map();

	for (const pluginName of pluginsToBuild) {
		const result = await buildPlatformPlugin(
			pluginName,
			projectRoot,
			outputPath,
			definition,
			logger,
			config.jsonOutput,
			config.lintOnly,
			cache,
			diagnostics,
		);
		summaries.push(result.summary);
		pluginAssets.set(pluginName, result.assets);
	}

	if (
		definition.producesBundleAssets &&
		!config.lintOnly &&
		config.plugin === "all"
	) {
		const baseAssets = pluginAssets.get("base");
		const devAssets = pluginAssets.get("dev");
		const utilsAssets = pluginAssets.get("utils");

		if (baseAssets && devAssets) {
			const cliVersion = await readCliVersion(projectRoot);
			const engine = createTemplateEngine();

			const bundleCtx = {
				platform: platform,
				pluginName: "bundle",
				version: cliVersion,
				buildTimestamp: new Date().toISOString(),
				artifact: {
					type: "bundle-manifest",
					platformJson: JSON.stringify(
						{
							id: platform,
							name: definition.config.name,
							binary: definition.config.binary,
							instructionFile: definition.config.instruction_file,
							...(definition.config.supportLevel && {
								supportLevel: definition.config.supportLevel,
							}),
							...(definition.config.icon && {
								icon: definition.config.icon,
							}),
						},
						null,
						2,
					),
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

					const outputPath = resolve(projectRoot, config.outputDir);
					const ccOutputPath = deriveCCOutputDir(outputPath);
					const codexOutputPath = deriveCodexOutputDir(outputPath);
					const copilotOutputPath = deriveCopilotOutputDir(outputPath);
					const antigravityOutputPath = deriveAntigravityOutputDir(outputPath);
					const platformOutputPaths: Record<BuildPlatform, string> = {
						opencode: outputPath,
						"claude-code": ccOutputPath,
						codex: codexOutputPath,
						copilot: copilotOutputPath,
						antigravity: antigravityOutputPath,
					};

					const platformsToBuild: Array<{
						platform: BuildPlatform;
						outputPath: string;
					}> =
						config.platform === "all"
							? [
									{ platform: "opencode", outputPath },
									{ platform: "claude-code", outputPath: ccOutputPath },
									{ platform: "codex", outputPath: codexOutputPath },
									{ platform: "copilot", outputPath: copilotOutputPath },
									{
										platform: "antigravity",
										outputPath: antigravityOutputPath,
									},
								]
							: (() => {
									const platform = config.platform as BuildPlatform;
									return [
										{
											platform,
											outputPath: platformOutputPaths[platform],
										},
									];
								})();

					if (!config.jsonOutput) {
						for (const { platform, outputPath: op } of platformsToBuild) {
							logger.debug(`${platform} output directory: ${op}`);
						}
					}

					// Shared parse cache: each source file is read and parsed
					// once, then reused across catalog generation and all
					// platform passes.
					const cache = new ParseCache();

					// Generate CATALOG.md from skill frontmatter before platform builds
					// so it is picked up as a supporting file of the guide skill.
					if (!config.lintOnly) {
						const catalogResult = await generateCatalog(
							projectRoot,
							undefined,
							cache,
						);
						if (catalogResult.errors.length > 0 && !config.jsonOutput) {
							for (const err of catalogResult.errors) {
								logger.warn(`Catalog: ${err}`);
							}
						}
						if (!config.jsonOutput) {
							logger.debug(
								`Generated CATALOG.md with ${catalogResult.entries.length} skills`,
							);
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

					// Filter to enabled platforms before building
					const enabledPlatforms = platformsToBuild.filter(({ platform }) => {
						const def = PLATFORM_DEFINITIONS.get(platform);
						if (!def) {
							logger.warn(`Unknown platform "${platform}" — skipping`);
							return false;
						}
						if (def.config.enabled === false) {
							if (config.platform !== "all") {
								logger.warn(
									`${platform} platform is disabled — skipping artifact generation`,
								);
							}
							return false;
						}
						return true;
					});

					// Build platforms in parallel when multiple are requested.
					// Each platform writes to its own output directory so there
					// are no file-level conflicts. Console output is buffered
					// per-platform and flushed sequentially to prevent
					// interleaved log lines.
					const isParallel = enabledPlatforms.length > 1;
					const allSummaries: BuildSummary[] = [];

					const platformResults = await Promise.all(
						enabledPlatforms.map(
							async ({ platform, outputPath: platformOutput }) => {
								const diagnostics: string[] | undefined =
									isParallel && !config.jsonOutput ? [] : undefined;
								const { summaries } = await buildPlatformArtifacts(
									platform,
									pluginsToBuild,
									projectRoot,
									platformOutput,
									config,
									logger,
									cache,
									diagnostics,
								);
								return { summaries, diagnostics };
							},
						),
					);

					// Flush buffered diagnostics sequentially to preserve
					// per-platform output ordering.
					for (const { summaries, diagnostics } of platformResults) {
						if (diagnostics) {
							for (const msg of diagnostics) {
								console.warn(msg);
							}
						}
						allSummaries.push(...summaries);
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
						printSummary(
							allSummaries,
							platformsToBuild.map(({ outputPath }) => outputPath),
						);
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
