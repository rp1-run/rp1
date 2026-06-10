import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BundledAssets } from "../../assets/reader.js";
import type { GooseAssetManifestEntry } from "../../install/goose/index.js";

const recipeFixture = (): string => `version: 1.0.0
title: rp1-base-guide
description: Guide
instructions: |
  Use the generated skill at {{ recipe_dir }}/../skills/rp1-guide/SKILL.md.
  Before running the rp1 workflow, use the developer shell to run \`goose --version\` and verify it is at least 1.35.0.
  If Goose is older than 1.35.0, stop without running the rp1 workflow and report the upgrade requirement.
  The recipe parameter ARGUMENTS contains: {{ ARGUMENTS }}.
prompt: |
  Run rp1-guide with ARGUMENTS={{ ARGUMENTS }}.
extensions:
  - type: builtin
    name: developer
parameters:
  - key: ARGUMENTS
    input_type: string
    requirement: optional
    description: Raw rp1 arguments
    default: ""
`;

const supportMetadataFixture = (): string =>
	`${JSON.stringify(
		{
			schemaVersion: 1,
			plugin: "base",
			nativePluginName: "rp1-base",
			version: "0.0.0-test",
			supportScope: "generated-core-harness-assets",
			supportClaim:
				"Experimental core harness support for generated Goose skills, agents, recipes, targeted install/verify, and a verified non-delegating recipe runtime path.",
			unsupportedScope: [
				"ACP sidecar work",
				"protocol integration",
				"eval harness expansion",
				"PR-review expansion",
				"nested subagents and nested delegation",
				"interactive headless approvals and user elicitation",
				"broad workflow parity",
			],
			entrypoint: "goose run --recipe <recipe-file>",
			runtime: {
				harness: "goose",
				currentHost: "goose",
				bootstrapHarness: "goose",
				jsonOutput: "transcript-or-metadata-envelope",
			},
			capabilities: {
				shellAndFilesystem: {
					status: "supported",
					extension: "developer",
					tools: ["Read", "Write", "Edit", "Grep", "Glob", "Bash"],
				},
				delegation: {
					status: "unsupported_fail_closed",
					reason: "foreground Summon smoke has not passed",
				},
				nestedDelegation: {
					status: "unsupported_fail_closed",
				},
				interactiveInput: {
					status: "unsupported_fail_closed",
					includes: ["interactive approvals", "user elicitation"],
				},
				webAccess: {
					status: "unsupported_fail_closed",
				},
			},
			recipes: [
				{
					name: "rp1-base-guide",
					path: "recipes/rp1-base-guide.yaml",
					skill: "rp1-guide",
					sourceSkill: "base:guide",
					description: "Guide",
					isWorkflow: false,
					requiredExtensions: ["developer"],
					unsupportedTools: [],
					arguments: [],
				},
			],
			agents: ["rp1-dev-task-builder"],
		},
		null,
		2,
	)}\n`;

export const createGooseBundleAssetManifestFixture =
	(): readonly GooseAssetManifestEntry[] => [
		{
			relativePath: ".agents/skills/rp1-guide/SKILL.md",
			displayPath: "~/.agents/skills/rp1-guide/SKILL.md",
			kind: "skill",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Guide\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".agents/agents/rp1-dev-task-builder.md",
			displayPath: "~/.agents/agents/rp1-dev-task-builder.md",
			kind: "agent",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Task Builder\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".agents/recipes/rp1-base-guide.yaml",
			displayPath: "~/.agents/recipes/rp1-base-guide.yaml",
			kind: "recipe",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: recipeFixture(),
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".agents/plugins/rp1-base/support-metadata.json",
			displayPath: "~/.agents/plugins/rp1-base/support-metadata.json",
			kind: "support_metadata",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: supportMetadataFixture(),
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
	];

export const writeGooseBundleAssetManifestFixture = async (
	homeDir: string,
	assets: readonly GooseAssetManifestEntry[] = createGooseBundleAssetManifestFixture(),
): Promise<void> => {
	for (const asset of assets) {
		const targetPath = join(homeDir, asset.relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, asset.expectedContent, "utf-8");
	}
};

export const createBundledGooseAssetsFixture = (): BundledAssets => ({
	platforms: {
		goose: {
			platform: {
				id: "goose",
				name: "Goose",
				binary: "goose",
				instructionFile: "AGENTS.md",
				supportLevel: "experimental",
				icon: {
					source: "@lobehub/icons",
					name: "Goose",
					variant: "mono",
				},
			},
			plugins: {
				base: {
					name: "rp1-base",
					commands: [],
					agents: [],
					skills: [
						{
							name: "rp1-guide/SKILL.md",
							path: "/embedded/guide-skill",
							content: "# Guide\n",
						},
					],
					stateMachines: [],
					verbatimFiles: [
						{
							name: "rp1-base-guide.yaml",
							path: "/embedded/guide-recipe",
							content: recipeFixture(),
						},
						{
							name: "support-metadata.json",
							path: "/embedded/base-support",
							content: supportMetadataFixture(),
						},
					],
				},
				dev: {
					name: "rp1-dev",
					commands: [],
					agents: [
						{
							name: "task-builder",
							path: "/embedded/task-builder",
							content: "# Task Builder\n",
							fileName: "rp1-dev-task-builder.md",
						},
					],
					skills: [],
					stateMachines: [],
					verbatimFiles: [],
				},
			},
		},
	},
	webui: [],
	version: "0.0.0-test",
	buildTimestamp: "2026-06-09T00:00:00Z",
});

export const writeGooseBundleDistFixture = async (
	rootDir: string,
): Promise<string> => {
	const distDir = join(rootDir, "dist-goose");
	const files = new Map<string, string>([
		["base/skills/rp1-guide/SKILL.md", "# Guide\n"],
		["base/recipes/rp1-base-guide.yaml", recipeFixture()],
		["base/support-metadata.json", supportMetadataFixture()],
		["dev/agents/rp1-dev-task-builder.md", "# Task Builder\n"],
	]);

	for (const [relativePath, content] of files) {
		const targetPath = join(distDir, relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, content, "utf-8");
	}

	await writeFile(
		join(distDir, "bundle-manifest.json"),
		`${JSON.stringify(
			{
				platform: {
					id: "goose",
					name: "Goose",
					binary: "goose",
					instructionFile: "AGENTS.md",
					supportLevel: "experimental",
					icon: {
						source: "@lobehub/icons",
						name: "Goose",
						variant: "mono",
					},
				},
				plugins: {
					base: {
						name: "rp1-base",
						commands: [],
						agents: [],
						skills: [
							{
								name: "rp1-guide/SKILL.md",
								path: "base/skills/rp1-guide/SKILL.md",
							},
						],
						stateMachines: [],
						verbatimFiles: [
							{
								name: "rp1-base-guide.yaml",
								path: "base/recipes/rp1-base-guide.yaml",
							},
							{
								name: "support-metadata.json",
								path: "base/support-metadata.json",
							},
						],
					},
					dev: {
						name: "rp1-dev",
						commands: [],
						agents: [
							{
								name: "task-builder",
								path: "dev/agents/rp1-dev-task-builder.md",
							},
						],
						skills: [],
						stateMachines: [],
						verbatimFiles: [],
					},
				},
				version: "0.0.0-test",
				buildTimestamp: "2026-06-09T00:00:00Z",
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	return distDir;
};
