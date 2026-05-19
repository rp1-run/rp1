import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	buildGeminiWorkflowSupportMatrix,
	type CatalogRegistryEntry,
	collectGeminiWorkflowSupportMatrix,
} from "../../catalog/index.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const UPDATED_AT = "2026-05-19";

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
			overrides.description ?? "Catalog entry for Gemini matrix coverage.",
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
	userInvocable?: boolean,
) => `---
name: ${name}
description: "${description}"
allowed-tools: Bash(echo *)
metadata:
  category: development
  is_workflow: ${isWorkflow}
${userInvocable !== undefined ? `  user_invocable: ${userInvocable}\n` : ""}${isWorkflow ? "  workflow:\n    run_policy: fresh\n    identity_args: []\n" : ""}  version: 1.0.0
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

describe("Gemini workflow support matrix", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("gemini-support-matrix");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("builds support rows from distributable user workflows and records exclusions", () => {
		const matrix = buildGeminiWorkflowSupportMatrix(
			[
				catalogEntry({
					canonicalName: "dev:build",
					name: "build",
					runPolicy: "resumable",
					identityArgs: ["FEATURE_ID"],
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
		expect(matrix.entries).toHaveLength(1);
		expect(matrix.entries[0]).toMatchObject({
			workflowId: "dev:build",
			name: "build",
			userFacingName: "rp1-dev:build",
			status: "supported",
			workflowClass: "development_workflow",
			exceptionOwner: null,
			updatedAt: UPDATED_AT,
			runPolicy: "resumable",
			identityArgs: ["FEATURE_ID"],
			argumentNames: ["FEATURE_ID"],
		});
		expect(matrix.entries[0]?.evidenceSource).toContain(
			"Gemini CLI extension assets",
		);
		expect(matrix.entries[0]?.unsupportedRationale).toBeNull();
		expect(matrix.entries[0]?.userAction).toContain("rp1 install gemini");

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

	test("collects matrix input through the existing catalog registry", async () => {
		await writeSkill(
			tempDir,
			"dev",
			"build",
			skillFrontmatter(
				"build",
				"Build workflow for Gemini support matrix coverage.",
				true,
			),
		);
		await writeSkill(
			tempDir,
			"dev",
			"gemini-harness-boundaries",
			skillFrontmatter(
				"gemini-harness-boundaries",
				"Experimental Gemini boundary evidence workflow.",
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
				false,
			),
		);

		const { matrix, errors } = await collectGeminiWorkflowSupportMatrix(
			tempDir,
			{ updatedAt: UPDATED_AT },
		);

		expect(errors).toEqual([]);
		expect(matrix.entries.map((entry) => entry.workflowId)).toEqual([
			"dev:build",
		]);
		expect(
			matrix.excludedEntries.map((entry) => ({
				workflowId: entry.workflowId,
				reason: entry.reason,
			})),
		).toEqual([
			{ workflowId: "base:template-reference", reason: "template_only" },
			{
				workflowId: "dev:gemini-harness-boundaries",
				reason: "validation_only",
			},
		]);
	});
});
