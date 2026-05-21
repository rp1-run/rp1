import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import { collectAntigravityWorkflowSupportMatrix } from "../../catalog/index.js";
import { allowedToolsFilter } from "../filters/index.js";
import type { ClaudeCodeAgent, ClaudeCodeSkill } from "../models.js";
import { parseAgent } from "../parser.js";
import type {
	HookContext,
	PlatformBuildState,
	PostBuildResult,
} from "../platform-definitions.js";
import { validateAntigravityCommandToml } from "./validator.js";

interface AntigravityGeneratedCommand {
	readonly name: string;
	readonly path: string;
}

interface AntigravityDefinitionSummary {
	readonly rp1AgentId: string;
	readonly definitionHash: string;
	readonly typeName: string;
	readonly path: string;
	readonly description: string;
	readonly workspace: {
		readonly defaultPolicy: string;
		readonly isolatedWorktree: string;
	};
	readonly tools: {
		readonly enable_mcp_tools: boolean;
		readonly enable_write_tools: boolean;
		readonly enable_subagent_tools: boolean;
	};
	readonly nestedDelegation: {
		readonly sourceUsesSubagents: boolean;
		readonly enabled: boolean;
		readonly validation: string;
	};
}

interface AntigravityRequiredDefinition {
	readonly sourceReference: string;
	readonly rp1AgentId: string;
	readonly packageName: string;
	readonly path: string;
}

interface AntigravityRequiredDefinitionIndex {
	readonly packageName: string;
	readonly path: string;
}

interface AntigravityBuildState extends PlatformBuildState {
	commandFiles: AntigravityGeneratedCommand[];
	skillNames: string[];
	agentNames: string[];
	delegationDefinitions: AntigravityDefinitionSummary[];
}

const asAntigravityBuildState = (
	state: PlatformBuildState,
): AntigravityBuildState => state as AntigravityBuildState;

const namespacedPluginName = (pluginName: string): string =>
	`rp1-${pluginName}`;

const antigravityCommandName = (
	pluginName: string,
	skillName: string,
): string => `${namespacedPluginName(pluginName)}:${skillName}`;

const antigravitySkillName = (skillName: string): string => `rp1-${skillName}`;

const antigravityCommandPath = (
	pluginName: string,
	skillName: string,
): string => `commands/${namespacedPluginName(pluginName)}/${skillName}.toml`;

const antigravityAgentTypeName = (
	pluginName: string,
	agentName: string,
): string => `${namespacedPluginName(pluginName)}-${agentName}`;

const splitAgentReference = (
	currentPluginName: string,
	reference: string,
): { readonly pluginName: string; readonly agentName: string } => {
	const separator = reference.indexOf(":");
	if (separator < 0) {
		return { pluginName: currentPluginName, agentName: reference };
	}

	const rawPluginName = reference.slice(0, separator);
	const agentName = reference.slice(separator + 1);
	const pluginName = rawPluginName.startsWith("rp1-")
		? rawPluginName.slice(4)
		: rawPluginName;

	return { pluginName, agentName };
};

const antigravityDefinitionPath = (
	pluginName: string,
	agentName: string,
): string =>
	`delegation-definitions/${antigravityAgentTypeName(pluginName, agentName)}.json`;

const buildRequiredDelegationDefinitions = (
	currentPluginName: string,
	references: readonly string[],
): {
	readonly definitions: readonly AntigravityRequiredDefinition[];
	readonly indexes: readonly AntigravityRequiredDefinitionIndex[];
} => {
	const definitions = references.map((sourceReference) => {
		const { pluginName, agentName } = splitAgentReference(
			currentPluginName,
			sourceReference,
		);
		return {
			sourceReference,
			rp1AgentId: `${pluginName}:${agentName}`,
			packageName: namespacedPluginName(pluginName),
			path: antigravityDefinitionPath(pluginName, agentName),
		};
	});

	const indexByPackage = new Map<string, AntigravityRequiredDefinitionIndex>();
	for (const definition of definitions) {
		indexByPackage.set(definition.packageName, {
			packageName: definition.packageName,
			path: "delegation-definitions/index.json",
		});
	}

	return {
		definitions,
		indexes: Array.from(indexByPackage.values()),
	};
};

const readPluginDescription = async (hookCtx: HookContext): Promise<string> => {
	const pluginJsonPath = join(
		hookCtx.projectRoot,
		"plugins",
		hookCtx.pluginName,
		".claude-plugin",
		"plugin.json",
	);

	try {
		const parsed = JSON.parse(await readFile(pluginJsonPath, "utf-8")) as {
			description?: unknown;
		};
		if (
			typeof parsed.description === "string" &&
			parsed.description.trim().length > 0
		) {
			return parsed.description;
		}
	} catch {}

	return `${namespacedPluginName(hookCtx.pluginName)} workflows for Antigravity CLI`;
};

const buildCommandPrompt = (
	pluginName: string,
	skillName: string,
	generatedSkillName: string,
	skillContent: string,
): string =>
	[
		`# ${antigravityCommandName(pluginName, skillName)}`,
		"",
		"Arguments: {{args}}",
		"",
		`Use the bundled Antigravity skill \`${generatedSkillName}\` for this request. If the skill is not activated automatically, follow the embedded skill instructions below.`,
		"",
		"## Skill Instructions",
		"",
		skillContent.trimEnd(),
		"",
	].join("\n");

const listGeneratedAgentNames = async (
	outputDir: string,
): Promise<string[]> => {
	try {
		const entries = await readdir(join(outputDir, "agents"), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => entry.name.replace(/\.md$/, ""))
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
};

const listSourceAgentFiles = async (
	hookCtx: HookContext,
): Promise<string[]> => {
	const agentsDir = join(hookCtx.pluginDir, "agents");
	try {
		const entries = await readdir(agentsDir, { withFileTypes: true });
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => join(agentsDir, entry.name))
			.sort((a, b) => a.localeCompare(b));
	} catch {
		return [];
	}
};

const stripYamlFrontmatter = (content: string): string => {
	if (!content.startsWith("---\n")) return content;
	const end = content.indexOf("\n---", 4);
	if (end < 0) return content;
	const after = content.indexOf("\n", end + 4);
	return after < 0 ? "" : content.slice(after + 1);
};

const hasWriteCapability = (agent: ClaudeCodeAgent): boolean =>
	agent.tools.some((tool) =>
		["Bash", "Write", "Edit", "NotebookEdit"].includes(tool),
	);

const hasMcpCapability = (agent: ClaudeCodeAgent): boolean =>
	agent.tools.some((tool) => tool.toLowerCase().includes("mcp"));

const hasSubagentCapability = (agent: ClaudeCodeAgent): boolean =>
	agent.tools.includes("Task");

const mappedAgentTools = (
	agent: ClaudeCodeAgent,
	hookCtx: HookContext,
): readonly string[] => {
	const mapped = allowedToolsFilter(
		agent.tools.join(", "),
		"antigravity",
		hookCtx.registry,
	);
	return Array.isArray(mapped) ? mapped : [];
};

const hashDelegationDefinition = (
	definition: Record<string, unknown>,
): string =>
	createHash("sha256")
		.update(JSON.stringify(definition))
		.digest("hex")
		.slice(0, 16);

const writeDelegationDefinitions = async (
	outputDir: string,
	hookCtx: HookContext,
): Promise<{
	readonly errors: readonly string[];
	readonly files: readonly { name: string; path: string }[];
	readonly definitions: readonly AntigravityDefinitionSummary[];
}> => {
	const errors: string[] = [];
	const files: { name: string; path: string }[] = [];
	const definitions: AntigravityDefinitionSummary[] = [];
	const definitionDir = join(outputDir, "delegation-definitions");
	await mkdir(definitionDir, { recursive: true });

	for (const agentFile of await listSourceAgentFiles(hookCtx)) {
		const parseResult = await parseAgent(agentFile)();
		if (E.isLeft(parseResult)) {
			errors.push(formatError(parseResult.left, false));
			continue;
		}

		const agent = parseResult.right;
		const typeName = antigravityAgentTypeName(hookCtx.pluginName, agent.name);
		const rp1AgentId = `${hookCtx.pluginName}:${agent.name}`;
		const relativeDefinitionPath = `delegation-definitions/${typeName}.json`;
		const generatedAgentPath = join(outputDir, "agents", `${typeName}.md`);
		const generatedAgentContent = await readFile(generatedAgentPath, "utf-8");
		const systemPrompt = stripYamlFrontmatter(generatedAgentContent).trim();
		const sourceUsesSubagents = hasSubagentCapability(agent);
		// Antigravity nested delegation remains disabled until runtime validation
		// proves a subagent may safely invoke another dynamic subagent.
		const nestedDelegationEnabled = false;
		const definitionWithoutHash = {
			schemaVersion: 1,
			rp1AgentId,
			typeName,
			sourcePath: relative(hookCtx.projectRoot, agentFile)
				.split("\\")
				.join("/"),
			description: agent.description,
			runtimeContract: "define_subagent_once_per_session_then_invoke_subagent",
			staticAgentsDiscovery: "not_used",
			workspace: {
				defaultPolicy: "inherited",
				isolatedWorktree: "requires_validation",
			},
			nestedDelegation: {
				sourceUsesSubagents,
				enabled: nestedDelegationEnabled,
				validation: nestedDelegationEnabled
					? "validated_for_antigravity"
					: "requires_workflow_validation",
			},
			tools: {
				source: agent.tools,
				antigravity: mappedAgentTools(agent, hookCtx),
			},
			defineSubagent: {
				name: typeName,
				description: agent.description,
				system_prompt: systemPrompt,
				enable_mcp_tools: hasMcpCapability(agent),
				enable_write_tools: hasWriteCapability(agent),
				enable_subagent_tools: nestedDelegationEnabled,
			},
		};
		const definitionHash = hashDelegationDefinition(definitionWithoutHash);
		const definition = {
			...definitionWithoutHash,
			definitionHash,
		};

		await writeFile(
			join(outputDir, relativeDefinitionPath),
			`${JSON.stringify(definition, null, 2)}\n`,
		);
		files.push({
			name: `${typeName}.json`,
			path: relativeDefinitionPath,
		});
		definitions.push({
			rp1AgentId,
			definitionHash,
			typeName,
			path: relativeDefinitionPath,
			description: agent.description,
			workspace: definition.workspace,
			tools: {
				enable_mcp_tools: definition.defineSubagent.enable_mcp_tools,
				enable_write_tools: definition.defineSubagent.enable_write_tools,
				enable_subagent_tools: definition.defineSubagent.enable_subagent_tools,
			},
			nestedDelegation: definition.nestedDelegation,
		});
	}

	const index = {
		schemaVersion: 1,
		plugin: namespacedPluginName(hookCtx.pluginName),
		runtimeContract: "define_subagent_once_per_session_then_invoke_subagent",
		staticAgentsDiscovery: "not_used",
		definitions,
	};
	const indexPath = "delegation-definitions/index.json";
	await writeFile(
		join(outputDir, indexPath),
		`${JSON.stringify(index, null, 2)}\n`,
	);
	files.push({
		name: "index.json",
		path: indexPath,
	});

	return { errors, files, definitions };
};

const activeGeminiPatterns = [
	/\bGemini CLI\b/,
	/\bGemini skill\b/,
	/\bGemini workflows\b/,
	/\bGEMINI\.md\b/,
	/\bgemini-extension\b/,
	/\bgeminiCli\b/,
];

const assertNoActiveGeminiWording = async (
	outputDir: string,
	files: readonly { path: string }[],
): Promise<readonly string[]> => {
	const errors: string[] = [];
	for (const file of files) {
		const content = await readFile(join(outputDir, file.path), "utf-8");
		const match = activeGeminiPatterns.find((pattern) => pattern.test(content));
		if (match) {
			errors.push(
				`Active Gemini wording is not allowed in Antigravity package asset ${file.path}: matched ${match.source}`,
			);
		}
	}
	return errors;
};

const collectPackageFiles = async (
	dir: string,
	prefix = "",
): Promise<readonly { path: string }[]> => {
	const files: { path: string }[] = [];
	try {
		const entries = await readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				files.push(
					...(await collectPackageFiles(join(dir, entry.name), relativePath)),
				);
			} else if (entry.isFile()) {
				files.push({ path: relativePath });
			}
		}
	} catch {}
	return files;
};

const escapeRegExp = (value: string): string =>
	value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const assertDelegationPromptPathsMatchIndex = async (
	outputDir: string,
	pluginName: string,
): Promise<readonly string[]> => {
	const errors: string[] = [];
	const indexPath = "delegation-definitions/index.json";
	let index: {
		readonly definitions?: readonly { readonly path?: unknown }[];
	};

	try {
		index = JSON.parse(await readFile(join(outputDir, indexPath), "utf-8"));
	} catch (error) {
		return [`Unable to read Antigravity delegation definition index: ${error}`];
	}

	const indexedPaths = new Set<string>([indexPath]);
	for (const definition of index.definitions ?? []) {
		if (typeof definition.path === "string") {
			indexedPaths.add(definition.path);
		}
	}

	const currentPackageName = namespacedPluginName(pluginName);
	const installPathPattern = new RegExp(
		`\\$HOME/\\.gemini/antigravity-cli/${escapeRegExp(
			currentPackageName,
		)}/(delegation-definitions/[A-Za-z0-9._-]+\\.json)`,
		"g",
	);

	const skillFiles = (
		await collectPackageFiles(join(outputDir, "skills"), "skills")
	).filter((file) => file.path.endsWith("/SKILL.md"));
	for (const file of skillFiles) {
		const content = await readFile(join(outputDir, file.path), "utf-8");
		for (const match of content.matchAll(installPathPattern)) {
			const definitionPath = match[1];
			if (!definitionPath) continue;
			if (!indexedPaths.has(definitionPath)) {
				errors.push(
					`${file.path} references ${definitionPath}, but that path is absent from ${indexPath}`,
				);
				continue;
			}
			try {
				await readFile(join(outputDir, definitionPath), "utf-8");
			} catch {
				errors.push(
					`${file.path} references ${definitionPath}, but the generated file does not exist`,
				);
			}
		}
	}

	return errors;
};

export const antigravityPreparePlugin = async (
	_ctx: HookContext,
): Promise<PlatformBuildState> => ({
	commandFiles: [],
	skillNames: [],
	agentNames: [],
	delegationDefinitions: [],
});

export const antigravityEnrichSkillContext = (
	ctx: Record<string, unknown>,
	_state: PlatformBuildState,
): Record<string, unknown> => {
	const artifact = ctx.artifact as {
		readonly metadata?: { readonly subAgents?: readonly string[] };
	};
	const pluginName = String(ctx.pluginName);
	const subAgents = Array.isArray(artifact.metadata?.subAgents)
		? artifact.metadata.subAgents
		: [];
	const requiredDelegation = buildRequiredDelegationDefinitions(
		pluginName,
		subAgents,
	);

	return {
		...ctx,
		artifact: {
			...artifact,
			requiredDelegationDefinitions: requiredDelegation.definitions,
			requiredDelegationDefinitionIndexes: requiredDelegation.indexes,
		},
	};
};

export const antigravityPostSkillWrite = async (
	skillDir: string,
	skill: ClaudeCodeSkill,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<void> => {
	const antigravityState = asAntigravityBuildState(state);
	const generatedSkillName = antigravitySkillName(skill.name);
	antigravityState.skillNames.push(generatedSkillName);

	const commandRelativePath = antigravityCommandPath(
		hookCtx.pluginName,
		skill.name,
	);
	const commandOutputPath = join(hookCtx.outputDir, commandRelativePath);
	const generatedSkillContent = await readFile(
		join(skillDir, "SKILL.md"),
		"utf-8",
	);

	const renderResult = await hookCtx.engine.render("antigravity/command", {
		platform: hookCtx.platform,
		pluginName: hookCtx.pluginName,
		namespacedPluginName: namespacedPluginName(hookCtx.pluginName),
		version: hookCtx.cliVersion,
		artifact: {
			type: "command",
			name: skill.name,
			description: skill.description,
			prompt: buildCommandPrompt(
				hookCtx.pluginName,
				skill.name,
				generatedSkillName,
				generatedSkillContent,
			),
		},
		registry: hookCtx.registry,
	});

	if (E.isLeft(renderResult)) {
		throw new Error(formatError(renderResult.left, false));
	}

	const validation = validateAntigravityCommandToml(
		renderResult.right,
		commandRelativePath,
	);
	if (E.isLeft(validation)) {
		throw new Error(formatError(validation.left, false));
	}

	await mkdir(dirname(commandOutputPath), { recursive: true });
	await writeFile(commandOutputPath, renderResult.right);
	antigravityState.commandFiles.push({
		name: antigravityCommandName(hookCtx.pluginName, skill.name),
		path: commandRelativePath,
	});
};

export const antigravityPostPluginBuild = async (
	outputDir: string,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const errors: string[] = [];
	const warnings: string[] = [];
	const verbatimFiles: { name: string; path: string }[] = [];
	const antigravityState = asAntigravityBuildState(state);
	const description = await readPluginDescription(hookCtx);
	antigravityState.agentNames.push(
		...(await listGeneratedAgentNames(outputDir)),
	);

	const renderTemplate = async (
		template: string,
		filePath: string,
		artifact: Record<string, unknown>,
		validateJson = false,
	): Promise<void> => {
		const renderResult = await hookCtx.engine.render(template, {
			platform: hookCtx.platform,
			platformConfig: hookCtx.platformConfig,
			pluginName: hookCtx.pluginName,
			namespacedPluginName: namespacedPluginName(hookCtx.pluginName),
			pluginVersion: hookCtx.pluginVersion,
			version: hookCtx.cliVersion,
			buildTimestamp: new Date().toISOString(),
			artifact,
			registry: hookCtx.registry,
		});

		if (E.isLeft(renderResult)) {
			errors.push(formatError(renderResult.left, false));
			return;
		}

		if (validateJson) {
			try {
				JSON.parse(renderResult.right);
			} catch (error) {
				errors.push(
					`Invalid Antigravity JSON emitted for ${filePath}: ${error}`,
				);
				return;
			}
		}

		await mkdir(dirname(join(outputDir, filePath)), { recursive: true });
		await writeFile(join(outputDir, filePath), renderResult.right);
		verbatimFiles.push({
			name: filePath.split("/").at(-1) ?? filePath,
			path: filePath,
		});
	};

	const supportMatrix = await collectAntigravityWorkflowSupportMatrix(
		hookCtx.projectRoot,
	);
	warnings.push(...supportMatrix.errors);
	await writeFile(
		join(outputDir, "support-matrix.json"),
		`${JSON.stringify(supportMatrix.matrix, null, 2)}\n`,
	);
	verbatimFiles.push({
		name: "support-matrix.json",
		path: "support-matrix.json",
	});

	const delegation = await writeDelegationDefinitions(outputDir, hookCtx);
	errors.push(...delegation.errors);
	antigravityState.delegationDefinitions.push(...delegation.definitions);
	verbatimFiles.push(...delegation.files);
	errors.push(
		...(await assertDelegationPromptPathsMatchIndex(
			outputDir,
			hookCtx.pluginName,
		)),
	);

	const commonPackageArtifact = {
		description,
		commands: antigravityState.commandFiles.map((command) => command.name),
		skills: antigravityState.skillNames,
		agents: antigravityState.agentNames,
		delegationDefinitions: antigravityState.delegationDefinitions,
	};

	await renderTemplate(
		"antigravity/plugin",
		"plugin.json",
		commonPackageArtifact,
		true,
	);
	await renderTemplate(
		"antigravity/context",
		"AGENTS.md",
		commonPackageArtifact,
	);
	await renderTemplate("antigravity/rules", "rules/rp1-rules.md", {
		...commonPackageArtifact,
		supportMatrixPath: "support-matrix.json",
	});
	await renderTemplate(
		"antigravity/hooks",
		"hooks/hooks.json",
		commonPackageArtifact,
		true,
	);
	await renderTemplate(
		"antigravity/mcp-config",
		"mcp_config.json",
		commonPackageArtifact,
		true,
	);
	await renderTemplate(
		"antigravity/support-metadata",
		"support-metadata.json",
		{
			...commonPackageArtifact,
			commandFiles: antigravityState.commandFiles,
		},
		true,
	);

	errors.push(
		...(await assertNoActiveGeminiWording(
			outputDir,
			await collectPackageFiles(outputDir),
		)),
	);

	return {
		errors,
		warnings,
		commandFiles: antigravityState.commandFiles,
		verbatimFiles,
	};
};
