/**
 * Unit tests for Claude Code command module.
 * Tests argument parsing and configuration creation.
 */

import { describe, expect, test } from "bun:test";
import {
	defaultClaudeCodeInstallOptions,
	parseClaudeCodeInstallArgs,
} from "../../../install/claudecode/command.js";

describe("claudecode/command", () => {
	describe("parseClaudeCodeInstallArgs", () => {
		test("returns defaults for empty args", () => {
			const result = parseClaudeCodeInstallArgs([]);

			expect(result.dryRun).toBe(false);
			expect(result.yes).toBe(false);
			expect(result.scope).toBe("user");
			expect(result.showHelp).toBe(false);
		});

		test("parses --dry-run flag", () => {
			const result = parseClaudeCodeInstallArgs(["--dry-run"]);

			expect(result.dryRun).toBe(true);
			expect(result.yes).toBe(false);
			expect(result.scope).toBe("user");
		});

		test("parses -y short flag for yes", () => {
			const result = parseClaudeCodeInstallArgs(["-y"]);

			expect(result.yes).toBe(true);
			expect(result.dryRun).toBe(false);
		});

		test("parses --yes long flag", () => {
			const result = parseClaudeCodeInstallArgs(["--yes"]);

			expect(result.yes).toBe(true);
		});

		test("parses -s short flag for scope", () => {
			const result = parseClaudeCodeInstallArgs(["-s", "project"]);

			expect(result.scope).toBe("project");
		});

		test("parses --scope long flag", () => {
			const result = parseClaudeCodeInstallArgs(["--scope", "local"]);

			expect(result.scope).toBe("local");
		});

		test("parses -h short flag for help", () => {
			const result = parseClaudeCodeInstallArgs(["-h"]);

			expect(result.showHelp).toBe(true);
		});

		test("parses --help long flag", () => {
			const result = parseClaudeCodeInstallArgs(["--help"]);

			expect(result.showHelp).toBe(true);
		});

		test("parses multiple flags together", () => {
			const result = parseClaudeCodeInstallArgs([
				"--dry-run",
				"-y",
				"--scope",
				"project",
			]);

			expect(result.dryRun).toBe(true);
			expect(result.yes).toBe(true);
			expect(result.scope).toBe("project");
			expect(result.showHelp).toBe(false);
		});

		test("handles scope values: user, project, local", () => {
			const scopes = ["user", "project", "local"] as const;

			for (const scope of scopes) {
				const result = parseClaudeCodeInstallArgs(["--scope", scope]);
				expect(result.scope).toBe(scope);
			}
		});

		test("ignores invalid scope values and keeps default", () => {
			const result = parseClaudeCodeInstallArgs(["--scope", "invalid"]);

			expect(result.scope).toBe("user");
		});

		test("handles flag order independence", () => {
			const args1 = parseClaudeCodeInstallArgs(["--dry-run", "-y"]);
			const args2 = parseClaudeCodeInstallArgs(["-y", "--dry-run"]);

			expect(args1.dryRun).toBe(args2.dryRun);
			expect(args1.yes).toBe(args2.yes);
		});

		test("ignores unknown arguments", () => {
			const result = parseClaudeCodeInstallArgs([
				"--unknown",
				"value",
				"--dry-run",
			]);

			expect(result.dryRun).toBe(true);
			expect(result.yes).toBe(false);
			expect(result.scope).toBe("user");
		});

		test("handles repeated flags (last wins for scope)", () => {
			const result = parseClaudeCodeInstallArgs([
				"--scope",
				"user",
				"--scope",
				"project",
			]);

			expect(result.scope).toBe("project");
		});

		test("handles missing scope value after flag", () => {
			const result = parseClaudeCodeInstallArgs(["--scope"]);

			// Should keep default since no valid value follows
			expect(result.scope).toBe("user");
		});
	});

	describe("defaultClaudeCodeInstallOptions", () => {
		test("has expected default values", () => {
			expect(defaultClaudeCodeInstallOptions.isTTY).toBe(false);
			expect(defaultClaudeCodeInstallOptions.skipPrompt).toBe(false);
		});
	});
});
