import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { BundledAssets } from "../../assets/reader.js";
import type { GeminiAssetManifestEntry } from "../../install/gemini/index.js";

const supportMatrixFixture = (): string =>
	`${JSON.stringify(
		{
			updatedAt: "2026-05-19",
			entries: [
				{
					workflowId: "dev:build",
					name: "build",
					userFacingName: "rp1-dev:build",
					plugin: "dev",
					category: "development",
					workflowClass: "development_workflow",
					status: "unsupported",
					evidenceSource: null,
					unsupportedRationale:
						"No accepted Gemini runtime evidence currently promotes dev:build or its development workflow class from the catalog-backed matrix.",
					userAction:
						"Use Claude Code, OpenCode, Codex CLI, or GitHub Copilot CLI for this workflow until Gemini evidence promotes this entry.",
					exceptionOwner: "rp1-maintainers",
					updatedAt: "2026-05-19",
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
					status: "supported",
					evidenceSource:
						"features/gemini-cli-rp1-harness-first-class/gemini-runtime-contract.md",
					unsupportedRationale: null,
					userAction:
						"Run through generated Gemini bundle assets and verify registered work-root artifacts.",
					exceptionOwner: null,
					updatedAt: "2026-05-19",
					sourcePath: "plugins/dev/skills/build-fast/SKILL.md",
					argumentNames: ["FEATURE_ID"],
					runPolicy: "fresh",
					identityArgs: ["FEATURE_ID"],
				},
			],
			excludedEntries: [
				{
					workflowId: "dev:gemini-harness-smoke",
					name: "gemini-harness-smoke",
					userFacingName: "rp1-dev:gemini-harness-smoke",
					plugin: "dev",
					reason: "validation_only",
					rationale:
						"Gemini validation workflows collect release evidence and are not shipped product workflow support claims.",
					updatedAt: "2026-05-19",
					sourcePath: "plugins/dev/skills/gemini-harness-smoke/SKILL.md",
				},
			],
		},
		null,
		2,
	)}\n`;

export const createGeminiBundleAssetManifestFixture =
	(): readonly GeminiAssetManifestEntry[] => [
		{
			relativePath: ".gemini/extensions/rp1-base/gemini-extension.json",
			displayPath: "~/.gemini/extensions/rp1-base/gemini-extension.json",
			kind: "extension_manifest",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: '{"name":"rp1-base"}\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
			displayPath: "~/.gemini/extensions/rp1-base/commands/rp1-base/guide.toml",
			kind: "command",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: 'description = "Guide"\nprompt = "Use rp1-guide."\n',
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/extensions/rp1-base/GEMINI.md",
			displayPath: "~/.gemini/extensions/rp1-base/GEMINI.md",
			kind: "context",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# rp1-base\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/extensions/rp1-base/skills/rp1-guide/SKILL.md",
			displayPath: "~/.gemini/extensions/rp1-base/skills/rp1-guide/SKILL.md",
			kind: "skill",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Guide\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/extensions/rp1-dev/agents/rp1-dev-task-builder.md",
			displayPath:
				"~/.gemini/extensions/rp1-dev/agents/rp1-dev-task-builder.md",
			kind: "agent",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: "# Task Builder\n",
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
		{
			relativePath: ".gemini/extensions/rp1-dev/support-matrix.json",
			displayPath: "~/.gemini/extensions/rp1-dev/support-matrix.json",
			kind: "support_matrix",
			owner: "rp1",
			contentCheck: "exact_content",
			expectedContent: supportMatrixFixture(),
			safeRemovalEligible: true,
			lifecycleStages: ["install", "verify", "update", "uninstall"],
		},
	];

export const writeGeminiBundleAssetManifestFixture = async (
	homeDir: string,
	assets: readonly GeminiAssetManifestEntry[] = createGeminiBundleAssetManifestFixture(),
): Promise<void> => {
	for (const asset of assets) {
		const targetPath = join(homeDir, asset.relativePath);
		await mkdir(dirname(targetPath), { recursive: true });
		await writeFile(targetPath, asset.expectedContent, "utf-8");
	}
};

export const createBundledGeminiAssetsFixture = (): BundledAssets => ({
	platforms: {
		gemini: {
			platform: {
				id: "gemini",
				name: "Gemini CLI",
				binary: "gemini",
				instructionFile: "GEMINI.md",
				supportLevel: "experimental",
				icon: {
					source: "@lobehub/icons",
					name: "Gemini",
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
							fileName: "rp1-base/guide.toml",
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
							name: "gemini-extension.json",
							path: "/embedded/base-extension",
							content: '{"name":"rp1-base"}\n',
						},
						{
							name: "GEMINI.md",
							path: "/embedded/base-context",
							content: "# rp1-base\n",
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
							fileName: "rp1-dev-task-builder.md",
						},
					],
					skills: [],
					stateMachines: [],
					verbatimFiles: [
						{
							name: "support-matrix.json",
							path: "/embedded/dev-support",
							content: supportMatrixFixture(),
						},
					],
				},
			},
		},
	},
	webui: [],
	version: "0.0.0-test",
	buildTimestamp: "2026-05-19T00:00:00Z",
});

export const writeGeminiBundleDistFixture = async (
	rootDir: string,
): Promise<string> => {
	const distDir = join(rootDir, "dist-gemini");
	const files = new Map<string, string>([
		[
			"base/commands/rp1-base/guide.toml",
			'description = "Guide"\nprompt = "Use rp1-guide."\n',
		],
		["base/skills/rp1-guide/SKILL.md", "# Guide\n"],
		["base/gemini-extension.json", '{"name":"rp1-base"}\n'],
		["base/GEMINI.md", "# rp1-base\n"],
		["dev/agents/rp1-dev-task-builder.md", "# Task Builder\n"],
		["dev/support-matrix.json", supportMatrixFixture()],
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
					id: "gemini",
					name: "Gemini CLI",
					binary: "gemini",
					instructionFile: "GEMINI.md",
					supportLevel: "experimental",
					icon: {
						source: "@lobehub/icons",
						name: "Gemini",
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
							{
								name: "gemini-extension.json",
								path: "base/gemini-extension.json",
							},
							{ name: "GEMINI.md", path: "base/GEMINI.md" },
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
							{
								name: "support-matrix.json",
								path: "dev/support-matrix.json",
							},
						],
					},
				},
				version: "0.0.0-test",
				buildTimestamp: "2026-05-19T00:00:00Z",
			},
			null,
			2,
		)}\n`,
		"utf-8",
	);

	return distDir;
};
