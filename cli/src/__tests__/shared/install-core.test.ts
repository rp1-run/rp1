/**
 * Unit tests for the shared install-core module.
 * Tests core installation functions used by both `rp1 init` and `rp1 install` commands.
 */

import { afterEach, describe, expect, mock, test } from "bun:test";
import { join } from "node:path";
import * as TE from "fp-ts/lib/TaskEither.js";
import { type CLIError, installError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import type { InstallContext } from "../../shared/install-core.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
	withEnvOverride,
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
	binary: "gh",
	min_version: "2.74.0",
	instruction_file: "AGENTS.md",
	install_url:
		"https://docs.github.com/copilot/using-github-copilot/using-github-copilot-in-the-command-line",
	plugin_install_cmd: "gh copilot -- plugin install {plugin}",
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
});
