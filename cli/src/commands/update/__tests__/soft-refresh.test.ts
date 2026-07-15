import { afterEach, describe, expect, mock, spyOn, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";

const createMockLogger = () => ({
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

const copilotTool = {
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
};

const detectedCopilot = {
	tool: copilotTool,
	version: "1.0.0",
	meetsMinVersion: true,
};

describe("standard update plugin refresh", () => {
	afterEach(() => {
		mock.restore();
	});

	test("continues the core update when an opportunistic detected-tool refresh fails", async () => {
		mock.module("../../../config/supported-tools.js", () => ({
			loadToolsRegistry: async () => ({
				version: "1.0",
				tools: [copilotTool],
			}),
		}));
		mock.module("../../../init/tool-detector.js", () => ({
			detectTools: () =>
				TE.right({
					detected: [detectedCopilot],
					missing: [],
				}),
		}));
		mock.module("../../../shared/install-core.js", () => ({
			getEffectiveHarnesses: () => [detectedCopilot],
			installAllDetectedTools: () =>
				TE.right({
					installed: 0,
					detected: [detectedCopilot],
					results: [
						{
							toolId: "copilot",
							toolName: "GitHub Copilot CLI",
							success: false,
							pluginsInstalled: [],
							warnings: [],
							error: {
								_tag: "PrerequisiteError",
								check: "copilot-plugin-support",
								message:
									"GitHub Copilot plugin lifecycle commands are unavailable",
								suggestion:
									"Install or update GitHub Copilot CLI, then verify with `copilot version` and `copilot plugin --help`.",
							},
						},
					],
				}),
			updateForSpecificTool: () =>
				TE.right({
					toolId: "copilot",
					toolName: "GitHub Copilot CLI",
					success: false,
					pluginsInstalled: [],
					warnings: [],
					error: {
						_tag: "PrerequisiteError",
						check: "copilot-plugin-support",
						message: "GitHub Copilot plugin lifecycle commands are unavailable",
						suggestion:
							"Install or update GitHub Copilot CLI, then verify with `copilot version` and `copilot plugin --help`.",
					},
				}),
			installForSpecificTool: () =>
				TE.left({
					_tag: "InstallError",
					operation: "unused",
					message: "unused",
				}),
		}));

		const logSpy = spyOn(console, "log").mockImplementation(() => {});
		const errorSpy = spyOn(console, "error").mockImplementation(() => {});
		const { updateDetectedPlugins } = (await import(
			`../index.js?soft-refresh=${Date.now()}`
		)) as typeof import("../index.js");

		const result = await updateDetectedPlugins(
			{ dryRun: false, yes: true },
			createMockLogger(),
			false,
		);

		const output = [
			...logSpy.mock.calls.flat(),
			...errorSpy.mock.calls.flat(),
		].join("\n");
		expect(result).toEqual({ success: true, exitCode: 0 });
		expect(output).toContain(
			"Plugin refresh had failures, but the core rp1 update will continue.",
		);
		expect(output).toContain("rp1 update plugins copilot");
		expect(output).toContain("copilot plugin --help");
	});
});
