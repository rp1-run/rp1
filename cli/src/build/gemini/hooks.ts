import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../shared/errors.js";
import {
	collectAntigravityWorkflowSupportMatrix,
	collectGeminiWorkflowSupportMatrix,
} from "../../catalog/index.js";
import type { ClaudeCodeSkill } from "../models.js";
import type {
	HookContext,
	PlatformBuildState,
	PostBuildResult,
} from "../platform-definitions.js";
import { validateGeminiCommandToml } from "./validator.js";

interface GeminiGeneratedCommand {
	readonly name: string;
	readonly path: string;
}

interface GeminiBuildState extends PlatformBuildState {
	commandFiles: GeminiGeneratedCommand[];
	skillNames: string[];
	agentNames: string[];
}

const asGeminiBuildState = (state: PlatformBuildState): GeminiBuildState =>
	state as GeminiBuildState;

const namespacedPluginName = (pluginName: string): string =>
	`rp1-${pluginName}`;

const geminiCommandName = (pluginName: string, skillName: string): string =>
	`${namespacedPluginName(pluginName)}:${skillName}`;

const geminiSkillName = (skillName: string): string => `rp1-${skillName}`;

const geminiCommandPath = (pluginName: string, skillName: string): string =>
	`commands/${namespacedPluginName(pluginName)}/${skillName}.toml`;

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

	return `${namespacedPluginName(hookCtx.pluginName)} workflows for Gemini CLI`;
};

const buildCommandPrompt = (
	pluginName: string,
	skillName: string,
	generatedSkillName: string,
	skillContent: string,
): string =>
	[
		`# ${geminiCommandName(pluginName, skillName)}`,
		"",
		"Arguments: {{args}}",
		"",
		`Use the bundled Gemini skill \`${generatedSkillName}\` for this request. If the skill is not activated automatically, follow the embedded skill instructions below.`,
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

export const geminiPreparePlugin = async (
	_ctx: HookContext,
): Promise<PlatformBuildState> => ({
	commandFiles: [],
	skillNames: [],
	agentNames: [],
});

export const geminiPostSkillWrite = async (
	skillDir: string,
	skill: ClaudeCodeSkill,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<void> => {
	const geminiState = asGeminiBuildState(state);
	const generatedSkillName = geminiSkillName(skill.name);
	geminiState.skillNames.push(generatedSkillName);

	const commandRelativePath = geminiCommandPath(hookCtx.pluginName, skill.name);
	const commandOutputPath = join(hookCtx.outputDir, commandRelativePath);
	const generatedSkillContent = await readFile(
		join(skillDir, "SKILL.md"),
		"utf-8",
	);

	const renderResult = await hookCtx.engine.render("gemini/command", {
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

	const validation = validateGeminiCommandToml(
		renderResult.right,
		commandRelativePath,
	);
	if (E.isLeft(validation)) {
		throw new Error(formatError(validation.left, false));
	}

	await mkdir(dirname(commandOutputPath), { recursive: true });
	await writeFile(commandOutputPath, renderResult.right);
	geminiState.commandFiles.push({
		name: geminiCommandName(hookCtx.pluginName, skill.name),
		path: commandRelativePath,
	});
};

export const geminiPostPluginBuild = async (
	outputDir: string,
	state: PlatformBuildState,
	hookCtx: HookContext,
): Promise<PostBuildResult> => {
	const errors: string[] = [];
	const warnings: string[] = [];
	const verbatimFiles: { name: string; path: string }[] = [];
	const description = await readPluginDescription(hookCtx);
	const geminiState = asGeminiBuildState(state);
	geminiState.agentNames.push(...(await listGeneratedAgentNames(outputDir)));

	const renderTemplate = async (
		template: string,
		filePath: string,
		artifact: Record<string, unknown>,
		validateJson = false,
	): Promise<void> => {
		const renderResult = await hookCtx.engine.render(template, {
			platform: hookCtx.platform,
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
				errors.push(`Invalid Gemini JSON emitted for ${filePath}: ${error}`);
				return;
			}
		}

		await writeFile(join(outputDir, filePath), renderResult.right);
		verbatimFiles.push({
			name: filePath.split("/").at(-1) ?? filePath,
			path: filePath,
		});
	};

	const supportMatrix =
		hookCtx.platform === "antigravity"
			? await collectAntigravityWorkflowSupportMatrix(hookCtx.projectRoot)
			: await collectGeminiWorkflowSupportMatrix(hookCtx.projectRoot);
	warnings.push(...supportMatrix.errors);
	await writeFile(
		join(outputDir, "support-matrix.json"),
		`${JSON.stringify(supportMatrix.matrix, null, 2)}\n`,
	);
	verbatimFiles.push({
		name: "support-matrix.json",
		path: "support-matrix.json",
	});

	await renderTemplate(
		"gemini/extension",
		"gemini-extension.json",
		{
			description,
			contextFileName: "GEMINI.md",
		},
		true,
	);

	await renderTemplate("gemini/context", "GEMINI.md", {
		description,
		skills: geminiState.skillNames,
		agents: geminiState.agentNames,
		commands: geminiState.commandFiles.map((command) => command.name),
	});

	return {
		errors,
		warnings,
		commandFiles: geminiState.commandFiles,
		verbatimFiles,
	};
};
