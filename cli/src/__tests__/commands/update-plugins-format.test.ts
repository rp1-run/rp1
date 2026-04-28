import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	formatPluginUpdateResult,
	formatUpdateAllResult,
} from "../../commands/update/plugins.js";
import type { SupportedTool } from "../../config/supported-tools.js";

describe("update plugin result formatting", () => {
	const originalLog = console.log;
	let logs: string[];
	const tool = (id: string, name: string): SupportedTool => ({
		id,
		name,
		enabled: true,
		binary: id,
		min_version: "0.0.0",
		instruction_file: "AGENTS.md",
		install_url: "https://example.test",
		plugin_install_cmd: null,
		capabilities: ["plugins"],
	});

	beforeEach(() => {
		logs = [];
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
	});

	afterEach(() => {
		console.log = originalLog;
	});

	test("formats a successful tool update with installed plugin names", () => {
		formatPluginUpdateResult(
			{
				toolId: "codex",
				toolName: "Codex CLI",
				success: true,
				pluginsInstalled: ["rp1-base", "rp1-dev"],
				warnings: [],
			},
			false,
		);

		expect(logs.join("\n")).toContain(
			"Codex CLI: Plugins updated successfully",
		);
		expect(logs.join("\n")).toContain("rp1-base, rp1-dev");
	});

	test("formats failed tool updates with errors and warnings", () => {
		formatPluginUpdateResult(
			{
				toolId: "opencode",
				toolName: "OpenCode",
				success: false,
				pluginsInstalled: [],
				warnings: ["restart manually"],
				error: {
					_tag: "InstallError",
					operation: "install",
					message: "copy failed",
				},
			},
			false,
		);

		const output = logs.join("\n");
		expect(output).toContain("OpenCode: Plugin update failed");
		expect(output).toContain("copy failed");
		expect(output).toContain("restart manually");
	});

	test("formats all-success summaries", () => {
		formatUpdateAllResult(
			{
				installed: 2,
				detected: [
					{
						tool: tool("codex", "Codex CLI"),
						version: "0.125.0",
						meetsMinVersion: true,
					},
					{
						tool: tool("opencode", "OpenCode"),
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
						success: true,
						pluginsInstalled: ["rp1-base"],
						warnings: [],
					},
				],
			},
			false,
		);

		const output = logs.join("\n");
		expect(output).toContain("Detected tools: Codex CLI, OpenCode");
		expect(output).toContain("Successfully updated: 2/2");
		expect(output).toContain("All plugins updated successfully.");
	});

	test("formats partial and zero-success summaries distinctly", () => {
		formatUpdateAllResult(
			{
				installed: 1,
				detected: [
					{
						tool: tool("codex", "Codex CLI"),
						version: "0.125.0",
						meetsMinVersion: true,
					},
					{
						tool: tool("opencode", "OpenCode"),
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
						warnings: [],
					},
				],
			},
			false,
		);
		expect(logs.join("\n")).toContain("Some plugins failed to update");

		logs = [];
		formatUpdateAllResult(
			{
				installed: 0,
				detected: [
					{
						tool: tool("codex", "Codex CLI"),
						version: "0.125.0",
						meetsMinVersion: true,
					},
				],
				results: [
					{
						toolId: "codex",
						toolName: "Codex CLI",
						success: false,
						pluginsInstalled: [],
						warnings: [],
					},
				],
			},
			false,
		);
		expect(logs.join("\n")).toContain("No plugins were updated");
	});
});
