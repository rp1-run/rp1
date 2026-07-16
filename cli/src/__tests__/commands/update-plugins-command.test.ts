import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../../shared/logger.js";
import { createPluginsSubcommand } from "../../commands/update/plugins.js";
import type {
	SupportedTool,
	ToolsRegistry,
} from "../../config/supported-tools.js";
import type { DetectedTool } from "../../init/tool-detector.js";
import type { InstallContext } from "../../shared/install-core.js";
import { writeAntigravityBundleDistFixture } from "../helpers/antigravity-bundle.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

const logger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

const createRegistryTool = (
	tool: Pick<SupportedTool, "id" | "name" | "binary" | "instruction_file"> &
		Partial<SupportedTool>,
): SupportedTool => ({
	enabled: true,
	min_version: "0.0.0",
	install_url: `https://example.test/${tool.id}`,
	plugin_install_cmd: null,
	capabilities: ["plugins"],
	...tool,
});

const registry = {
	version: "1.0",
	tools: [
		createRegistryTool({
			id: "claude-code",
			name: "Claude Code",
			binary: "claude",
			instruction_file: "CLAUDE.md",
		}),
		createRegistryTool({
			id: "opencode",
			name: "OpenCode",
			binary: "opencode",
			instruction_file: "AGENTS.md",
		}),
		createRegistryTool({
			id: "codex",
			name: "Codex CLI",
			binary: "codex",
			instruction_file: "AGENTS.md",
		}),
		createRegistryTool({
			id: "copilot",
			name: "GitHub Copilot CLI",
			binary: "gh",
			instruction_file: "AGENTS.md",
		}),
		createRegistryTool({
			id: "antigravity",
			name: "Antigravity CLI",
			binary: "agy",
			instruction_file: "AGENTS.md",
			supportLevel: "stable",
		}),
	],
} satisfies ToolsRegistry;

const codexTool = registry.tools.find((tool) => tool.id === "codex")!;

const createCommandDeps = (
	overrides: Partial<Parameters<typeof createPluginsSubcommand>[0]> = {},
): Parameters<typeof createPluginsSubcommand>[0] => ({
	loadToolsRegistry: async () => registry,
	installAllDetectedTools: mock(
		(_toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
			TE.right({
				installed: 0,
				detected: [],
				results: [],
			}),
	),
	updateForSpecificTool: mock(
		(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
			TE.right({
				toolId: "codex",
				toolName: "Codex CLI",
				success: true,
				pluginsInstalled: [],
				warnings: [],
			}),
	),
	detectTools: (_toolsRegistry: ToolsRegistry) =>
		TE.right({ detected: [] as DetectedTool[], missing: [] }),
	getEffectiveHarnesses: (detection) => [...detection.detected],
	...overrides,
});

const runPluginsCommand = async (
	argv: string[],
	deps: Parameters<typeof createPluginsSubcommand>[0] = createCommandDeps(),
): Promise<void> => {
	const root = new Command("rp1");
	const update = new Command("update")
		.option("--dry-run", "Show what would be done without executing", false)
		.option("-y, --yes", "Skip confirmation prompts", false);
	Object.assign(root, { _logger: logger, _isTTY: false });
	root.addCommand(update);
	update.addCommand(createPluginsSubcommand(deps));
	await root.parseAsync(["node", "rp1", ...argv], { from: "node" });
};

const runRealPluginsCommand = async (
	argv: string[],
	bundleDir?: string,
): Promise<{ readonly exitCode: number; readonly output: string }> => {
	const originalBundleDir = process.env.RP1_ANTIGRAVITY_BUNDLE_DIR;
	const logs: string[] = [];
	if (bundleDir) {
		process.env.RP1_ANTIGRAVITY_BUNDLE_DIR = bundleDir;
	}
	const originalLog = console.log;
	const originalExit = process.exit;
	try {
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
		const root = new Command("rp1");
		const update = new Command("update")
			.option("--dry-run", "Show what would be done without executing", false)
			.option("-y, --yes", "Skip confirmation prompts", false);
		Object.assign(root, { _logger: logger, _isTTY: false });
		root.addCommand(update);
		update.addCommand(createPluginsSubcommand());
		try {
			await root.parseAsync(["node", "rp1", ...argv], { from: "node" });
			return { exitCode: 0, output: logs.join("\n") };
		} catch (error) {
			if (error instanceof ProcessExit) {
				return { exitCode: error.code, output: logs.join("\n") };
			}
			throw error;
		}
	} finally {
		console.log = originalLog;
		process.exit = originalExit;
		if (originalBundleDir === undefined) {
			delete process.env.RP1_ANTIGRAVITY_BUNDLE_DIR;
		} else {
			process.env.RP1_ANTIGRAVITY_BUNDLE_DIR = originalBundleDir;
		}
	}
};

describe("update plugins command action", () => {
	const originalLog = console.log;
	const originalError = console.error;
	const originalExit = process.exit;
	let logs: string[];
	let errors: string[];
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("update-plugins-command");
		logs = [];
		errors = [];
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
	});

	afterEach(async () => {
		console.log = originalLog;
		console.error = originalError;
		process.exit = originalExit;
		await cleanupTempDir(tempDir);
		mock.restore();
	});

	test("rejects unknown tool names before loading install state", async () => {
		await expect(
			runPluginsCommand(["update", "plugins", "unknown"]),
		).rejects.toMatchObject({
			code: 1,
		});

		expect(errors.join("\n")).toContain("Invalid tool: unknown");
	});

	test("updates one requested tool with dry-run context", async () => {
		const updateForSpecificTool = mock(
			(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
				TE.right({
					toolId: "codex",
					toolName: "Codex CLI",
					success: true,
					pluginsInstalled: ["rp1-base"],
					warnings: [],
				}),
		);
		await expect(
			runPluginsCommand(
				["update", "plugins", "codex", "--dry-run"],
				createCommandDeps({ updateForSpecificTool }),
			),
		).rejects.toMatchObject({ code: 0 });

		expect(updateForSpecificTool.mock.calls[0]?.[0]).toBe("codex");
		expect(updateForSpecificTool.mock.calls[0]?.[1]).toBe(registry);
		expect(updateForSpecificTool.mock.calls[0]?.[2]).toMatchObject({
			dryRun: true,
			skipPrompt: true,
		});
		expect(logs.join("\n")).toContain("Dry run mode");
		expect(logs.join("\n")).toContain(
			"Codex CLI: Plugins updated successfully",
		);
	});

	test("honors update-level dry-run when routing plugin updates", async () => {
		const updateForSpecificTool = mock(
			(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
				TE.right({
					toolId: "codex",
					toolName: "Codex CLI",
					success: true,
					pluginsInstalled: [],
					warnings: [],
				}),
		);
		await expect(
			runPluginsCommand(
				["update", "--dry-run", "plugins", "codex"],
				createCommandDeps({ updateForSpecificTool }),
			),
		).rejects.toMatchObject({ code: 0 });

		expect(updateForSpecificTool.mock.calls[0]?.[2]).toMatchObject({
			dryRun: true,
		});
		expect(logs.join("\n")).toContain("Dry run mode");
	});

	test("routes targeted Antigravity updates through the named update path", async () => {
		const updateForSpecificTool = mock(
			(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
				TE.right({
					toolId: "antigravity",
					toolName: "Antigravity CLI",
					success: true,
					restartRequired: false,
					pluginsInstalled: [],
					details: [
						"Lifecycle stage: update",
						"Lifecycle state: current",
						"Next action: Run `rp1 verify antigravity` to validate Antigravity CLI readiness.",
					],
					warnings: [],
				}),
		);
		await expect(
			runPluginsCommand(
				["update", "plugins", "antigravity", "--dry-run"],
				createCommandDeps({ updateForSpecificTool }),
			),
		).rejects.toMatchObject({ code: 0 });

		expect(updateForSpecificTool.mock.calls[0]?.[0]).toBe("antigravity");
		const output = logs.join("\n");
		expect(output).toContain("Antigravity CLI: Plugins updated successfully");
		expect(output).toContain("Lifecycle stage: update");
		expect(output).toContain("Lifecycle state: current");
	});

	test("runs the real targeted Antigravity update route in-process", async () => {
		const bundleDir = await writeAntigravityBundleDistFixture(tempDir);
		const result = await runRealPluginsCommand(
			["update", "plugins", "antigravity", "--dry-run"],
			bundleDir,
		);

		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Updating plugins for antigravity");
		expect(result.output).toContain(
			"Antigravity CLI: Plugins updated successfully",
		);
		expect(result.output).toContain("Lifecycle stage: update");
		expect(result.output).toContain("Lifecycle state:");
	});

	test("prints restart guidance for targeted Antigravity refreshes that update assets", async () => {
		const updateForSpecificTool = mock(
			(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
				TE.right({
					toolId: "antigravity",
					toolName: "Antigravity CLI",
					success: true,
					restartRequired: true,
					pluginsInstalled: [],
					details: [
						"Lifecycle stage: update",
						"Lifecycle result: refreshed",
						"Next action: Restart Antigravity CLI, then run `rp1 verify antigravity`.",
					],
					warnings: [],
				}),
		);
		await expect(
			runPluginsCommand(
				["update", "plugins", "antigravity", "--yes"],
				createCommandDeps({ updateForSpecificTool }),
			),
		).rejects.toMatchObject({ code: 0 });

		const output = logs.join("\n");
		expect(output).toContain("Lifecycle result: refreshed");
		expect(output).toContain("Please restart Antigravity CLI");
	});

	test("includes Antigravity in update-all as a successful command", async () => {
		const antigravityDetected: DetectedTool = {
			tool: {
				...codexTool,
				id: "antigravity",
				name: "Antigravity CLI",
			},
			version: "0.0.0",
			meetsMinVersion: true,
		};
		const detectToolsMock = (_toolsRegistry: ToolsRegistry) =>
			TE.right({
				detected: [antigravityDetected] as DetectedTool[],
				missing: [],
			});
		const getEffectiveHarnessesMock = (detection: {
			detected: readonly DetectedTool[];
		}) => [...detection.detected];
		const updateForSpecificTool = mock(
			(_toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) =>
				TE.right({
					toolId: "antigravity",
					toolName: "Antigravity CLI",
					success: true,
					restartRequired: false,
					pluginsInstalled: ["rp1-base", "rp1-dev"],
					details: [
						"Lifecycle stage: update",
						"Lifecycle result: refreshed",
						"Next action: Restart Antigravity CLI, then run `rp1 verify antigravity`.",
					],
					warnings: [],
				}),
		);
		await expect(
			runPluginsCommand(
				["update", "plugins", "all"],
				createCommandDeps({
					detectTools: detectToolsMock,
					getEffectiveHarnesses: getEffectiveHarnessesMock,
					updateForSpecificTool,
				}),
			),
		).rejects.toMatchObject({ code: 0 });

		const output = logs.join("\n");
		expect(output).toContain("Antigravity CLI: Plugins updated successfully");
		expect(output).toContain("rp1-base, rp1-dev");
		expect(output).not.toContain("See errors above");
	});

	test("updates all tools and exits nonzero when any update fails", async () => {
		const codexDetected: DetectedTool = {
			tool: codexTool,
			version: "0.1.0",
			meetsMinVersion: true,
		};
		const opencodeDetected: DetectedTool = {
			tool: { ...codexTool, id: "opencode", name: "OpenCode" },
			version: "0.9.0",
			meetsMinVersion: true,
		};
		const detectToolsMock = (_toolsRegistry: ToolsRegistry) =>
			TE.right({
				detected: [codexDetected, opencodeDetected] as DetectedTool[],
				missing: [],
			});
		const getEffectiveHarnessesMock = (detection: {
			detected: readonly DetectedTool[];
		}) => [...detection.detected];
		const updateForSpecificTool = mock(
			(toolId: string, _toolsRegistry: ToolsRegistry, _ctx: InstallContext) => {
				if (toolId === "codex") {
					return TE.right({
						toolId: "codex",
						toolName: "Codex CLI",
						success: true,
						pluginsInstalled: ["rp1-base"],
						warnings: [],
					});
				}
				return TE.right({
					toolId: "opencode",
					toolName: "OpenCode",
					success: false,
					pluginsInstalled: [],
					warnings: ["manual restart required"],
				});
			},
		);
		await expect(
			runPluginsCommand(
				["update", "plugins", "all", "--yes"],
				createCommandDeps({
					detectTools: detectToolsMock,
					getEffectiveHarnesses: getEffectiveHarnessesMock,
					updateForSpecificTool,
				}),
			),
		).rejects.toMatchObject({ code: 1 });

		expect(updateForSpecificTool.mock.calls[0]?.[0]).toBe("codex");
		expect(updateForSpecificTool.mock.calls[0]?.[2]).toMatchObject({
			dryRun: false,
			skipPrompt: true,
		});
		const output = logs.join("\n");
		expect(output).toContain("Successfully updated: 1/2");
		expect(output).toContain("Some plugins failed to update");
		expect(output).toContain("manual restart required");
	});
});
