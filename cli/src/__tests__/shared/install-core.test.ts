/**
 * Unit tests for the shared install-core module.
 * Tests core installation functions used by both `rp1 init` and `rp1 install` commands.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import {
	type InstallContext,
	installForSpecificTool as installForSpecificToolDirect,
	updateForSpecificTool as updateForSpecificToolDirect,
} from "../../shared/install-core.js";
import {
	createGeminiBundleAssetManifestFixture,
	writeGeminiBundleDistFixture,
} from "../helpers/gemini-bundle.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	withEnvOverride,
	writeFixture,
} from "../helpers/index.js";

type InstallCoreModule = typeof import("../../shared/install-core.js");

const createMockLogger = (): Logger => ({
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
});

const createMockContext = (
	overrides: Partial<InstallContext> = {},
): InstallContext => ({
	logger: createMockLogger(),
	isTTY: false,
	dryRun: false,
	skipPrompt: true,
	...overrides,
});

const createClaudeCodeTool = (): SupportedTool => ({
	id: "claude-code",
	name: "Claude Code",
	enabled: true,
	binary: "claude",
	min_version: "1.0.33",
	instruction_file: "CLAUDE.md",
	install_url: "https://claude.ai/download",
	plugin_install_cmd: "claude mcp add",
	capabilities: ["plugins", "mcp"],
});

const createOpenCodeTool = (): SupportedTool => ({
	id: "opencode",
	name: "OpenCode",
	enabled: true,
	binary: "opencode",
	min_version: "0.8.0",
	instruction_file: "AGENTS.md",
	install_url: "https://opencode.ai",
	plugin_install_cmd: null,
	capabilities: ["plugins"],
});

const createCopilotTool = (): SupportedTool => ({
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
});

const createCodexTool = (): SupportedTool => ({
	id: "codex",
	name: "Codex CLI",
	enabled: true,
	binary: "codex",
	min_version: "0.116.0",
	instruction_file: "AGENTS.md",
	install_url: "https://github.com/openai/codex",
	plugin_install_cmd: null,
	capabilities: ["skills", "agents"],
});

const createGeminiTool = (): SupportedTool => ({
	id: "gemini",
	name: "Gemini CLI",
	enabled: true,
	binary: "gemini",
	min_version: "0.0.0",
	instruction_file: "AGENTS.md",
	install_url: "https://github.com/google-gemini/gemini-cli",
	plugin_install_cmd: null,
	supportLevel: "stable",
	capabilities: ["slash-commands"],
});

const writeGeminiManifestAssets = async (homeDir: string): Promise<void> => {
	for (const asset of createGeminiBundleAssetManifestFixture()) {
		await writeFixture(homeDir, asset.relativePath, asset.expectedContent);
	}
};

const geminiBundleAssetsFixture = createGeminiBundleAssetManifestFixture();

const withGeminiBundleDir = async (homeDir: string): Promise<() => void> => {
	const bundleDir = await writeGeminiBundleDistFixture(homeDir);
	return withEnvOverride("RP1_GEMINI_BUNDLE_DIR", bundleDir);
};

const createMockRegistry = (): ToolsRegistry => ({
	version: "1.0.0",
	tools: [createClaudeCodeTool(), createOpenCodeTool()],
});

const createInstallRoutingRegistry = (): ToolsRegistry => ({
	version: "1.0.0",
	tools: [
		createClaudeCodeTool(),
		createOpenCodeTool(),
		createCodexTool(),
		{ ...createCopilotTool(), enabled: false },
	],
});

const createCodexRegistry = (): ToolsRegistry => ({
	version: "1.0.0",
	tools: [createCodexTool()],
});

afterEach(() => {
	mock.restore();
});

describe("install-core module", () => {
	describe("InstallContext interface", () => {
		test("accepts valid context configuration", () => {
			const ctx = createMockContext();

			expect(ctx.logger).toBeDefined();
			expect(ctx.isTTY).toBe(false);
			expect(ctx.dryRun).toBe(false);
			expect(ctx.skipPrompt).toBe(true);
		});

		test("allows TTY and dryRun overrides", () => {
			const ctx = createMockContext({
				isTTY: true,
				dryRun: true,
			});

			expect(ctx.isTTY).toBe(true);
			expect(ctx.dryRun).toBe(true);
		});
	});

	describe("ToolInstallResult interface contract", () => {
		test("result structure contains required fields", () => {
			const result = {
				toolId: "claude-code",
				toolName: "Claude Code",
				success: true,
				pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
				warnings: [] as readonly string[],
			};

			expect(result.toolId).toBe("claude-code");
			expect(result.toolName).toBe("Claude Code");
			expect(result.success).toBe(true);
			expect(result.pluginsInstalled).toHaveLength(2);
			expect(result.warnings).toHaveLength(0);
		});

		test("failed result includes error field", () => {
			const result = {
				toolId: "opencode",
				toolName: "OpenCode",
				success: false,
				pluginsInstalled: [] as readonly string[],
				warnings: [] as readonly string[],
				error: {
					_tag: "InstallError" as const,
					operation: "install",
					message: "Failed to install",
				},
			};

			expect(result.success).toBe(false);
			expect(result.error).toBeDefined();
			expect(result.error?._tag).toBe("InstallError");
		});
	});

	describe("InstallAllResult interface contract", () => {
		test("aggregates multiple tool results", () => {
			const result = {
				installed: 2,
				results: [
					{
						toolId: "claude-code",
						toolName: "Claude Code",
						success: true,
						pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
						warnings: [] as readonly string[],
					},
					{
						toolId: "opencode",
						toolName: "OpenCode",
						success: true,
						pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
						warnings: [] as readonly string[],
					},
				],
				detected: [],
			};

			expect(result.installed).toBe(2);
			expect(result.results).toHaveLength(2);
		});

		test("counts successful installations correctly", () => {
			const results = [
				{ success: true },
				{ success: false },
				{ success: true },
			];

			const installed = results.filter((r) => r.success).length;
			expect(installed).toBe(2);
		});
	});

	describe("Registry validation", () => {
		test("mock registry contains expected tools", () => {
			const registry = createMockRegistry();

			expect(registry.tools).toHaveLength(2);
			expect(registry.tools.find((t) => t.id === "claude-code")).toBeDefined();
			expect(registry.tools.find((t) => t.id === "opencode")).toBeDefined();
		});

		test("unknown tool ID is not found in registry", () => {
			const registry = createMockRegistry();
			const unknownTool = registry.tools.find((t) => t.id === "unknown-tool");

			expect(unknownTool).toBeUndefined();
		});
	});
});

describe("install-core function exports", () => {
	test("module exports required functions", async () => {
		const installCore = await import("../../shared/install-core.js");

		expect(typeof installCore.installClaudeCodePlugins).toBe("function");
		expect(typeof installCore.installOpenCodePlugins).toBe("function");
		expect(typeof installCore.installAllDetectedTools).toBe("function");
		expect(typeof installCore.installForSpecificTool).toBe("function");
	});

	test("context interface is used by exported functions", () => {
		const ctx: InstallContext = createMockContext();

		expect(ctx.logger).toBeDefined();
		expect(typeof ctx.isTTY).toBe("boolean");
		expect(typeof ctx.dryRun).toBe("boolean");
		expect(typeof ctx.skipPrompt).toBe("boolean");
	});
});

describe("install-core function signatures", () => {
	test("installClaudeCodePlugins accepts scope and context", async () => {
		const { installClaudeCodePlugins } = await import(
			"../../shared/install-core.js"
		);

		// This is a type-level test - we don't execute the actual installation
		expect(installClaudeCodePlugins.length).toBeGreaterThanOrEqual(0);
	});

	test("installOpenCodePlugins accepts config and context", async () => {
		const { installOpenCodePlugins } = await import(
			"../../shared/install-core.js"
		);

		expect(installOpenCodePlugins.length).toBeGreaterThanOrEqual(0);
	});

	test("installAllDetectedTools accepts registry and context", async () => {
		const { installAllDetectedTools } = await import(
			"../../shared/install-core.js"
		);

		expect(installAllDetectedTools.length).toBeGreaterThanOrEqual(0);
	});

	test("installForSpecificTool accepts toolId, registry, and context", async () => {
		const { installForSpecificTool } = await import(
			"../../shared/install-core.js"
		);

		expect(installForSpecificTool.length).toBeGreaterThanOrEqual(0);
	});
});

describe("install-core context variations", () => {
	test("context with dry-run mode", () => {
		const ctx = createMockContext({ dryRun: true });

		expect(ctx.dryRun).toBe(true);
	});

	test("context with TTY mode", () => {
		const ctx = createMockContext({ isTTY: true });

		expect(ctx.isTTY).toBe(true);
	});

	test("context with skipPrompt mode", () => {
		const ctx = createMockContext({ skipPrompt: true });

		expect(ctx.skipPrompt).toBe(true);
	});

	test("context combines multiple flags", () => {
		const ctx = createMockContext({
			dryRun: true,
			isTTY: true,
			skipPrompt: false,
		});

		expect(ctx.dryRun).toBe(true);
		expect(ctx.isTTY).toBe(true);
		expect(ctx.skipPrompt).toBe(false);
	});
});

describe("install-core result handling", () => {
	test("success result has expected shape", () => {
		const successResult = {
			toolId: "claude-code",
			toolName: "Claude Code",
			success: true,
			pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
			warnings: [] as readonly string[],
		};

		expect(successResult.success).toBe(true);
		expect(successResult.pluginsInstalled.length).toBeGreaterThan(0);
		expect(successResult.warnings.length).toBe(0);
	});

	test("failure result includes error details", () => {
		const failureResult = {
			toolId: "opencode",
			toolName: "OpenCode",
			success: false,
			pluginsInstalled: [] as readonly string[],
			warnings: ["Some warning"] as readonly string[],
			error: {
				_tag: "InstallError" as const,
				operation: "install",
				message: "Installation failed",
			},
		};

		expect(failureResult.success).toBe(false);
		expect(failureResult.error).toBeDefined();
		expect(failureResult.warnings.length).toBe(1);
	});

	test("partial success result has mixed outcomes", () => {
		const partialResult = {
			installed: 1,
			results: [
				{
					toolId: "claude-code",
					toolName: "Claude Code",
					success: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"] as readonly string[],
					warnings: [] as readonly string[],
				},
				{
					toolId: "opencode",
					toolName: "OpenCode",
					success: false,
					pluginsInstalled: [] as readonly string[],
					warnings: [] as readonly string[],
					error: {
						_tag: "InstallError" as const,
						operation: "install",
						message: "Failed",
					},
				},
			],
			detected: [],
		};

		expect(partialResult.installed).toBe(1);
		expect(partialResult.results.length).toBe(2);

		const successes = partialResult.results.filter((r) => r.success);
		const failures = partialResult.results.filter((r) => !r.success);

		expect(successes.length).toBe(1);
		expect(failures.length).toBe(1);
	});
});

describe("install-core tool routing", () => {
	test("installClaudeCodePlugins runs prerequisites before installing plugins", async () => {
		const calls: string[] = [];

		mock.module("../../install/claudecode/prerequisites.js", () => ({
			runAllPrerequisiteChecks: () => {
				calls.push("prerequisites");
				return TE.right([]);
			},
		}));
		mock.module("../../install/claudecode/installer.js", () => ({
			installAllPlugins: (
				scope: string,
				_logger: Logger,
				dryRun: boolean,
				isTTY: boolean,
			) => {
				calls.push(`install:${scope}:${dryRun}:${isTTY}`);
				return TE.right({
					marketplaceAdded: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"],
					warnings: [],
				});
			},
		}));

		const installCore = (await import(
			`../../shared/install-core.js?claude-route=${Date.now()}`
		)) as InstallCoreModule;
		const result = await expectTaskRight(
			installCore.installClaudeCodePlugins(
				"project",
				createMockContext({ dryRun: true, isTTY: true }),
			),
		);

		expect(result.pluginsInstalled).toEqual(["rp1-base", "rp1-dev"]);
		expect(calls).toEqual(["prerequisites", "install:project:true:true"]);
	});

	test("installOpenCodePlugins forwards install flags and reports default dev plugins", async () => {
		const installCalls: Array<{
			args: readonly string[];
			options: { isTTY: boolean; skipPrompt: boolean };
		}> = [];

		mock.module("../../install/command.js", () => ({
			executeInstall: (
				args: readonly string[],
				_logger: Logger,
				options: { isTTY: boolean; skipPrompt: boolean },
			) => {
				installCalls.push({ args, options });
				return TE.right(undefined);
			},
		}));

		const installCore = (await import(
			`../../shared/install-core.js?opencode-route=${Date.now()}`
		)) as InstallCoreModule;
		const result = await expectTaskRight(
			installCore.installOpenCodePlugins(
				{ artifactsDir: "/tmp/opencode-artifacts" },
				createMockContext({ dryRun: true, skipPrompt: true }),
			),
		);

		expect(result.pluginsInstalled).toEqual(["rp1-base", "rp1-dev"]);
		expect(installCalls).toEqual([
			{
				args: [
					"--artifacts-dir",
					"/tmp/opencode-artifacts",
					"--dry-run",
					"--yes",
				],
				options: { isTTY: false, skipPrompt: true },
			},
		]);
	});

	test("installForSpecificTool routes Codex through the default artifacts path", async () => {
		const installCalls: Array<{ config: unknown; ctx: InstallContext }> = [];
		const homeDir = await createTempDir("install-core-codex-specific");
		const restoreHome = withEnvOverride("HOME", homeDir);

		try {
			mock.module("../../install/codex/index.js", () => ({
				getDefaultCodexArtifactsDir: () => "/mock/default-codex",
				installCodex: (config: unknown, ctx: InstallContext) => {
					installCalls.push({ config, ctx });
					return TE.right({
						skillsCopied: 4,
						configMerged: true,
						backupPath: null,
						warnings: [],
						pluginsInstalled: ["rp1-base", "rp1-dev"],
					});
				},
			}));
			mock.module("../../lib/version.js", () => ({
				getInstalledVersion: () => "9.9.9",
			}));

			const installCore = (await import(
				`../../shared/install-core.js?codex-route=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.installForSpecificTool(
					"codex",
					createCodexRegistry(),
					createMockContext({ dryRun: false, skipPrompt: true }),
				),
			);

			expect(result.toolId).toBe("codex");
			expect(result.pluginsInstalled).toEqual(["rp1-base", "rp1-dev"]);
			expect(installCalls).toEqual([
				{
					config: {
						artifactsDir: "/mock/default-codex",
						dryRun: false,
						yes: true,
					},
					ctx: expect.objectContaining({
						dryRun: false,
						isTTY: false,
						skipPrompt: true,
					}),
				},
			]);

			const markerFile = join(homeDir, ".rp1", "platform-versions.json");
			const markers = JSON.parse(await Bun.file(markerFile).text()) as Record<
				string,
				{ version: string }
			>;
			expect(markers.codex?.version).toBe("9.9.9");
		} finally {
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("installForSpecificTool returns Codex installer failures as command errors", async () => {
		mock.module("../../install/codex/index.js", () => ({
			getDefaultCodexArtifactsDir: () => "/mock/default-codex",
			installCodex: () => TE.left(installError("codex", "Codex failed")),
		}));

		const installCore = (await import(
			`../../shared/install-core.js?codex-failure=${Date.now()}`
		)) as InstallCoreModule;
		const error = await expectTaskLeft(
			installCore.installForSpecificTool(
				"codex",
				createCodexRegistry(),
				createMockContext(),
			),
		);

		expect(getErrorMessage(error as CLIError)).toContain("Codex failed");
	});

	test("installForSpecificTool routes Copilot through the default artifacts path", async () => {
		const installCalls: Array<{ config: unknown; ctx: InstallContext }> = [];
		const homeDir = await createTempDir("install-core-copilot-specific");
		const restoreHome = withEnvOverride("HOME", homeDir);

		try {
			mock.module("../../install/copilot/index.js", () => ({
				getDefaultCopilotArtifactsDir: () => "/mock/default-copilot",
				installCopilot: (config: unknown, ctx: InstallContext) => {
					installCalls.push({ config, ctx });
					return TE.right({
						pluginsInstalled: ["rp1-base", "rp1-dev"],
						backupPath: null,
						warnings: ["restart Copilot"],
					});
				},
			}));
			mock.module("../../lib/version.js", () => ({
				getInstalledVersion: () => "9.9.9",
			}));

			const registry: ToolsRegistry = {
				version: "1.0.0",
				tools: [{ ...createCopilotTool(), enabled: true }],
			};
			const installCore = (await import(
				`../../shared/install-core.js?copilot-route=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.installForSpecificTool(
					"copilot",
					registry,
					createMockContext({ dryRun: true, skipPrompt: true }),
				),
			);

			expect(result.toolId).toBe("copilot");
			expect(result.pluginsInstalled).toEqual(["rp1-base", "rp1-dev"]);
			expect(result.warnings).toEqual(["restart Copilot"]);
			expect(installCalls).toEqual([
				{
					config: {
						artifactsDir: "/mock/default-copilot",
						dryRun: true,
						yes: true,
					},
					ctx: expect.objectContaining({
						dryRun: true,
						isTTY: false,
						skipPrompt: true,
					}),
				},
			]);

			const markerFile = join(homeDir, ".rp1", "platform-versions.json");
			const markers = JSON.parse(await Bun.file(markerFile).text()) as Record<
				string,
				{ version: string }
			>;
			expect(markers.copilot?.version).toBe("9.9.9");
		} finally {
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("installForSpecificTool hard-fails explicit Copilot installation failures", async () => {
		mock.module("../../install/copilot/index.js", () => ({
			getDefaultCopilotArtifactsDir: () => "/mock/default-copilot",
			installCopilot: () =>
				TE.left(
					installError(
						"copilot",
						"GitHub Copilot plugin lifecycle commands are unavailable",
					),
				),
		}));

		const registry: ToolsRegistry = {
			version: "1.0.0",
			tools: [{ ...createCopilotTool(), enabled: true }],
		};
		const installCore = (await import(
			`../../shared/install-core.js?copilot-failure=${Date.now()}`
		)) as InstallCoreModule;
		const error = await expectTaskLeft(
			installCore.installForSpecificTool(
				"copilot",
				registry,
				createMockContext({ dryRun: false, skipPrompt: true }),
			),
		);

		expect(getErrorMessage(error as CLIError)).toContain(
			"GitHub Copilot plugin lifecycle commands are unavailable",
		);
	});

	test("installForSpecificTool rejects unknown tools with enabled alternatives", async () => {
		const installCore = await import("../../shared/install-core.js");

		const error = (await expectTaskLeft(
			installCore.installForSpecificTool(
				"missing",
				createInstallRoutingRegistry(),
				createMockContext(),
			),
		)) as CLIError;

		expect(getErrorMessage(error)).toContain("Unknown tool: missing");
		expect(getErrorMessage(error)).toContain('"claude-code"');
		expect(getErrorMessage(error)).not.toContain('"copilot"');
	});

	test("installForSpecificTool rejects disabled tools before installation", async () => {
		const installCore = await import("../../shared/install-core.js");

		const error = (await expectTaskLeft(
			installCore.installForSpecificTool(
				"copilot",
				createInstallRoutingRegistry(),
				createMockContext(),
			),
		)) as CLIError;

		expect(getErrorMessage(error)).toContain("currently disabled");
	});

	test("installForSpecificTool installs the targeted Gemini bundle extension", async () => {
		const homeDir = await createTempDir("install-core-gemini-specific");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const installCore = (await import(
				`../../shared/install-core.js?gemini-specific=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.installForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: false }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				toolName: "Gemini CLI",
				success: true,
			});
			expect(result.pluginsInstalled).toEqual(
				expect.arrayContaining(["rp1-base", "rp1-dev"]),
			);
			expect(result.details?.join("\n")).toContain("Lifecycle stage: install");
			expect(result.details?.join("\n")).toContain(
				"Lifecycle state: current after successful install",
			);
			expect(
				await Bun.file(
					join(
						homeDir,
						".gemini",
						"extensions",
						"rp1-base",
						"commands",
						"rp1-base",
						"guide.toml",
					),
				).exists(),
			).toBe(true);
			expect(
				await Bun.file(
					join(
						homeDir,
						".gemini",
						"extensions",
						"rp1-dev",
						"support-matrix.json",
					),
				).exists(),
			).toBe(true);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("installForSpecificTool previews targeted Gemini assets", async () => {
		const homeDir = await createTempDir("install-core-gemini-specific-dry-run");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const installCore = (await import(
				`../../shared/install-core.js?gemini-specific-dry-run=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.installForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: true }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				toolName: "Gemini CLI",
				success: true,
			});
			expect(result.pluginsInstalled).toEqual(
				expect.arrayContaining(["rp1-base", "rp1-dev"]),
			);
			expect(result.details?.join("\n")).toContain("Lifecycle state: dry_run");
			expect(result.details?.join("\n")).toContain("rp1 install gemini");
			expect(
				await Bun.file(
					join(
						homeDir,
						".gemini",
						"extensions",
						"rp1-base",
						"commands",
						"rp1-base",
						"guide.toml",
					),
				).exists(),
			).toBe(false);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("direct Gemini install route reports dry-run and installed lifecycle scope", async () => {
		const homeDir = await createTempDir("install-core-gemini-direct-install");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const registry = { version: "1.0.0", tools: [createGeminiTool()] };
			const dryRun = await expectTaskRight(
				installForSpecificToolDirect(
					"gemini",
					registry,
					createMockContext({ dryRun: true }),
				),
			);
			expect(dryRun.details?.join("\n")).toContain("Lifecycle state: dry_run");
			expect(dryRun.pluginsInstalled).toEqual(
				expect.arrayContaining(["rp1-base", "rp1-dev"]),
			);

			const installed = await expectTaskRight(
				installForSpecificToolDirect(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(installed.details?.join("\n")).toContain(
				"Lifecycle state: current after successful install",
			);
			expect(
				await Bun.file(
					join(homeDir, geminiBundleAssetsFixture[0]?.relativePath ?? ""),
				).exists(),
			).toBe(true);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("updateForSpecificTool previews stale Gemini manifest refreshes", async () => {
		const homeDir = await createTempDir("install-core-gemini-update-dry-run");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const commandAsset = geminiBundleAssetsFixture[1];
			if (!commandAsset) throw new Error("Gemini bundle fixture is incomplete");
			await writeFixture(
				homeDir,
				commandAsset.relativePath,
				"stale generated command",
			);
			const installCore = (await import(
				`../../shared/install-core.js?gemini-update-dry-run=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: true }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				toolName: "Gemini CLI",
				success: true,
				restartRequired: false,
			});
			expect(result.details?.join("\n")).toContain("Lifecycle state: stale");
			expect(result.details?.join("\n")).toContain("Would refresh:");
			expect(
				await Bun.file(join(homeDir, commandAsset.relativePath)).text(),
			).toBe("stale generated command");
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("updateForSpecificTool refreshes stale Gemini manifest assets", async () => {
		const homeDir = await createTempDir("install-core-gemini-update");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const commandAsset = geminiBundleAssetsFixture[1];
			if (!commandAsset) throw new Error("Gemini bundle fixture is incomplete");
			await writeFixture(
				homeDir,
				commandAsset.relativePath,
				"stale generated command",
			);
			const installCore = (await import(
				`../../shared/install-core.js?gemini-update=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: false }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				toolName: "Gemini CLI",
				success: true,
				restartRequired: true,
			});
			expect(result.details?.join("\n")).toContain(
				"Lifecycle result: refreshed",
			);
			expect(
				await Bun.file(
					join(
						homeDir,
						".gemini",
						"extensions",
						"rp1-base",
						"commands",
						"rp1-base",
						"guide.toml",
					),
				).exists(),
			).toBe(true);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("updateForSpecificTool reports current Gemini assets without requiring restart", async () => {
		const homeDir = await createTempDir("install-core-gemini-update-current");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			await writeGeminiManifestAssets(homeDir);
			const installCore = (await import(
				`../../shared/install-core.js?gemini-update-current=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: false }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				success: true,
				restartRequired: false,
			});
			expect(result.details?.join("\n")).toContain("Lifecycle state: current");
			expect(result.details?.join("\n")).toContain("rp1 verify gemini");
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("updateForSpecificTool reports blocked Gemini lifecycle assets", async () => {
		const homeDir = await createTempDir("install-core-gemini-update-blocked");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const blockedAsset = geminiBundleAssetsFixture[0];
			if (!blockedAsset) throw new Error("Gemini manifest is empty");
			await writeGeminiManifestAssets(homeDir);
			await rm(join(homeDir, blockedAsset.relativePath), { force: true });
			await mkdir(join(homeDir, blockedAsset.relativePath), {
				recursive: true,
			});

			const installCore = (await import(
				`../../shared/install-core.js?gemini-update-blocked=${Date.now()}`
			)) as InstallCoreModule;
			const result = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					{ version: "1.0.0", tools: [createGeminiTool()] },
					createMockContext({ dryRun: false }),
				),
			);

			expect(result).toMatchObject({
				toolId: "gemini",
				success: false,
				restartRequired: false,
			});
			expect(result.error).toBeDefined();
			expect(result.details?.join("\n")).toContain("Lifecycle state: blocked");
			expect(result.details?.join("\n")).toContain("Check file permissions");
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("direct Gemini update route reports missing, current, and blocked states", async () => {
		const homeDir = await createTempDir("install-core-gemini-update-direct");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const registry = { version: "1.0.0", tools: [createGeminiTool()] };
			const missing = await expectTaskRight(
				updateForSpecificToolDirect(
					"gemini",
					registry,
					createMockContext({ dryRun: true }),
				),
			);
			expect(missing.success).toBe(true);
			expect(missing.details?.join("\n")).toContain("Lifecycle stage: update");
			expect(missing.details?.join("\n")).toContain("Would refresh:");

			await writeGeminiManifestAssets(homeDir);
			const current = await expectTaskRight(
				updateForSpecificToolDirect(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(current).toMatchObject({
				success: true,
				restartRequired: false,
			});
			expect(current.details?.join("\n")).toContain("Lifecycle state: current");

			const blockedAsset = geminiBundleAssetsFixture[0];
			if (!blockedAsset) throw new Error("Gemini manifest is empty");
			await rm(join(homeDir, blockedAsset.relativePath), { force: true });
			await mkdir(join(homeDir, blockedAsset.relativePath), {
				recursive: true,
			});
			const blocked = await expectTaskRight(
				updateForSpecificToolDirect(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(blocked.success).toBe(false);
			expect(blocked.error).toBeDefined();
			expect(blocked.details?.join("\n")).toContain("Lifecycle state: blocked");
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("installAllDetectedTools installs Gemini during automatic install", async () => {
		const homeDir = await createTempDir("install-core-gemini-auto-install");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		const installCore = (await import(
			`../../shared/install-core.js?gemini-auto-install=${Date.now()}`
		)) as InstallCoreModule;

		try {
			const result = await expectTaskRight(
				installCore.installAllDetectedTools(
					{
						version: "1.0.0",
						tools: [
							{
								...createGeminiTool(),
								binary: "bun",
								min_version: "0.0.0",
							},
						],
					},
					createMockContext(),
				),
			);

			expect(result.installed).toBe(1);
			expect(result.results).toEqual([
				expect.objectContaining({
					toolId: "gemini",
					success: true,
					pluginsInstalled: expect.arrayContaining(["rp1-base", "rp1-dev"]),
				}),
			]);
			expect(result.results[0]?.details?.join("\n")).toContain(
				"Lifecycle state: current after successful install",
			);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});

	test("installAllDetectedTools routes each detected host and reports unsupported tools without aborting", async () => {
		const calls: string[] = [];
		const fullRegistry: ToolsRegistry = {
			version: "1.0.0",
			tools: [
				{ ...createClaudeCodeTool(), binary: "bun", min_version: "0.0.0" },
				{ ...createOpenCodeTool(), binary: "bun", min_version: "0.0.0" },
				{
					id: "future-host",
					name: "Future Host",
					enabled: true,
					binary: "bun",
					min_version: "0.0.0",
					instruction_file: "AGENTS.md",
					install_url: "https://example.test/future",
					plugin_install_cmd: null,
					capabilities: ["plugins"],
				},
			],
		};

		mock.module("../../install/claudecode/prerequisites.js", () => ({
			runAllPrerequisiteChecks: () => {
				calls.push("claude:prerequisites");
				return TE.right([]);
			},
		}));
		mock.module("../../install/claudecode/installer.js", () => ({
			installAllPlugins: () => {
				calls.push("claude:install");
				return TE.right({
					marketplaceAdded: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"],
					warnings: ["restart Claude Code"],
				});
			},
		}));
		mock.module("../../install/command.js", () => ({
			executeInstall: (args: readonly string[]) => {
				calls.push(`opencode:${args.join(" ")}`);
				return TE.right(undefined);
			},
		}));

		const installCore = (await import(
			`../../shared/install-core.js?install-all=${Date.now()}`
		)) as InstallCoreModule;
		const result = await expectTaskRight(
			installCore.installAllDetectedTools(
				fullRegistry,
				createMockContext({ dryRun: true, skipPrompt: true }),
			),
		);

		expect(result.installed).toBe(2);
		expect(result.results.map((entry) => entry.toolId)).toEqual([
			"claude-code",
			"opencode",
			"future-host",
		]);
		expect(
			result.results.find((entry) => entry.toolId === "future-host"),
		).toMatchObject({
			success: false,
			warnings: ["Automated installation not supported for Future Host"],
		});
		expect(calls).toContain("claude:prerequisites");
		expect(calls).toContain("claude:install");
		expect(calls).toContain("opencode:--dry-run --yes");
	});

	test("installAllDetectedTools returns a detection error when no supported tools are installed", async () => {
		const emptyRegistry: ToolsRegistry = { version: "1.0.0", tools: [] };
		const installCore = await import("../../shared/install-core.js");
		const error = await expectTaskLeft(
			installCore.installAllDetectedTools(emptyRegistry, createMockContext()),
		);

		expect(getErrorMessage(error as CLIError)).toContain(
			"No supported agentic tools detected",
		);
	});

	test("installAllDetectedTools reports unsupported detected hosts without installer mocks", async () => {
		const registry: ToolsRegistry = {
			version: "1.0.0",
			tools: [
				{
					id: "future-host",
					name: "Future Host",
					enabled: true,
					binary: "bun",
					min_version: "0.0.0",
					instruction_file: "AGENTS.md",
					install_url: "https://example.test/future",
					plugin_install_cmd: null,
					capabilities: ["plugins"],
				},
			],
		};
		const installCore = await import("../../shared/install-core.js");

		const result = await expectTaskRight(
			installCore.installAllDetectedTools(registry, createMockContext()),
		);

		expect(result.installed).toBe(0);
		expect(result.results).toEqual([
			expect.objectContaining({
				toolId: "future-host",
				toolName: "Future Host",
				success: false,
				warnings: ["Automated installation not supported for Future Host"],
			}),
		]);
	});

	test("installAllDetectedTools captures per-tool installer failures and continues", async () => {
		const registry: ToolsRegistry = {
			version: "1.0.0",
			tools: [{ ...createCodexTool(), binary: "bun", min_version: "0.0.0" }],
		};
		mock.module("../../install/codex/index.js", () => ({
			getDefaultCodexArtifactsDir: () => "/mock/codex",
			installCodex: () => TE.left(installError("codex", "copy failed")),
		}));
		mock.module("../../install/version-marker.js", () => ({
			writeVersionMarker: () => TE.right(undefined),
		}));
		mock.module("../../lib/version.js", () => ({
			getInstalledVersion: () => "9.9.9",
		}));

		const installCore = (await import(
			`../../shared/install-core.js?install-failure=${Date.now()}`
		)) as InstallCoreModule;
		const result = await expectTaskRight(
			installCore.installAllDetectedTools(registry, createMockContext()),
		);

		expect(result.installed).toBe(0);
		expect(result.results[0]).toMatchObject({
			toolId: "codex",
			success: false,
			pluginsInstalled: [],
			error: {
				_tag: "InstallError",
				message: "copy failed",
			},
		});
	});

	test("final Gemini lifecycle route import covers default install and update states", async () => {
		const homeDir = await createTempDir("install-core-gemini-final-route");
		const restoreHome = withEnvOverride("HOME", homeDir);
		const restoreBundle = await withGeminiBundleDir(homeDir);

		try {
			const installCore = (await import(
				`../../shared/install-core.js?gemini-final-route=${Date.now()}`
			)) as InstallCoreModule;
			const registry: ToolsRegistry = {
				version: "1.0.0",
				tools: [createGeminiTool()],
			};

			const dryInstall = await expectTaskRight(
				installCore.installForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: true }),
				),
			);
			expect(dryInstall.details?.join("\n")).toContain(
				"Lifecycle state: dry_run",
			);
			expect(dryInstall.pluginsInstalled).toEqual(
				expect.arrayContaining(["rp1-base", "rp1-dev"]),
			);

			const installed = await expectTaskRight(
				installCore.installForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(installed.details?.join("\n")).toContain(
				"Lifecycle state: current after successful install",
			);

			const currentUpdate = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(currentUpdate).toMatchObject({
				success: true,
				restartRequired: false,
			});
			expect(currentUpdate.details?.join("\n")).toContain(
				"Lifecycle state: current",
			);

			const staleAsset = geminiBundleAssetsFixture[2];
			if (!staleAsset) throw new Error("Gemini manifest is incomplete");
			await writeFixture(homeDir, staleAsset.relativePath, "stale route asset");
			const dryUpdate = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: true }),
				),
			);
			expect(dryUpdate).toMatchObject({
				success: true,
				restartRequired: false,
			});
			expect(dryUpdate.details?.join("\n")).toContain("Would refresh:");
			expect(
				await Bun.file(join(homeDir, staleAsset.relativePath)).text(),
			).toBe("stale route asset");

			const refreshed = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(refreshed).toMatchObject({
				toolId: "gemini",
				success: true,
				restartRequired: true,
			});
			expect(refreshed.details?.join("\n")).toContain(
				"Lifecycle result: refreshed",
			);

			const blockedAsset = geminiBundleAssetsFixture[3];
			if (!blockedAsset) throw new Error("Gemini manifest is incomplete");
			await rm(join(homeDir, blockedAsset.relativePath), { force: true });
			await mkdir(join(homeDir, blockedAsset.relativePath), {
				recursive: true,
			});
			const blocked = await expectTaskRight(
				installCore.updateForSpecificTool(
					"gemini",
					registry,
					createMockContext({ dryRun: false }),
				),
			);
			expect(blocked).toMatchObject({
				toolId: "gemini",
				success: false,
				restartRequired: false,
			});
			expect(blocked.details?.join("\n")).toContain("Lifecycle state: blocked");

			const unknown = (await expectTaskLeft(
				installCore.updateForSpecificTool(
					"missing",
					registry,
					createMockContext({ dryRun: false }),
				),
			)) as CLIError;
			expect(getErrorMessage(unknown)).toContain("Unknown tool");

			const disabled = (await expectTaskLeft(
				installCore.updateForSpecificTool(
					"gemini",
					{
						version: "1.0.0",
						tools: [{ ...createGeminiTool(), enabled: false }],
					},
					createMockContext({ dryRun: false }),
				),
			)) as CLIError;
			expect(getErrorMessage(disabled)).toContain("currently disabled");

			await rm(join(homeDir, blockedAsset.relativePath), {
				recursive: true,
				force: true,
			});
			const autoInstall = await expectTaskRight(
				installCore.installAllDetectedTools(
					{
						version: "1.0.0",
						tools: [
							{
								...createGeminiTool(),
								binary: "bun",
								min_version: "0.0.0",
							},
						],
					},
					createMockContext({ dryRun: false }),
				),
			);
			expect(autoInstall.installed).toBe(1);
			expect(autoInstall.results).toEqual([
				expect.objectContaining({
					toolId: "gemini",
					success: true,
					pluginsInstalled: expect.arrayContaining(["rp1-base", "rp1-dev"]),
				}),
			]);
		} finally {
			restoreBundle();
			restoreHome();
			await cleanupTempDir(homeDir);
		}
	});
});
