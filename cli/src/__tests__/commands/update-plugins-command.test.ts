import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { Command } from "commander";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../../shared/logger.js";
import type { InstallContext } from "../../shared/install-core.js";

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

const registry = {
	tools: [
		{
			id: "codex",
			name: "Codex CLI",
			enabled: true,
			binary: "codex",
			min_version: "0.0.0",
			instruction_file: "AGENTS.md",
			install_url: "https://example.test/codex",
			plugin_install_cmd: null,
			capabilities: ["plugins"],
		},
	],
};

const importPluginsModule = async () =>
	(await import(
		`../../commands/update/plugins.js?coverage=${Date.now()}-${Math.random()}`
	)) as typeof import("../../commands/update/plugins.js");

const runPluginsCommand = async (argv: string[]): Promise<void> => {
	const { pluginsSubcommand } = await importPluginsModule();
	const root = new Command("rp1");
	const update = new Command("update");
	Object.assign(root, { _logger: logger, _isTTY: false });
	root.addCommand(update);
	update.addCommand(pluginsSubcommand);
	await root.parseAsync(["node", "rp1", ...argv], { from: "node" });
};

describe("update plugins command action", () => {
	const originalLog = console.log;
	const originalError = console.error;
	const originalExit = process.exit;
	let logs: string[];
	let errors: string[];

	beforeEach(() => {
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

	afterEach(() => {
		console.log = originalLog;
		console.error = originalError;
		process.exit = originalExit;
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
		const installForSpecificTool = mock(
			(
				_toolId: string,
				_toolsRegistry: typeof registry,
				_ctx: InstallContext,
			) =>
				TE.right({
					toolId: "codex",
					toolName: "Codex CLI",
					success: true,
					pluginsInstalled: ["rp1-base"],
					warnings: [],
				}),
		);
		mock.module("../../config/supported-tools.js", () => ({
			loadToolsRegistry: async () => registry,
		}));
		mock.module("../../shared/install-core.js", () => ({
			installAllDetectedTools: mock(() => TE.right({})),
			installForSpecificTool,
		}));

		await expect(
			runPluginsCommand(["update", "plugins", "codex", "--dry-run"]),
		).rejects.toMatchObject({ code: 0 });

		expect(installForSpecificTool.mock.calls[0]?.[0]).toBe("codex");
		expect(installForSpecificTool.mock.calls[0]?.[1]).toBe(registry);
		expect(installForSpecificTool.mock.calls[0]?.[2]).toMatchObject({
			dryRun: true,
			skipPrompt: true,
		});
		expect(logs.join("\n")).toContain("Dry run mode");
		expect(logs.join("\n")).toContain(
			"Codex CLI: Plugins updated successfully",
		);
	});

	test("updates all tools and exits nonzero when any update fails", async () => {
		const installAllDetectedTools = mock(
			(_toolsRegistry: typeof registry, _ctx: InstallContext) =>
				TE.right({
					installed: 1,
					detected: [
						{
							tool: registry.tools[0],
							version: "0.1.0",
							meetsMinVersion: true,
						},
						{
							tool: { ...registry.tools[0], id: "opencode", name: "OpenCode" },
							version: "0.9.0",
							meetsMinVersion: true,
						},
					],
					results: [
						{
							toolId: "codex",
							toolName: "Codex CLI",
							success: true,
							pluginsInstalled: ["rp1-base"],
							warnings: [],
						},
						{
							toolId: "opencode",
							toolName: "OpenCode",
							success: false,
							pluginsInstalled: [],
							warnings: ["manual restart required"],
						},
					],
				}),
		);
		mock.module("../../config/supported-tools.js", () => ({
			loadToolsRegistry: async () => registry,
		}));
		mock.module("../../shared/install-core.js", () => ({
			installAllDetectedTools,
			installForSpecificTool: mock(() => TE.right({})),
		}));

		await expect(
			runPluginsCommand(["update", "plugins", "all", "--yes"]),
		).rejects.toMatchObject({ code: 1 });

		expect(installAllDetectedTools.mock.calls[0]?.[0]).toBe(registry);
		expect(installAllDetectedTools.mock.calls[0]?.[1]).toMatchObject({
			dryRun: false,
			skipPrompt: true,
		});
		const output = logs.join("\n");
		expect(output).toContain("Successfully updated: 1/2");
		expect(output).toContain("Some plugins failed to update");
		expect(output).toContain("manual restart required");
	});
});
