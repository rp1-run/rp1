/**
 * Platform definition configuration for the data-driven build pipeline.
 *
 * Each PlatformDefinition captures all platform-varying behavior: registry,
 * templates, naming conventions, lifecycle hooks, and asset embedding flags.
 * Adding a new platform requires creating a new entry here plus a registry
 * and template directory -- no changes to the generic build loop.
 */

import type { SupportedTool } from "../config/supported-tools.js";
import type {
	ClaudeCodeAgent,
	ClaudeCodeSkill,
	PlatformRegistry,
} from "./models.js";
import type { BuildPlatform } from "./template-context.js";
import type { TemplateEngine } from "./template-engine.js";

// ---------------------------------------------------------------------------
// Platform naming conventions
// ---------------------------------------------------------------------------

/**
 * Platform-varying naming conventions for build output.
 */
export interface PlatformNaming {
	/** Prefix for skill directory names. "" for claude-code, "rp1-" for others. */
	readonly skillDirPrefix: string;
	/** Pattern for agent output filenames. Receives pluginName and agentName. */
	readonly agentFileName: (pluginName: string, agentName: string) => string;
	/** File extension for agent artifacts. ".md" or ".toml". */
	readonly agentExtension: string;
}

// ---------------------------------------------------------------------------
// Platform templates
// ---------------------------------------------------------------------------

/**
 * Template paths for each artifact type, relative to templates/ root.
 */
export interface PlatformTemplates {
	readonly skill: string;
	readonly agent: string;
	readonly manifest: string;
}

// ---------------------------------------------------------------------------
// Hook types
// ---------------------------------------------------------------------------

/**
 * Opaque state bag populated by preparePlugin() and threaded
 * through subsequent hooks. Each platform defines its own shape.
 */
export type PlatformBuildState = Record<string, unknown>;

/**
 * Result from postPluginBuild hook, allowing hooks to report errors.
 */
export interface PostBuildResult {
	readonly errors: string[];
	readonly warnings: string[];
	/** Additional generated command files to include in manifests and asset bundles. */
	readonly commandFiles?: readonly { name: string; path: string }[];
	/** Additional files to include in the bundle manifest as verbatim entries. */
	readonly verbatimFiles?: readonly { name: string; path: string }[];
}

/**
 * Context passed to lifecycle hooks, providing access to build
 * infrastructure (engine, registry, versions) so hooks can render
 * templates and build contexts without duplicating setup logic.
 */
export interface HookContext {
	readonly projectRoot: string;
	readonly pluginName: string;
	readonly pluginDir: string;
	readonly outputDir: string;
	readonly engine: TemplateEngine;
	readonly registry: PlatformRegistry;
	readonly platformConfig: SupportedTool;
	readonly pluginVersion: string;
	readonly cliVersion: string;
	readonly platform: BuildPlatform;
	readonly jsonOutput: boolean;
}

/**
 * Optional lifecycle hooks for platform-specific build behavior.
 * Each hook receives the accumulated build state and can inject
 * platform-specific steps into the generic build loop.
 */
export interface PlatformHooks {
	/**
	 * Called once per plugin before building any artifacts.
	 * Use to initialize platform-specific state (e.g., discover skill maps).
	 */
	readonly preparePlugin?: (ctx: HookContext) => Promise<PlatformBuildState>;

	/**
	 * Called to enrich the template context for each agent before rendering.
	 * Use to add platform-specific context fields (e.g., roleType for Codex).
	 */
	readonly enrichAgentContext?: (
		ctx: Record<string, unknown>,
		agent: ClaudeCodeAgent,
		state: PlatformBuildState,
	) => Record<string, unknown>;

	/**
	 * Called to enrich the template context for each skill before rendering.
	 * Use to add platform-specific context fields (e.g., skillMap for Codex).
	 */
	readonly enrichSkillContext?: (
		ctx: Record<string, unknown>,
		state: PlatformBuildState,
	) => Record<string, unknown>;

	/**
	 * Called after each skill is written to disk.
	 * Use for per-skill extras (e.g., Codex openai.yaml generation).
	 */
	readonly postSkillWrite?: (
		skillDir: string,
		skill: ClaudeCodeSkill,
		state: PlatformBuildState,
		hookCtx: HookContext,
	) => Promise<void>;

	/**
	 * Called after all agents are built for a plugin.
	 * Use for aggregate operations (e.g., Codex sub-agent validation,
	 * rp1-agents.toml generation, AGENTS.md generation, CC .claude-plugin copy).
	 */
	readonly postPluginBuild?: (
		outputDir: string,
		state: PlatformBuildState,
		hookCtx: HookContext,
	) => Promise<PostBuildResult>;
}

// ---------------------------------------------------------------------------
// PlatformDefinition
// ---------------------------------------------------------------------------

/**
 * Complete platform configuration. Adding a new platform requires
 * creating one of these entries plus a registry and templates.
 */
export interface PlatformDefinition {
	readonly id: BuildPlatform;
	readonly registry: PlatformRegistry;
	readonly config: SupportedTool;
	readonly templates: PlatformTemplates;
	readonly naming: PlatformNaming;
	readonly hooks?: PlatformHooks;
	/** Directories to copy verbatim from plugin source to output (e.g., [".claude-plugin", "hooks"]). */
	readonly copyDirs?: readonly string[];
	/** Whether this platform generates bundle-manifest data for asset embedding. */
	readonly producesBundleAssets: boolean;
}

// ---------------------------------------------------------------------------
// Platform configs (stub defaults for build scripts)
// ---------------------------------------------------------------------------

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
	copilot: {
		id: "copilot",
		name: "GitHub Copilot CLI",
		enabled: true,
		binary: "copilot",
		min_version: "0.0.0",
		version_command: ["version"],
		detect_command: ["plugin", "--help"],
		instruction_file: "AGENTS.md",
		install_url:
			"https://docs.github.com/en/copilot/how-tos/copilot-cli/set-up-copilot-cli/install-copilot-cli",
		plugin_install_cmd: "copilot plugin install {plugin}",
		capabilities: ["plugins", "skills", "agents", "slash-commands"],
	},
	antigravity: {
		id: "antigravity",
		name: "Antigravity CLI",
		enabled: true,
		binary: "agy",
		min_version: "0.0.0",
		instruction_file: "AGENTS.md",
		install_url: "https://www.antigravity.google/product/antigravity-cli",
		plugin_install_cmd: "agy plugin install {plugin}",
		supportLevel: "stable",
		icon: {
			source: "@lobehub/icons",
			name: "Antigravity",
			variant: "mono",
		},
		capabilities: [
			"plugins",
			"skills",
			"agents",
			"slash-commands",
			"hooks",
			"mcp",
			"rules",
		],
	},
	gemini: {
		id: "gemini",
		name: "Gemini CLI",
		enabled: false,
		binary: "gemini",
		min_version: "0.0.0",
		instruction_file: "AGENTS.md",
		install_url: "https://github.com/google-gemini/gemini-cli",
		plugin_install_cmd: null,
		supportLevel: "stable",
		icon: {
			source: "@lobehub/icons",
			name: "Gemini",
			variant: "mono",
		},
		capabilities: ["plugins", "skills", "agents", "slash-commands"],
	},
};

// ---------------------------------------------------------------------------
// Imports for registries and platform-specific modules
// ---------------------------------------------------------------------------

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { toUserFacing } from "../../shared/canonical-name.js";
import {
	antigravityEnrichSkillContext,
	antigravityPostPluginBuild,
	antigravityPostSkillWrite,
	antigravityPreparePlugin,
} from "./antigravity/hooks.js";
import { antigravityRegistry } from "./antigravity/registry.js";
import { claudeCodeRegistry } from "./claude-code/registry.js";
import { codexRegistry } from "./codex/registry.js";
import { mapAgentToRoleType } from "./codex/role-mapper.js";
import { discoverSkillMap } from "./codex/skill-map.js";
import { validateSubAgents } from "./codex/sub-agent-validator.js";
import { validateCodexToml } from "./codex/validator.js";
import { copilotRegistry } from "./copilot/registry.js";
import {
	geminiPostPluginBuild,
	geminiPostSkillWrite,
	geminiPreparePlugin,
} from "./gemini/hooks.js";
import { geminiRegistry } from "./gemini/registry.js";
import { defaultRegistry } from "./registry.js";
import { transformNamespace } from "./tags/index.js";
import { buildTemplateContext } from "./template-context.js";

// ---------------------------------------------------------------------------
// Codex hook implementations
// ---------------------------------------------------------------------------

const codexPreparePlugin = async (
	ctx: HookContext,
): Promise<PlatformBuildState> => {
	const skillMap = discoverSkillMap(ctx.projectRoot);
	return {
		skillMap,
		parsedSkills: [] as ClaudeCodeSkill[],
		codexAgents: [] as Array<{
			name: string;
			description: string;
			roleType: string;
		}>,
	};
};

const codexEnrichSkillContext = (
	ctx: Record<string, unknown>,
	state: PlatformBuildState,
): Record<string, unknown> => ({
	...ctx,
	skillMap: state.skillMap,
});

const codexEnrichAgentContext = (
	ctx: Record<string, unknown>,
	agent: ClaudeCodeAgent,
	state: PlatformBuildState,
): Record<string, unknown> => {
	const roleTypeValue = mapAgentToRoleType(agent.name, agent.description);
	return {
		...ctx,
		skillMap: state.skillMap,
		artifact: {
			...(ctx.artifact as Record<string, unknown>),
			roleType: roleTypeValue,
		},
	};
};

const codexPostSkillWrite = async (
	skillDir: string,
	skill: ClaudeCodeSkill,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<void> => {
	(state.parsedSkills as ClaudeCodeSkill[]).push(skill);

	const agentsSubDir = join(skillDir, "agents");
	await mkdir(agentsSubDir, { recursive: true });

	const namespacedSkillDir = `rp1-${skill.name}`;
	const openaiYamlCtx = buildTemplateContext(
		hookCtx.platform,
		hookCtx.pluginName,
		hookCtx.pluginVersion,
		{
			type: "skill" as const,
			name: skill.name,
			namespacedName: namespacedSkillDir,
			description: skill.description,
			content: skill.content,
			supportingFiles: skill.supportingFiles,
		},
		hookCtx.registry,
		hookCtx.cliVersion,
		hookCtx.platformConfig,
	);

	const yamlResult = await hookCtx.engine.render(
		"codex/openai-yaml",
		openaiYamlCtx,
	);
	if (E.isRight(yamlResult)) {
		await writeFile(join(agentsSubDir, "openai.yaml"), yamlResult.right);
	}
};

const codexPostPluginBuild = async (
	outputDir: string,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const errors: string[] = [];
	const warnings: string[] = [];

	const parsedSkills = state.parsedSkills as ClaudeCodeSkill[];
	const subAgentValidation = validateSubAgents(
		hookCtx.projectRoot,
		parsedSkills,
	);
	errors.push(...subAgentValidation.errors);
	if (!hookCtx.jsonOutput) {
		for (const warning of subAgentValidation.warnings) {
			console.warn(`[sub-agent] ${warning}`);
		}
		for (const info of subAgentValidation.info) {
			console.info(`[sub-agent] ${info}`);
		}
	}

	const codexAgents = state.codexAgents as Array<{
		name: string;
		description: string;
		roleType: string;
	}>;

	if (codexAgents.length > 0) {
		const agentConfigCtx = {
			platform: hookCtx.platform,
			pluginName: hookCtx.pluginName,
			artifact: { agents: codexAgents },
			registry: hookCtx.registry,
		};
		const configResult = await hookCtx.engine.render(
			"codex/agent-config",
			agentConfigCtx,
		);
		if (E.isRight(configResult)) {
			const tomlValidation = validateCodexToml(
				configResult.right,
				`${hookCtx.pluginName}/rp1-agents.toml`,
			);
			if (E.isLeft(tomlValidation)) {
				const { formatError } = await import("../../shared/errors.js");
				errors.push(formatError(tomlValidation.left, false));
			} else {
				await writeFile(join(outputDir, "rp1-agents.toml"), configResult.right);
			}
		} else {
			const { formatError } = await import("../../shared/errors.js");
			errors.push(formatError(configResult.left, false));
		}

		const agentsMdCtx = {
			platform: hookCtx.platform,
			pluginName: hookCtx.pluginName,
			artifact: { agents: codexAgents },
			registry: hookCtx.registry,
		};
		const agentsMdResult = await hookCtx.engine.render(
			"codex/agents-md",
			agentsMdCtx,
		);
		if (E.isRight(agentsMdResult)) {
			await writeFile(join(outputDir, "AGENTS.md"), agentsMdResult.right);
		}
	}

	// Copy codex-hooks.json if present in the plugin source
	const verbatimFiles: { name: string; path: string }[] = [];
	try {
		const hooksSource = join(
			hookCtx.projectRoot,
			"plugins",
			hookCtx.pluginName,
			"hooks",
			"codex-hooks.json",
		);
		const hooksContent = await readFile(hooksSource, "utf-8");
		// Validate JSON before copying
		JSON.parse(hooksContent);
		await writeFile(join(outputDir, "codex-hooks.json"), hooksContent);
		verbatimFiles.push({
			name: "codex-hooks.json",
			path: "codex-hooks.json",
		});
	} catch {
		// No codex-hooks.json for this plugin — that's fine
	}

	return { errors, warnings, verbatimFiles };
};

// ---------------------------------------------------------------------------
// OpenCode hook implementations
// ---------------------------------------------------------------------------

const opencodePreparePlugin = async (
	_ctx: HookContext,
): Promise<PlatformBuildState> => ({});

// ---------------------------------------------------------------------------
// Copilot hook implementations
// ---------------------------------------------------------------------------

const copilotPreparePlugin = async (
	_ctx: HookContext,
): Promise<PlatformBuildState> => ({});

interface CopilotPluginMetadata {
	readonly description: string;
}

const getDefaultCopilotDescription = (pluginName: string): string =>
	pluginName === "base"
		? "Core knowledge management and workflow support for GitHub Copilot"
		: pluginName === "dev"
			? "Development workflow automation for GitHub Copilot"
			: "Prompt-authoring and utility workflows for GitHub Copilot";

const readCopilotPluginMetadata = async (
	hookCtx: HookContext,
): Promise<CopilotPluginMetadata> => {
	const sourcePluginPath = join(
		hookCtx.projectRoot,
		"plugins",
		hookCtx.pluginName,
		".claude-plugin",
		"plugin.json",
	);

	try {
		const content = await readFile(sourcePluginPath, "utf-8");
		const parsed = JSON.parse(content) as { description?: unknown };
		if (
			typeof parsed.description === "string" &&
			parsed.description.length > 0
		) {
			return { description: parsed.description };
		}
	} catch {
		// Fall back to a generated description if source metadata is unavailable.
	}

	return {
		description: getDefaultCopilotDescription(hookCtx.pluginName),
	};
};

const listCopilotSkillNames = async (outputDir: string): Promise<string[]> => {
	try {
		const entries = await readdir(join(outputDir, "skills"), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name)
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
};

const listCopilotAgentNames = async (outputDir: string): Promise<string[]> => {
	try {
		const entries = await readdir(join(outputDir, "agents"), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".agent.md"))
			.map((entry) => entry.name.replace(/\.agent\.md$/, ""))
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
};

const buildCopilotTemplateBaseContext = (
	hookCtx: HookContext,
): Record<string, unknown> => ({
	platform: hookCtx.platform,
	platformConfig: hookCtx.platformConfig,
	pluginName: hookCtx.pluginName,
	pluginVersion: hookCtx.pluginVersion,
	namespacedPluginName: `rp1-${hookCtx.pluginName}`,
	registry: hookCtx.registry,
	buildTimestamp: new Date().toISOString(),
	version: hookCtx.cliVersion,
});

const copilotPostPluginBuild = async (
	outputDir: string,
	_state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const errors: string[] = [];
	const warnings: string[] = [];
	const verbatimFiles: { name: string; path: string }[] = [];

	const { description } = await readCopilotPluginMetadata(hookCtx);
	const [skillNames, agentNames] = await Promise.all([
		listCopilotSkillNames(outputDir),
		listCopilotAgentNames(outputDir),
	]);

	let hooksPath: string | undefined;
	const hooksSource = join(
		hookCtx.projectRoot,
		"plugins",
		hookCtx.pluginName,
		"hooks",
		"copilot-hooks.json",
	);

	try {
		const hooksContent = await readFile(hooksSource, "utf-8");
		try {
			JSON.parse(hooksContent);
			const hooksOutputDir = join(outputDir, "hooks");
			hooksPath = "hooks/copilot-hooks.json";
			await mkdir(hooksOutputDir, { recursive: true });
			await writeFile(join(hooksOutputDir, "copilot-hooks.json"), hooksContent);
			verbatimFiles.push({
				name: "copilot-hooks.json",
				path: hooksPath,
			});
		} catch (error) {
			errors.push(
				`Invalid Copilot hooks file at ${hooksSource}: ${String(error)}`,
			);
		}
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "ENOENT") {
			errors.push(
				`Failed to read Copilot hooks file at ${hooksSource}: ${String(error)}`,
			);
		}
	}

	const renderTemplate = async (
		template: string,
		filePath: string,
		artifact: Record<string, unknown>,
		validateJson = false,
	): Promise<void> => {
		const renderResult = await hookCtx.engine.render(template, {
			...buildCopilotTemplateBaseContext(hookCtx),
			artifact,
		});

		if (E.isLeft(renderResult)) {
			const { formatError } = await import("../../shared/errors.js");
			errors.push(formatError(renderResult.left, false));
			return;
		}

		if (validateJson) {
			try {
				JSON.parse(renderResult.right);
			} catch (error) {
				errors.push(`Invalid Copilot JSON emitted for ${filePath}: ${error}`);
				return;
			}
		}

		await writeFile(join(outputDir, filePath), renderResult.right);
		verbatimFiles.push({
			name: filePath.split("/").at(-1) ?? filePath,
			path: filePath,
		});
	};

	await renderTemplate(
		"copilot/plugin",
		"plugin.json",
		{
			description,
			skills: skillNames,
			agents: agentNames,
			hooksPath,
		},
		true,
	);

	await renderTemplate("copilot/readme", "README.md", {
		description,
		skills: skillNames,
		agents: agentNames,
	});

	return { errors, warnings, verbatimFiles };
};

// ---------------------------------------------------------------------------
// Platform definitions
// ---------------------------------------------------------------------------

const opencodePlatform: PlatformDefinition = {
	id: "opencode",
	registry: defaultRegistry,
	config: platformConfigs.opencode,
	templates: {
		skill: "opencode/skill",
		agent: "opencode/agent",
		manifest: "opencode/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			`rp1-${pluginName}-${agentName}`,
		agentExtension: ".md",
	},
	hooks: {
		preparePlugin: opencodePreparePlugin,
	},
	producesBundleAssets: true,
};

const claudeCodePlatform: PlatformDefinition = {
	id: "claude-code",
	registry: claudeCodeRegistry,
	config: platformConfigs["claude-code"],
	templates: {
		skill: "claude-code/skill",
		agent: "claude-code/agent",
		manifest: "claude-code/manifest",
	},
	naming: {
		skillDirPrefix: "",
		agentFileName: (_pluginName: string, agentName: string) => agentName,
		agentExtension: ".md",
	},
	copyDirs: [".claude-plugin", "hooks"],
	producesBundleAssets: true,
};

const codexPlatform: PlatformDefinition = {
	id: "codex",
	registry: codexRegistry,
	config: platformConfigs.codex,
	templates: {
		skill: "codex/skill",
		agent: "codex/agent-toml",
		manifest: "codex/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			transformNamespace(
				toUserFacing({ plugin: pluginName, artifact: agentName }),
				"codex",
			),
		agentExtension: ".toml",
	},
	hooks: {
		preparePlugin: codexPreparePlugin,
		enrichSkillContext: codexEnrichSkillContext,
		enrichAgentContext: codexEnrichAgentContext,
		postSkillWrite: codexPostSkillWrite,
		postPluginBuild: codexPostPluginBuild,
	},
	producesBundleAssets: true,
};

const copilotPlatform: PlatformDefinition = {
	id: "copilot",
	registry: copilotRegistry,
	config: platformConfigs.copilot,
	templates: {
		skill: "copilot/skill",
		agent: "copilot/agent",
		manifest: "copilot/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			`rp1-${pluginName}-${agentName}`,
		agentExtension: ".agent.md",
	},
	hooks: {
		preparePlugin: copilotPreparePlugin,
		postPluginBuild: copilotPostPluginBuild,
	},
	producesBundleAssets: true,
};

const antigravityPlatform: PlatformDefinition = {
	id: "antigravity",
	registry: antigravityRegistry,
	config: platformConfigs.antigravity,
	templates: {
		skill: "antigravity/skill",
		agent: "antigravity/agent",
		manifest: "antigravity/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			`rp1-${pluginName}-${agentName}`,
		agentExtension: ".md",
	},
	hooks: {
		preparePlugin: antigravityPreparePlugin,
		enrichSkillContext: antigravityEnrichSkillContext,
		postSkillWrite: antigravityPostSkillWrite,
		postPluginBuild: antigravityPostPluginBuild,
	},
	producesBundleAssets: true,
};

const geminiPlatform: PlatformDefinition = {
	id: "gemini",
	registry: geminiRegistry,
	config: platformConfigs.gemini,
	templates: {
		skill: "gemini/skill",
		agent: "gemini/agent",
		manifest: "gemini/manifest",
	},
	naming: {
		skillDirPrefix: "rp1-",
		agentFileName: (pluginName: string, agentName: string) =>
			`rp1-${pluginName}-${agentName}`,
		agentExtension: ".md",
	},
	hooks: {
		preparePlugin: geminiPreparePlugin,
		postSkillWrite: geminiPostSkillWrite,
		postPluginBuild: geminiPostPluginBuild,
	},
	producesBundleAssets: true,
};

// ---------------------------------------------------------------------------
// Platform definitions map
// ---------------------------------------------------------------------------

export const PLATFORM_DEFINITIONS: ReadonlyMap<
	BuildPlatform,
	PlatformDefinition
> = new Map<BuildPlatform, PlatformDefinition>([
	["opencode", opencodePlatform],
	["claude-code", claudeCodePlatform],
	["codex", codexPlatform],
	["copilot", copilotPlatform],
	["antigravity", antigravityPlatform],
	["gemini", geminiPlatform],
]);

/**
 * Get the SupportedTool config for a given build platform.
 */
export const getPlatformConfig = (platform: BuildPlatform): SupportedTool =>
	platformConfigs[platform];
