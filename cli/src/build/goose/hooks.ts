import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import type { ArgumentDefinition, ClaudeCodeSkill } from "../models.js";
import type {
	HookContext,
	PlatformBuildState,
	PostBuildResult,
} from "../platform-definitions.js";
import { buildTemplateContext } from "../template-context.js";

interface GooseRecipeSummary {
	readonly name: string;
	readonly path: string;
	readonly skill: string;
	readonly sourceSkill: string;
	readonly description: string;
	readonly isWorkflow: boolean;
	readonly requiredExtensions: readonly string[];
	readonly unsupportedTools: readonly string[];
	readonly arguments: readonly ArgumentDefinition[];
}

interface GooseBuildState extends PlatformBuildState {
	recipes: GooseRecipeSummary[];
}

const asGooseBuildState = (state: PlatformBuildState): GooseBuildState =>
	state as GooseBuildState;

const namespacedPluginName = (pluginName: string): string =>
	`rp1-${pluginName}`;

const gooseRecipeName = (pluginName: string, skillName: string): string =>
	`${namespacedPluginName(pluginName)}-${skillName}`;

const parseToolNames = (allowedTools: string | undefined): readonly string[] =>
	(allowedTools ?? "")
		.split(",")
		.map((tool) => tool.trim())
		.filter(Boolean)
		.map((tool) => tool.match(/^([A-Za-z]+)(?:\(.+\))?$/)?.[1] ?? tool);

const requiredExtensionsForSkill = (
	skill: ClaudeCodeSkill,
	hookCtx: HookContext,
): readonly string[] => {
	const extensions = new Set<string>(["developer"]);
	for (const tool of parseToolNames(skill.allowedTools)) {
		const mapped = hookCtx.registry.toolMappings[tool];
		if (mapped) {
			extensions.add(mapped);
		}
	}
	return [...extensions].sort();
};

const unsupportedToolsForSkill = (
	skill: ClaudeCodeSkill,
	hookCtx: HookContext,
): readonly string[] =>
	[
		...new Set(
			parseToolNames(skill.allowedTools).filter((tool) => {
				const mapping = hookCtx.registry.toolMappings[tool];
				return mapping === null || mapping === undefined;
			}),
		),
	].sort();

const listGeneratedAgentNames = async (
	outputDir: string,
): Promise<readonly string[]> => {
	try {
		const entries = await readdir(join(outputDir, "agents"), {
			withFileTypes: true,
		});
		return entries
			.filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
			.map((entry) => entry.name.replace(/\.md$/, ""))
			.sort((a, b) => a.localeCompare(b));
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
		throw error;
	}
};

const writeJsonMetadata = async (
	outputDir: string,
	hookCtx: HookContext,
	state: GooseBuildState,
): Promise<readonly string[]> => {
	const errors: string[] = [];
	const agentNames = await listGeneratedAgentNames(outputDir);
	const renderResult = await hookCtx.engine.render("goose/support-metadata", {
		platform: hookCtx.platform,
		platformConfig: hookCtx.platformConfig,
		pluginName: hookCtx.pluginName,
		namespacedPluginName: namespacedPluginName(hookCtx.pluginName),
		pluginVersion: hookCtx.pluginVersion,
		version: hookCtx.cliVersion,
		buildTimestamp: new Date().toISOString(),
		artifact: {
			recipesJson: JSON.stringify(state.recipes, null, 2),
			agentsJson: JSON.stringify(agentNames, null, 2),
		},
		registry: hookCtx.registry,
	});

	if (E.isLeft(renderResult)) {
		errors.push(formatError(renderResult.left, false));
		return errors;
	}

	try {
		JSON.parse(renderResult.right);
	} catch (error) {
		errors.push(
			`Invalid Goose JSON emitted for support-metadata.json: ${error}`,
		);
		return errors;
	}

	await writeFile(join(outputDir, "support-metadata.json"), renderResult.right);
	return errors;
};

export const goosePreparePlugin = async (): Promise<PlatformBuildState> => ({
	recipes: [],
});

export const goosePostSkillWrite = async (
	_skillDir: string,
	skill: ClaudeCodeSkill,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<void> => {
	const gooseState = asGooseBuildState(state);
	const namespacedSkillDir = `rp1-${skill.name}`;
	const recipeName = gooseRecipeName(hookCtx.pluginName, skill.name);
	const recipePath = `recipes/${recipeName}.yaml`;
	const requiredExtensions = requiredExtensionsForSkill(skill, hookCtx);
	const unsupportedTools = unsupportedToolsForSkill(skill, hookCtx);
	const recipeCtx = buildTemplateContext(
		hookCtx.platform,
		hookCtx.pluginName,
		hookCtx.pluginVersion,
		{
			type: "skill" as const,
			name: skill.name,
			namespacedName: namespacedSkillDir,
			description: skill.description,
			allowedTools: skill.allowedTools,
			unsupportedTools,
			content: skill.content,
			metadata: skill.metadata,
			supportingFiles: skill.supportingFiles,
		},
		hookCtx.registry,
		hookCtx.cliVersion,
		hookCtx.platformConfig,
	);

	const recipeResult = await hookCtx.engine.render("goose/recipe", recipeCtx);
	if (E.isLeft(recipeResult)) {
		throw new Error(formatError(recipeResult.left, false));
	}

	await mkdir(join(hookCtx.outputDir, "recipes"), { recursive: true });
	await writeFile(join(hookCtx.outputDir, recipePath), recipeResult.right);
	gooseState.recipes.push({
		name: recipeName,
		path: recipePath,
		skill: namespacedSkillDir,
		sourceSkill: `${hookCtx.pluginName}:${skill.name}`,
		description: skill.description,
		isWorkflow: skill.metadata?.isWorkflow === true,
		requiredExtensions,
		unsupportedTools,
		arguments: skill.metadata?.arguments ?? [],
	});
};

export const goosePostPluginBuild = async (
	outputDir: string,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const gooseState = asGooseBuildState(state);
	const errors = [...(await writeJsonMetadata(outputDir, hookCtx, gooseState))];

	return {
		errors,
		warnings: [],
		verbatimFiles: [
			...gooseState.recipes.map((recipe) => ({
				name: `${recipe.name}.yaml`,
				path: recipe.path,
			})),
			{
				name: "support-metadata.json",
				path: "support-metadata.json",
			},
		],
	};
};
