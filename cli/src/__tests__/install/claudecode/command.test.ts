import { afterEach, describe, expect, mock, test } from "bun:test";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Logger } from "../../../../shared/logger.js";
import { expectTaskRight } from "../../helpers/index.js";

const createLogger = (): { logger: Logger; messages: string[] } => {
	const messages: string[] = [];
	const logger: Logger = {
		trace: () => {},
		debug: (message: string) => messages.push(message),
		info: (message: string) => messages.push(message),
		warn: (message: string) => messages.push(message),
		error: (message: string) => messages.push(message),
		start: (message: string) => messages.push(message),
		success: (message: string) => messages.push(message),
		fail: (message: string) => messages.push(message),
		box: (message: string) => messages.push(message),
	};
	return { logger, messages };
};

const importCommand = async () =>
	(await import(
		`../../../install/claudecode/command.js?coverage=${Date.now()}-${Math.random()}`
	)) as typeof import("../../../install/claudecode/command.js");

describe("claude code install command", () => {
	afterEach(() => {
		mock.restore();
	});

	test("parses dry-run, confirmation, scope, and help flags", async () => {
		const { parseClaudeCodeInstallArgs } = await importCommand();

		expect(
			parseClaudeCodeInstallArgs([
				"--dry-run",
				"--yes",
				"--scope",
				"project",
				"--help",
			]),
		).toEqual({
			dryRun: true,
			yes: true,
			scope: "project",
			showHelp: true,
		});
		expect(parseClaudeCodeInstallArgs(["-y", "-s", "local"])).toMatchObject({
			yes: true,
			scope: "local",
		});
		expect(parseClaudeCodeInstallArgs(["--scope", "invalid"])).toMatchObject({
			scope: "user",
		});
	});

	test("dry-run execution reports prerequisite success and scoped plan", async () => {
		mock.module("../../../install/claudecode/prerequisites.js", () => ({
			runAllPrerequisiteChecks: () =>
				TE.right([
					{
						check: "claude-installed",
						passed: true,
						message: "Claude Code found",
					},
				]),
		}));
		const { executeClaudeCodeInstall } = await importCommand();
		const { logger, messages } = createLogger();

		await expectTaskRight(
			executeClaudeCodeInstall(["--dry-run", "--scope", "project"], logger, {
				isTTY: false,
				skipPrompt: true,
			}),
		);

		const output = messages.join("\n");
		expect(output).toContain("Installing rp1 plugins to Claude Code");
		expect(output).toContain("[dry-run] Installation plan:");
		expect(output).toContain(
			"claude plugin install rp1-base@rp1-local --scope project",
		);
	});

	test("normal execution installs plugins and renders success output", async () => {
		const installAllPlugins = mock(
			(_scope: string, _logger: Logger, _dryRun: boolean, _isTTY: boolean) =>
				TE.right({
					marketplaceAdded: true,
					pluginsInstalled: ["rp1-base", "rp1-dev"],
					warnings: [],
				}),
		);
		mock.module("../../../install/claudecode/prerequisites.js", () => ({
			runAllPrerequisiteChecks: () =>
				TE.right([
					{
						check: "claude-installed",
						passed: true,
						message: "Claude Code found",
					},
				]),
		}));
		mock.module("../../../install/claudecode/installer.js", () => ({
			installAllPlugins,
		}));
		const { executeClaudeCodeInstall } = await importCommand();
		const { logger, messages } = createLogger();

		await expectTaskRight(
			executeClaudeCodeInstall(["--scope", "local"], logger, {
				isTTY: false,
				skipPrompt: true,
			}),
		);

		expect(installAllPlugins.mock.calls[0]).toEqual([
			"local",
			logger,
			false,
			false,
		]);
		expect(messages.join("\n")).toContain("Installed plugins:");
		expect(messages.join("\n")).toContain("  - rp1-base");
		expect(messages.join("\n")).toContain(
			"Restart Claude Code to load updated plugins.",
		);
	});
});
