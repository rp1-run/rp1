import { afterEach, describe, expect, mock, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../../../shared/logger.js";
import type { DetectedTool } from "../../../init/tool-detector.js";

const createTrackingMockLogger = (): Logger & {
	calls: { method: string; args: unknown[] }[];
} => {
	const calls: { method: string; args: unknown[] }[] = [];
	return {
		calls,
		trace: (...args: unknown[]) => calls.push({ method: "trace", args }),
		debug: (...args: unknown[]) => calls.push({ method: "debug", args }),
		info: (...args: unknown[]) => calls.push({ method: "info", args }),
		warn: (...args: unknown[]) => calls.push({ method: "warn", args }),
		error: (...args: unknown[]) => calls.push({ method: "error", args }),
		start: (...args: unknown[]) => calls.push({ method: "start", args }),
		success: (...args: unknown[]) => calls.push({ method: "success", args }),
		fail: (...args: unknown[]) => calls.push({ method: "fail", args }),
		box: (...args: unknown[]) => calls.push({ method: "box", args }),
	};
};

const createCopilotTool = (version = "2.74.0"): DetectedTool => ({
	tool: {
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
	},
	version,
	meetsMinVersion: true,
});

describe("plugin-installation Copilot flow", () => {
	afterEach(() => {
		mock.restore();
	});

	test("executes the shared native Copilot installation path during init", async () => {
		const sharedInstallCalls: Array<{ config: unknown; ctx: unknown }> = [];

		mock.module("../../../shared/install-core.js", () => ({
			installCopilotPlugins: (config: unknown, ctx: unknown) => {
				sharedInstallCalls.push({ config, ctx });
				return TE.right({
					marketplaceAdded: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"],
					warnings: [],
				});
			},
			installOpenCodePlugins: () =>
				TE.right({
					pluginsInstalled: [],
					warnings: [],
				}),
		}));

		const { executePluginInstallation } = (await import(
			`../../../init/steps/plugin-installation.js?copilot-init=${Date.now()}`
		)) as typeof import("../../../init/steps/plugin-installation.js");
		const logger = createTrackingMockLogger();
		const result = await executePluginInstallation(
			createCopilotTool(),
			{ isTTY: false },
			logger,
		);

		expect(result.result?.success).toBe(true);
		expect(result.result?.warnings).toEqual([]);
		expect(
			result.actions
				.filter((action) => action.type === "plugin_installed")
				.map((action) =>
					action.type === "plugin_installed" ? action.name : "",
				),
		).toEqual(["rp1-base", "rp1-dev"]);
		expect(sharedInstallCalls).toEqual([
			{
				config: {},
				ctx: expect.objectContaining({
					dryRun: false,
					isTTY: false,
					skipPrompt: true,
				}),
			},
		]);
	});
});
