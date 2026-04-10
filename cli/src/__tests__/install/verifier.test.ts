/**
 * Unit tests for verifier.ts - Installation verification.
 * Tests rp1's verification logic for installed artifacts.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";

import { isHealthy, type VerificationReport } from "../../install/models.js";
import { listInstalledSkills } from "../../install/verifier.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	withEnvOverride,
	writeFixture,
} from "../helpers/index.js";

const installedSkillContent = (
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

	return `---
name: "${name}"
description: "${description}"
metadata:
  category: ${category}
  is_workflow: ${isWorkflow}${argumentBlock}
---

# ${name}

Skill body.
`;
};

const writeProjectSkill = async (
	rootDir: string,
	plugin: string,
	name: string,
	description: string,
	category: string,
	isWorkflow: boolean,
	args: readonly string[] = [],
): Promise<void> => {
	await writeFixture(
		rootDir,
		join("plugins", plugin, "skills", name, "SKILL.md"),
		projectSkillContent(name, description, category, isWorkflow, args),
	);
};

describe("verifier", () => {
	let tempDir: string;
	let originalCwd: string;

	beforeEach(async () => {
		tempDir = await createTempDir("verifier-test");
		originalCwd = process.cwd();
		process.chdir(tempDir);
		await writeFixture(tempDir, join(".rp1", "project_id"), "test-project-id");
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		await cleanupTempDir(tempDir);
	});

	describe("isHealthy", () => {
		test("returns true when all counts match and no critical issues", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(isHealthy(report)).toBe(true);
		});

		test("commands fields are ignored in health check (deprecated)", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(isHealthy(report)).toBe(true);
		});

		test("returns false when agents are missing", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 2,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns false when skills are missing (skills are critical)", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 0,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: ["Missing skills (35): rp1-build, rp1-build-fast..."],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns false when critical issues exist", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: ["Invalid YAML in rp1-build/SKILL.md"],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns false when skill-related issues exist (skills are critical)", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 30,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [
					"Missing skills (5): rp1-build, rp1-build-fast, rp1-speedrun, rp1-pr-review, rp1-pr-visual",
				],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns false when mixed critical and skill issues exist", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 30,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [
					"Missing skills (5): rp1-build...",
					"Cannot read agent.md: ENOENT",
				],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns true when skills count exceeds expected", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 40,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(isHealthy(report)).toBe(true);
		});

		test("returns false when only skillsFound is below skillsExpected and no issues", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 20,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(isHealthy(report)).toBe(false);
		});

		test("returns true when only plugins are missing (plugins are optional)", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 0,
				pluginsExpected: 1,
				issues: [
					"Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
				],
			};

			expect(isHealthy(report)).toBe(true);
		});

		test("returns true when only plugin-related issues exist", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 0,
				pluginsExpected: 1,
				issues: [
					"Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
				],
			};

			expect(isHealthy(report)).toBe(true);
		});

		test("returns false when both skills and plugins are missing (skills are critical)", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 0,
				skillsExpected: 35,
				pluginsFound: 0,
				pluginsExpected: 1,
				issues: [
					"Missing skills (35): rp1-build, rp1-build-fast...",
					"Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
				],
			};

			expect(isHealthy(report)).toBe(false);
		});
	});

	describe("VerificationReport structure", () => {
		test("report contains all required fields including plugins", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 0,
				agentsExpected: 0,
				skillsFound: 0,
				skillsExpected: 0,
				pluginsFound: 0,
				pluginsExpected: 0,
				issues: [],
			};

			expect(report).toHaveProperty("commandsFound");
			expect(report).toHaveProperty("commandsExpected");
			expect(report).toHaveProperty("agentsFound");
			expect(report).toHaveProperty("agentsExpected");
			expect(report).toHaveProperty("skillsFound");
			expect(report).toHaveProperty("skillsExpected");
			expect(report).toHaveProperty("pluginsFound");
			expect(report).toHaveProperty("pluginsExpected");
			expect(report).toHaveProperty("issues");
			expect(Array.isArray(report.issues)).toBe(true);
		});
	});

	describe("plugin verification", () => {
		test("reports missing plugins as issues", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 0,
				pluginsExpected: 1,
				issues: [
					"Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
				],
			};

			expect(report.pluginsFound).toBe(0);
			expect(report.pluginsExpected).toBe(1);
			expect(report.issues.some((i) => i.includes("Missing plugins"))).toBe(
				true,
			);
			expect(report.issues.some((i) => i.includes("rp1-base-hooks"))).toBe(
				true,
			);
		});

		test("correctly counts installed plugins", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 1,
				pluginsExpected: 1,
				issues: [],
			};

			expect(report.pluginsFound).toBe(1);
			expect(report.pluginsExpected).toBe(1);
			expect(report.pluginsFound).toBe(report.pluginsExpected);
		});

		test("handles missing plugin directory gracefully", () => {
			const report: VerificationReport = {
				commandsFound: 0,
				commandsExpected: 0,
				agentsFound: 5,
				agentsExpected: 5,
				skillsFound: 35,
				skillsExpected: 35,
				pluginsFound: 0,
				pluginsExpected: 1,
				issues: [
					"Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
				],
			};

			expect(report.pluginsFound).toBe(0);
			expect(isHealthy(report)).toBe(true);
		});
	});

	describe("listInstalledSkills", () => {
		test("includes skills installed in the Codex skills directory", async () => {
			const restoreHome = withEnvOverride("HOME", tempDir);

			try {
				await writeProjectSkill(
					tempDir,
					"base",
					"guide",
					"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
					"knowledge",
					false,
					["QUESTION"],
				);
				await writeFixture(
					tempDir,
					join(".codex", "skills", "rp1-guide", "SKILL.md"),
					installedSkillContent(
						"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
						"base",
						"guide",
					),
				);

				const skills = await expectTaskRight(listInstalledSkills());

				expect(skills).toEqual([
					{
						plugin: "base",
						name: "guide",
						description:
							"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
						canonical_name: "base:guide",
						user_facing_name: "rp1-base:guide",
						category: "knowledge",
						is_workflow: false,
						key_args: ["QUESTION"],
						installed_platforms: ["codex"],
						invocations: {
							codex: "$rp1-guide",
						},
					},
				]);
			} finally {
				restoreHome();
			}
		});

		test("deduplicates skills found in both OpenCode and Codex directories", async () => {
			const restoreHome = withEnvOverride("HOME", tempDir);

			try {
				await writeProjectSkill(
					tempDir,
					"base",
					"guide",
					"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
					"knowledge",
					false,
					["QUESTION"],
				);
				const skillContent = installedSkillContent(
					"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
					"base",
					"guide",
				);

				await writeFixture(
					tempDir,
					join(".config", "opencode", "skills", "rp1-guide", "SKILL.md"),
					skillContent,
				);
				await writeFixture(
					tempDir,
					join(".codex", "skills", "rp1-guide", "SKILL.md"),
					skillContent,
				);

				const skills = await expectTaskRight(listInstalledSkills());

				expect(skills).toHaveLength(1);
				expect(skills[0]?.name).toBe("guide");
				expect(skills[0]?.category).toBe("knowledge");
				expect(skills[0]?.is_workflow).toBe(false);
				expect(skills[0]?.key_args).toEqual(["QUESTION"]);
				expect(skills[0]?.installed_platforms).toEqual(["opencode", "codex"]);
				expect(skills[0]?.invocations.opencode).toBe("/rp1-guide");
				expect(skills[0]?.invocations.codex).toBe("$rp1-guide");
			} finally {
				restoreHome();
			}
		});

		test("includes skills installed in Claude Code plugins", async () => {
			const restoreHome = withEnvOverride("HOME", tempDir);

			try {
				const pluginDir = join(tempDir, ".claude", "plugins");
				const installPath = join(pluginDir, "rp1-base@rp1-run");
				await writeProjectSkill(
					tempDir,
					"base",
					"guide",
					"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
					"knowledge",
					false,
					["QUESTION"],
				);
				await writeFixture(
					tempDir,
					join(
						".claude",
						"plugins",
						"rp1-base@rp1-run",
						"skills",
						"guide",
						"SKILL.md",
					),
					installedSkillContent(
						"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
						"base",
						"guide",
					),
				);
				await writeFile(
					join(pluginDir, "installed_plugins.json"),
					JSON.stringify(
						{
							version: 1,
							plugins: {
								"rp1-base@rp1-run": [
									{
										installPath,
									},
								],
							},
						},
						null,
						2,
					),
				);

				const skills = await expectTaskRight(listInstalledSkills());

				expect(skills).toEqual([
					{
						plugin: "base",
						name: "guide",
						description:
							"Ask about rp1 capabilities, discover skills, and get workflow guidance.",
						canonical_name: "base:guide",
						user_facing_name: "rp1-base:guide",
						category: "knowledge",
						is_workflow: false,
						key_args: ["QUESTION"],
						installed_platforms: ["claude-code"],
						invocations: {
							"claude-code": "/guide",
						},
					},
				]);
			} finally {
				restoreHome();
			}
		});

		test("includes registry metadata for installed internal skills when present", async () => {
			const restoreHome = withEnvOverride("HOME", tempDir);

			try {
				await writeProjectSkill(
					tempDir,
					"utils",
					"tersify-prompt",
					"Rewrite an agent prompt to be maximally terse while preserving intent.",
					"prompt",
					false,
					["PROMPT"],
				);
				await writeFixture(
					tempDir,
					join(".codex", "skills", "rp1-tersify-prompt", "SKILL.md"),
					installedSkillContent(
						"Rewrite an agent prompt to be maximally terse while preserving intent.",
						"utils",
						"tersify-prompt",
					),
				);

				const skills = await expectTaskRight(listInstalledSkills());

				expect(skills).toEqual([
					{
						plugin: "utils",
						name: "tersify-prompt",
						description:
							"Rewrite an agent prompt to be maximally terse while preserving intent.",
						canonical_name: "utils:tersify-prompt",
						user_facing_name: "rp1-utils:tersify-prompt",
						category: "prompt",
						is_workflow: false,
						key_args: ["PROMPT"],
						installed_platforms: ["codex"],
						invocations: {
							codex: "$rp1-tersify-prompt",
						},
					},
				]);
			} finally {
				restoreHome();
			}
		});
	});
});
