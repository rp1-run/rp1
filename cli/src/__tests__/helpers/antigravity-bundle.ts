import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BundledAssets } from "../../assets/reader.js";
import type { AntigravityAssetManifestEntry } from "../../install/antigravity/index.js";

const supportMatrixFixture = (): string =>
	`${JSON.stringify(
		{
			updatedAt: "2026-05-20",
			entries: [
				{
					workflowId: "dev:build",
					name: "build",
					userFacingName: "rp1-dev:build",
					plugin: "dev",
					category: "development",
					workflowClass: "development_workflow",
					status: "supported",
					evidenceSource:
						"Antigravity package assets: plugins/dev/skills/build/SKILL.md",
					supportRationale:
						"Workflow is distributable, user-invocable, and does not require delegated Antigravity subagent orchestration.",
					limitation: null,
					delegation: {
						mode: "none",
						requiredSubAgents: [],
						runtimeContract: null,
						staticAgentsDiscovery: "not_used",
					},
					userAction:
						"Install Antigravity CLI package assets with `rp1 install antigravity`, restart Antigravity CLI, and run the rp1 workflow command from Antigravity.",
					exceptionOwner: null,
					updatedAt: "2026-05-20",
					sourcePath: "plugins/dev/skills/build/SKILL.md",
					argumentNames: ["FEATURE_ID"],
					runPolicy: "resumable",
					identityArgs: ["FEATURE_ID"],
				},
				{
					workflowId: "dev:build-fast",
					name: "build-fast",
					userFacingName: "rp1-dev:build-fast",
					plugin: "dev",
					category: "development",
					workflowClass: "development_workflow",
					status: "limited",
					evidenceSource:
						"Antigravity package assets: plugins/dev/skills/build-fast/SKILL.md",
					supportRationale:
						"Delegated workflow support uses Antigravity dynamic session subagents: define each required rp1-derived type once, then invoke the cached TypeName for task and fanout units.",
					limitation:
						"Requires the per-session dynamic `define_subagent` plus cached `invoke_subagent` contract; static `/agents` discovery is not support evidence.",
					delegation: {
						mode: "dynamic_session_subagents",
						requiredSubAgents: ["dev:task-builder"],
						runtimeContract: "define_once_invoke_many",
						staticAgentsDiscovery: "not_used",
					},
					userAction:
						"Install Antigravity CLI package assets with `rp1 install antigravity`, restart Antigravity CLI, and run from `agy`; delegated work must define each rp1 subagent type once with `define_subagent` before reusing the cached `TypeName` with `invoke_subagent`.",
					exceptionOwner: "rp1 product",
					updatedAt: "2026-05-20",
					sourcePath: "plugins/dev/skills/build-fast/SKILL.md",
					argumentNames: ["BUILD_REQUEST"],
					runPolicy: "resumable",
					identityArgs: ["BUILD_REQUEST"],
				},
				{
					workflowId: "dev:legacy-workflow",
					name: "legacy-workflow",
					userFacingName: "rp1-dev:legacy-workflow",
					plugin: "dev",
					category: "development",
					workflowClass: "development_workflow",
					status: "unsupported",
					evidenceSource: null,
					supportRationale:
						"Workflow is not validated for Antigravity CLI and must not be launched as a shipped Antigravity workflow.",
					limitation:
						"No Antigravity runtime evidence exists for this workflow.",
					delegation: {
						mode: "none",
						requiredSubAgents: [],
						runtimeContract: null,
						staticAgentsDiscovery: "not_used",
					},
					userAction:
						"Use a supported workflow row or record fresh Antigravity evidence before enabling this workflow.",
					exceptionOwner: "rp1 product",
					updatedAt: "2026-05-20",
					sourcePath: "plugins/dev/skills/legacy-workflow/SKILL.md",
					argumentNames: [],
				},
			],
			excludedEntries: [],
		},
		null,
		2,
	)}\n`;

export const createAntigravityBundleAssetManifestFixture =
	(): readonly AntigravityAssetManifestEntry[] => [
		{
			relativePath: ".gemini/antigravity-cli/rp1-base/plugin.json",
			displayPath: "~/.gemini/antigravity-cli/rp1-base/plugin.json",
			kind: "plugin_manifest",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent:
				'{"name":"rp1-base","host":{"id":"antigravity","binary":"agy"}}\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath:
				".gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
			displayPath:
				"~/.gemini/antigravity-cli/rp1-base/commands/rp1-base/guide.toml",
			kind: "command",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: 'description = "Guide"\nprompt = "Use rp1-guide."\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/antigravity-cli/rp1-base/AGENTS.md",
			displayPath: "~/.gemini/antigravity-cli/rp1-base/AGENTS.md",
			kind: "context",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# rp1-base\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath:
				".gemini/antigravity-cli/rp1-base/skills/rp1-guide/SKILL.md",
			displayPath:
				"~/.gemini/antigravity-cli/rp1-base/skills/rp1-guide/SKILL.md",
			kind: "skill",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Guide\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/antigravity-cli/rp1-base/mcp_config.json",
			displayPath: "~/.gemini/antigravity-cli/rp1-base/mcp_config.json",
			kind: "mcp_config",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: '{"mcpServers":{}}\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath:
				".gemini/antigravity-cli/rp1-dev/agents/rp1-dev-task-builder.md",
			displayPath:
				"~/.gemini/antigravity-cli/rp1-dev/agents/rp1-dev-task-builder.md",
			kind: "agent",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Task Builder\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/antigravity-cli/rp1-dev/plugin.json",
			displayPath: "~/.gemini/antigravity-cli/rp1-dev/plugin.json",
			kind: "plugin_manifest",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent:
				'{"name":"rp1-dev","host":{"id":"antigravity","binary":"agy"}}\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/antigravity-cli/rp1-dev/support-matrix.json",
			displayPath: "~/.gemini/antigravity-cli/rp1-dev/support-matrix.json",
			kind: "support_matrix",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: supportMatrixFixture(),
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath:
				".gemini/antigravity-cli/rp1-dev/delegation-definitions/index.json",
			displayPath:
				"~/.gemini/antigravity-cli/rp1-dev/delegation-definitions/index.json",
			kind: "delegation_definition",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent:
				'{"runtimeContract":"define_subagent_once_per_session_then_invoke_subagent"}\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
	];

export const writeAntigravityBundleAssetManifestFixture = async (
	homeDir: string,
	assets: readonly AntigravityAssetManifestEntry[] = createAntigravityBundleAssetManifestFixture(),
): Promise<void> => {
	for (const asset of assets) {
		const targetPath = join(homeDir, asset.relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, asset.expectedContent, "utf-8");
	}
};

export const createBundledAntigravityAssetsFixture = (): BundledAssets => ({
	platforms: {
		antigravity: {
			platform: {
				id: "antigravity",
				name: "Antigravity CLI",
				binary: "agy",
				instructionFile: "AGENTS.md",
				supportLevel: "stable",
				icon: {
					source: "@lobehub/icons",
					name: "Antigravity",
					variant: "mono",
				},
			},
			plugins: {
				base: {
					name: "rp1-base",
					commands: [
						{
							name: "rp1-base:guide",
							path: "/embedded/guide-command",
							content: 'description = "Guide"\nprompt = "Use rp1-guide."\n',
							fileName: "commands/rp1-base/guide.toml",
						},
					],
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
							name: "plugin.json",
							path: "/embedded/base-plugin",
							content:
								'{"name":"rp1-base","host":{"id":"antigravity","binary":"agy"}}\n',
						},
						{
							name: "AGENTS.md",
							path: "/embedded/base-context",
							content: "# rp1-base\n",
						},
						{
							name: "mcp_config.json",
							path: "/embedded/base-mcp",
							content: '{"mcpServers":{}}\n',
						},
					],
				},
				dev: {
					name: "rp1-dev",
					commands: [],
					agents: [
						{
							name: "task-builder",
							path: "/embedded/task-agent",
							content: "# Task Builder\n",
							fileName: "agents/rp1-dev-task-builder.md",
						},
					],
					skills: [],
					stateMachines: [],
					verbatimFiles: [
						{
							name: "plugin.json",
							path: "/embedded/dev-plugin",
							content:
								'{"name":"rp1-dev","host":{"id":"antigravity","binary":"agy"}}\n',
						},
						{
							name: "support-matrix.json",
							path: "/embedded/dev-support",
							content: supportMatrixFixture(),
						},
						{
							name: "index.json",
							path: "/embedded/delegation-index",
							fileName: "delegation-definitions/index.json",
							content:
								'{"runtimeContract":"define_subagent_once_per_session_then_invoke_subagent"}\n',
						},
					],
				},
			},
		},
	},
	webui: [],
	version: "0.0.0-test",
	buildTimestamp: "2026-05-20T00:00:00Z",
});

export const writeAntigravityBundleDistFixture = async (
	rootDir: string,
): Promise<string> => {
	const distDir = join(rootDir, "dist-antigravity");
	const files = new Map<string, string>([
		[
			"base/commands/rp1-base/guide.toml",
			'description = "Guide"\nprompt = "Use rp1-guide."\n',
		],
		["base/skills/rp1-guide/SKILL.md", "# Guide\n"],
		[
			"base/plugin.json",
			'{"name":"rp1-base","host":{"id":"antigravity","binary":"agy"}}\n',
		],
		[
			"dev/plugin.json",
			'{"name":"rp1-dev","host":{"id":"antigravity","binary":"agy"}}\n',
		],
		["base/AGENTS.md", "# rp1-base\n"],
		["base/mcp_config.json", '{"mcpServers":{}}\n'],
		["dev/agents/rp1-dev-task-builder.md", "# Task Builder\n"],
		["dev/support-matrix.json", supportMatrixFixture()],
		[
			"dev/delegation-definitions/index.json",
			'{"runtimeContract":"define_subagent_once_per_session_then_invoke_subagent"}\n',
		],
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
					id: "antigravity",
					name: "Antigravity CLI",
					binary: "agy",
					instructionFile: "AGENTS.md",
					supportLevel: "stable",
					icon: {
						source: "@lobehub/icons",
						name: "Antigravity",
						variant: "mono",
					},
				},
				plugins: {
					base: {
						name: "rp1-base",
						commands: [
							{
								name: "rp1-base:guide",
								path: "base/commands/rp1-base/guide.toml",
							},
						],
						agents: [],
						skills: [
							{
								name: "rp1-guide/SKILL.md",
								path: "base/skills/rp1-guide/SKILL.md",
							},
						],
						stateMachines: [],
						verbatimFiles: [
							{ name: "plugin.json", path: "base/plugin.json" },
							{ name: "AGENTS.md", path: "base/AGENTS.md" },
							{ name: "mcp_config.json", path: "base/mcp_config.json" },
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
						verbatimFiles: [
							{ name: "plugin.json", path: "dev/plugin.json" },
							{
								name: "support-matrix.json",
								path: "dev/support-matrix.json",
							},
							{
								name: "index.json",
								path: "dev/delegation-definitions/index.json",
							},
						],
					},
				},
				version: "0.0.0-test",
				buildTimestamp: "2026-05-20T00:00:00Z",
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	return distDir;
};
