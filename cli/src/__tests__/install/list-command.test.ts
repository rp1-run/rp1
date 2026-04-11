/**
 * Unit tests for executeList with --json flag.
 * Verifies JSON output schema/content and that table output is unaffected.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { createLogger } from "../../../shared/logger.js";
import { executeList } from "../../install/command.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	withEnvOverride,
	writeFixture,
} from "../helpers/index.js";

const logger = createLogger({ level: "error", color: false });

const mockSkills = [
	{
		plugin: "dev",
		name: "build",
		canonical_name: "dev:build",
		user_facing_name: "rp1-dev:build",
		installed_platforms: ["codex"],
		invocations: { codex: "$rp1-build" },
		description: "End-to-end feature workflow",
	},
	{
		plugin: "dev",
		name: "pr-review",
		canonical_name: "dev:pr-review",
		user_facing_name: "rp1-dev:pr-review",
		installed_platforms: ["codex"],
		invocations: { codex: "$rp1-pr-review" },
		description: "PR review with CI support",
	},
];

const skillContent = (
	description: string,
	plugin: string,
	name: string,
): string => `---
description: "${description}"
metadata:
  rp1:
    plugin: "${plugin}"
    name: "${name}"
---
`;

const projectSkillContent = (
	name: string,
	description: string,
	category: string,
	isWorkflow: boolean,
	args: readonly string[] = [],
	runPolicy?: "fresh" | "resumable",
	identityArgs?: readonly string[],
): string => {
	const argumentBlock =
		args.length === 0
			? ""
			: `\n  arguments:\n${args
					.map(
						(arg) =>
							`    - name: ${arg}\n      type: string\n      required: false\n      description: "${arg} argument"`,
					)
					.join("\n")}`;

	const workflowBlock = runPolicy
		? `\n  workflow:\n    run_policy: ${runPolicy}${
				identityArgs
					? `\n    identity_args:\n${identityArgs.map((arg) => `      - ${arg}`).join("\n")}`
					: runPolicy === "fresh"
						? "\n    identity_args: []"
						: ""
			}`
		: "";

	return `---
name: "${name}"
description: "${description}"
metadata:
  category: ${category}
  is_workflow: ${isWorkflow}${workflowBlock}${argumentBlock}
---

# ${name}

Skill body.
`;
};

describe("executeList", () => {
	let consoleLogs: string[];
	let originalLog: typeof console.log;
	let tempDir: string;
	let originalCwd: string;
	let restoreHome: (() => void) | undefined;

	beforeEach(async () => {
		consoleLogs = [];
		originalLog = console.log;
		console.log = (...args: unknown[]) => {
			consoleLogs.push(args.map(String).join(" "));
		};

		tempDir = await createTempDir("list-command-test");
		originalCwd = process.cwd();
		process.chdir(tempDir);
		restoreHome = withEnvOverride("HOME", tempDir);
		await writeFixture(tempDir, join(".rp1", "project_id"), "test-project-id");
	});

	afterEach(async () => {
		console.log = originalLog;
		process.chdir(originalCwd);
		restoreHome?.();
		await cleanupTempDir(tempDir);
	});

	describe("--json output", () => {
		test("outputs valid JSON array with canonical identity and host invocations", async () => {
			await writeFixture(
				tempDir,
				join("plugins", "dev", "skills", "build", "SKILL.md"),
				projectSkillContent(
					"build",
					"End-to-end feature workflow",
					"development",
					true,
					["FEATURE_ID", "AFK"],
					"resumable",
					["FEATURE_ID"],
				),
			);
			await writeFixture(
				tempDir,
				join("plugins", "dev", "skills", "pr-review", "SKILL.md"),
				projectSkillContent(
					"pr-review",
					"PR review with CI support",
					"review",
					true,
					["PR_NUMBER"],
					"fresh",
					[],
				),
			);
			await writeFixture(
				tempDir,
				join(".codex", "skills", "rp1-build", "SKILL.md"),
				skillContent(
					mockSkills[0]?.description ?? "No description",
					mockSkills[0]?.plugin ?? "unknown",
					mockSkills[0]?.name ?? "unknown",
				),
			);
			await writeFixture(
				tempDir,
				join(".codex", "skills", "rp1-pr-review", "SKILL.md"),
				skillContent(
					mockSkills[1]?.description ?? "No description",
					mockSkills[1]?.plugin ?? "unknown",
					mockSkills[1]?.name ?? "unknown",
				),
			);

			await expectTaskRight(executeList([], logger, { json: true }));

			expect(consoleLogs).toHaveLength(1);
			const parsed = JSON.parse(consoleLogs[0]);
			expect(Array.isArray(parsed)).toBe(true);
			expect(parsed).toHaveLength(2);

			for (const skill of parsed) {
				expect(skill).toHaveProperty("name");
				expect(skill).toHaveProperty("description");
				expect(skill).toHaveProperty("plugin");
				expect(skill).toHaveProperty("canonical_name");
				expect(skill).toHaveProperty("user_facing_name");
				expect(skill).toHaveProperty("category");
				expect(skill).toHaveProperty("is_workflow");
				expect(skill).toHaveProperty("key_args");
				expect(skill).toHaveProperty("run_policy");
				expect(skill).toHaveProperty("identity_args");
				expect(skill).toHaveProperty("installed_platforms");
				expect(skill).toHaveProperty("invocations");
				expect(typeof skill.name).toBe("string");
				expect(typeof skill.description).toBe("string");
				expect(typeof skill.plugin).toBe("string");
				expect(typeof skill.canonical_name).toBe("string");
				expect(typeof skill.user_facing_name).toBe("string");
				expect(typeof skill.category).toBe("string");
				expect(typeof skill.is_workflow).toBe("boolean");
				expect(typeof skill.run_policy).toBe("string");
				expect(Array.isArray(skill.key_args)).toBe(true);
				expect(Array.isArray(skill.identity_args)).toBe(true);
				expect(Array.isArray(skill.installed_platforms)).toBe(true);
				expect(typeof skill.invocations).toBe("object");
			}

			expect(parsed[0].name).toBe("build");
			expect(parsed[0].description).toBe("End-to-end feature workflow");
			expect(parsed[0].plugin).toBe("dev");
			expect(parsed[0].canonical_name).toBe("dev:build");
			expect(parsed[0].user_facing_name).toBe("rp1-dev:build");
			expect(parsed[0].category).toBe("development");
			expect(parsed[0].is_workflow).toBe(true);
			expect(parsed[0].key_args).toEqual(["FEATURE_ID", "AFK"]);
			expect(parsed[0].run_policy).toBe("resumable");
			expect(parsed[0].identity_args).toEqual(["FEATURE_ID"]);
			expect(parsed[0].installed_platforms).toEqual(["codex"]);
			expect(parsed[0].invocations.codex).toBe("$rp1-build");
			expect(parsed[1].name).toBe("pr-review");
			expect(parsed[1].category).toBe("review");
			expect(parsed[1].is_workflow).toBe(true);
			expect(parsed[1].key_args).toEqual(["PR_NUMBER"]);
			expect(parsed[1].run_policy).toBe("fresh");
			expect(parsed[1].identity_args).toEqual([]);
		});

		test("does not include table header or formatting in JSON mode", async () => {
			await writeFixture(
				tempDir,
				join("plugins", "dev", "skills", "build", "SKILL.md"),
				projectSkillContent(
					"build",
					"End-to-end feature workflow",
					"development",
					true,
					["FEATURE_ID", "AFK"],
					"resumable",
					["FEATURE_ID"],
				),
			);
			await writeFixture(
				tempDir,
				join(".codex", "skills", "rp1-build", "SKILL.md"),
				skillContent(
					mockSkills[0]?.description ?? "No description",
					mockSkills[0]?.plugin ?? "unknown",
					mockSkills[0]?.name ?? "unknown",
				),
			);

			await expectTaskRight(executeList([], logger, { json: true }));

			expect(consoleLogs).toHaveLength(1);
			expect(consoleLogs[0]).toStartWith("[");
			expect(consoleLogs[0]).toEndWith("]");
		});
	});

	describe("table output (default)", () => {
		test("renders table with skills when json flag is not set", async () => {
			await writeFixture(
				tempDir,
				join("plugins", "dev", "skills", "build", "SKILL.md"),
				projectSkillContent(
					"build",
					"End-to-end feature workflow",
					"development",
					true,
					["FEATURE_ID", "AFK"],
					"resumable",
					["FEATURE_ID"],
				),
			);
			await writeFixture(
				tempDir,
				join(".codex", "skills", "rp1-build", "SKILL.md"),
				skillContent(
					mockSkills[0]?.description ?? "No description",
					mockSkills[0]?.plugin ?? "unknown",
					mockSkills[0]?.name ?? "unknown",
				),
			);

			await expectTaskRight(executeList([], logger));

			const output = consoleLogs.join("\n");
			expect(output).toContain("Skill");
			expect(output).toContain("Description");
			expect(output).toContain("rp1-dev:build");
			expect(output).toContain("End-to-end feature workflow");
			expect(output).toContain("Total: 1 skills");
		});

		test("table output is unchanged when json option is explicitly false", async () => {
			await writeFixture(
				tempDir,
				join("plugins", "dev", "skills", "build", "SKILL.md"),
				projectSkillContent(
					"build",
					"End-to-end feature workflow",
					"development",
					true,
					["FEATURE_ID", "AFK"],
				),
			);
			await writeFixture(
				tempDir,
				join(".codex", "skills", "rp1-build", "SKILL.md"),
				skillContent(
					mockSkills[0]?.description ?? "No description",
					mockSkills[0]?.plugin ?? "unknown",
					mockSkills[0]?.name ?? "unknown",
				),
			);

			await expectTaskRight(executeList([], logger, { json: false }));

			const output = consoleLogs.join("\n");
			expect(output).toContain("┌");
			expect(output).toContain("rp1-dev:build");
			expect(output).toContain("Total: 1 skills");
		});
	});

	test("--json outputs empty array when no skills installed", async () => {
		await expectTaskRight(executeList([], logger, { json: true }));

		expect(consoleLogs).toHaveLength(1);
		const parsed = JSON.parse(consoleLogs[0]);
		expect(Array.isArray(parsed)).toBe(true);
		expect(parsed).toHaveLength(0);
	});
});
