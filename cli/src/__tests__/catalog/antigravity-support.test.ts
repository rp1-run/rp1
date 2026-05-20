import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	buildAntigravityWorkflowSupportMatrix,
	type CatalogRegistryEntry,
	collectAntigravityWorkflowSupportMatrix,
} from "../../catalog/index.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const UPDATED_AT = "2026-05-20";

const catalogEntry = (
	overrides: Partial<CatalogRegistryEntry> & {
		readonly canonicalName: string;
		readonly name: string;
	},
): CatalogRegistryEntry => {
	const plugin = overrides.plugin ?? "dev";

	return {
		canonicalName: overrides.canonicalName,
		userFacingName:
			overrides.userFacingName ?? `rp1-${plugin}:${overrides.name}`,
		name: overrides.name,
		plugin,
		description:
			overrides.description ?? "Catalog entry for Antigravity matrix coverage.",
		category: overrides.category ?? "development",
		isWorkflow: overrides.isWorkflow ?? true,
		arcadeTracked: overrides.arcadeTracked,
		keyArgs: overrides.keyArgs ?? ["FEATURE_ID"],
		runPolicy: overrides.runPolicy,
		identityArgs: overrides.identityArgs,
		argumentDefs: overrides.argumentDefs ?? [
			{
				name: "FEATURE_ID",
				type: "string",
				required: false,
				description: "Feature identifier",
			},
		],
		subAgents: overrides.subAgents,
		distributionScope: overrides.distributionScope ?? "distributable",
		userInvocable: overrides.userInvocable ?? true,
		sourcePath:
			overrides.sourcePath ??
			`plugins/${plugin}/skills/${overrides.name}/SKILL.md`,
	};
};

const skillFrontmatter = (
	name: string,
	description: string,
	isWorkflow: boolean,
	subAgents: readonly string[] = [],
	userInvocable?: boolean,
) => `---
name: ${name}
description: "${description}"
allowed-tools: Bash(echo *)
metadata:
  category: development
  is_workflow: ${isWorkflow}
${userInvocable !== undefined ? `  user_invocable: ${userInvocable}\n` : ""}${subAgents.length > 0 ? `  sub_agents:\n${subAgents.map((agent) => `    - ${agent}`).join("\n")}\n` : ""}${isWorkflow ? "  workflow:\n    run_policy: fresh\n    identity_args: []\n" : ""}  version: 1.0.0
  created: 2026-01-01
  author: test
  arguments:
    - name: FEATURE_ID
      type: string
      required: false
      description: "Feature identifier"
---

# ${name}

Skill content here.
`;

const writeSkill = async (
	projectRoot: string,
	plugin: "base" | "dev" | "utils",
	name: string,
	content: string,
) => {
	const skillDir = join(projectRoot, "plugins", plugin, "skills", name);
	await mkdir(skillDir, { recursive: true });
	await writeFile(join(skillDir, "SKILL.md"), content);
};

describe("Antigravity workflow support matrix", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-support-matrix");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("classifies distributable workflows and ties delegated rows to dynamic session subagents", () => {
		const matrix = buildAntigravityWorkflowSupportMatrix(
			[
				catalogEntry({
					canonicalName: "dev:build-fast",
					name: "build-fast",
					runPolicy: "fresh",
					subAgents: ["task-builder", "task-reviewer"],
				}),
				catalogEntry({
					canonicalName: "base:markdown-preview",
					name: "markdown-preview",
					plugin: "base",
				}),
				catalogEntry({
					canonicalName: "utils:tester",
					name: "tester",
					plugin: "utils",
					distributionScope: "internal",
				}),
				catalogEntry({
					canonicalName: "base:template-reference",
					name: "template-reference",
					plugin: "base",
					userInvocable: false,
				}),
				catalogEntry({
					canonicalName: "base:guide",
					name: "guide",
					plugin: "base",
					isWorkflow: false,
				}),
				catalogEntry({
					canonicalName: "dev:gemini-harness-smoke",
					name: "gemini-harness-smoke",
				}),
			],
			{ updatedAt: UPDATED_AT },
		);

		expect(matrix.updatedAt).toBe(UPDATED_AT);
		expect(matrix.entries).toHaveLength(2);
		expect(matrix.entries[0]).toMatchObject({
			workflowId: "dev:build-fast",
			status: "limited",
			workflowClass: "development_workflow",
			exceptionOwner: "rp1 product",
			updatedAt: UPDATED_AT,
			runPolicy: "fresh",
			argumentNames: ["FEATURE_ID"],
			delegation: {
				mode: "dynamic_session_subagents",
				requiredSubAgents: ["task-builder", "task-reviewer"],
				runtimeContract: "define_once_invoke_many",
				staticAgentsDiscovery: "not_used",
			},
		});
		expect(matrix.entries[0]?.supportRationale).toContain(
			"define each required rp1-derived type once",
		);
		expect(matrix.entries[0]?.limitation).toContain("define_subagent");
		expect(matrix.entries[0]?.limitation).toContain("invoke_subagent");
		expect(matrix.entries[0]?.limitation).toContain(
			"static `/agents` discovery is not support evidence",
		);
		expect(matrix.entries[0]?.userAction).toContain("rp1 install antigravity");

		expect(matrix.entries[1]).toMatchObject({
			workflowId: "base:markdown-preview",
			status: "supported",
			delegation: {
				mode: "none",
				requiredSubAgents: [],
				runtimeContract: null,
				staticAgentsDiscovery: "not_used",
			},
			exceptionOwner: null,
			limitation: null,
		});

		expect(
			matrix.excludedEntries.map((entry) => ({
				workflowId: entry.workflowId,
				reason: entry.reason,
			})),
		).toEqual([
			{ workflowId: "utils:tester", reason: "internal_only" },
			{ workflowId: "base:template-reference", reason: "template_only" },
			{ workflowId: "base:guide", reason: "not_workflow" },
			{ workflowId: "dev:gemini-harness-smoke", reason: "validation_only" },
		]);
	});

	test("collects subagent metadata through the existing catalog registry", async () => {
		await writeSkill(
			tempDir,
			"dev",
			"build-fast",
			skillFrontmatter(
				"build-fast",
				"Build-fast workflow for Antigravity matrix coverage.",
				true,
				["task-builder", "task-reviewer"],
			),
		);
		await writeSkill(
			tempDir,
			"base",
			"markdown-preview",
			skillFrontmatter(
				"markdown-preview",
				"Markdown preview workflow without delegated work.",
				true,
			),
		);
		await writeSkill(
			tempDir,
			"base",
			"template-reference",
			skillFrontmatter(
				"template-reference",
				"Template-only reference skill excluded from workflow claims.",
				true,
				[],
				false,
			),
		);

		const { matrix, errors } = await collectAntigravityWorkflowSupportMatrix(
			tempDir,
			{ updatedAt: UPDATED_AT },
		);

		expect(errors).toEqual([]);
		expect(
			matrix.entries.map((entry) => ({
				workflowId: entry.workflowId,
				status: entry.status,
				delegationMode: entry.delegation.mode,
			})),
		).toEqual([
			{
				workflowId: "base:markdown-preview",
				status: "supported",
				delegationMode: "none",
			},
			{
				workflowId: "dev:build-fast",
				status: "limited",
				delegationMode: "dynamic_session_subagents",
			},
		]);
		expect(matrix.excludedEntries).toMatchObject([
			{ workflowId: "base:template-reference", reason: "template_only" },
		]);
	});
});
