import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	buildCatalogLookup,
	collectCatalogRegistry,
	collectScopedCatalogRegistry,
	filterCatalogEntriesByScope,
	findCatalogEntryByCanonicalName,
	getCatalogDistributionScope,
	getCatalogPluginsForScope,
	renderCatalogMarkdown,
	renderInitSkillAwarenessBlock,
	selectCatalogEntriesByCanonicalNames,
} from "../../catalog/index.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const SKILL_FRONTMATTER = (
	name: string,
	description: string,
	category: string,
	isWorkflow: boolean,
	arcadeTracked?: boolean,
	args: readonly string[] = [],
	runPolicy?: "fresh" | "resumable",
	identityArgs?: readonly string[],
) => {
	const workflowBlock = runPolicy
		? `  workflow:\n    run_policy: ${runPolicy}\n${
				identityArgs
					? `    identity_args:\n${identityArgs.map((arg) => `      - ${arg}`).join("\n")}\n`
					: runPolicy === "fresh"
						? "    identity_args: []\n"
						: ""
			}`
		: "";
	const argumentBlock =
		args.length > 0
			? `  arguments:\n${args
					.map(
						(arg) =>
							`    - name: ${arg}\n      type: string\n      required: false\n      description: "${arg} argument"`,
					)
					.join("\n")}\n`
			: "";

	return `---
name: ${name}
description: "${description}"
allowed-tools: Bash(echo *)
metadata:
  category: ${category}
  is_workflow: ${isWorkflow}
${arcadeTracked !== undefined ? `  arcade_tracked: ${arcadeTracked}\n` : ""}${workflowBlock}  version: 1.0.0
  created: 2026-01-01
  author: test
${argumentBlock}---

# ${name}

Skill content here.
`;
};

describe("catalog registry", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("catalog-registry");

		await mkdir(join(tempDir, "plugins", "base", "skills", "guide"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "base", "skills", "alpha"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "dev", "skills", "build"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "utils", "skills", "tersify-prompt"), {
			recursive: true,
		});

		await writeFile(
			join(tempDir, "plugins", "base", "skills", "alpha", "SKILL.md"),
			SKILL_FRONTMATTER(
				"alpha",
				"Alpha skill for knowledge management coverage.",
				"knowledge",
				false,
				undefined,
				["TOPIC"],
			),
		);
		await writeFile(
			join(tempDir, "plugins", "dev", "skills", "build", "SKILL.md"),
			SKILL_FRONTMATTER(
				"build",
				"Build workflow for development feature delivery.",
				"development",
				true,
				false,
				["FEATURE_ID", "AFK"],
				"resumable",
				["FEATURE_ID"],
			),
		);
		await writeFile(
			join(tempDir, "plugins", "utils", "skills", "tersify-prompt", "SKILL.md"),
			SKILL_FRONTMATTER(
				"tersify-prompt",
				"Tersify prompt skill for prompt editing coverage.",
				"prompt",
				false,
				undefined,
				["PROMPT"],
			),
		);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("collects registry entries with canonical identity and discovery metadata", async () => {
		const { entries, errors } = await collectCatalogRegistry(tempDir);

		expect(errors).toEqual([]);
		expect(entries).toHaveLength(3);

		const buildSkill = entries.find(
			(entry) => entry.canonicalName === "dev:build",
		);
		expect(buildSkill).toBeDefined();
		expect(buildSkill?.userFacingName).toBe("rp1-dev:build");
		expect(buildSkill?.plugin).toBe("dev");
		expect(buildSkill?.category).toBe("development");
		expect(buildSkill?.isWorkflow).toBe(true);
		expect(buildSkill?.arcadeTracked).toBe(false);
		expect(buildSkill?.keyArgs).toEqual(["FEATURE_ID", "AFK"]);
		expect(buildSkill?.runPolicy).toBe("resumable");
		expect(buildSkill?.identityArgs).toEqual(["FEATURE_ID"]);
		expect(buildSkill?.argumentDefs.map((argument) => argument.name)).toEqual([
			"FEATURE_ID",
			"AFK",
		]);
		expect(buildSkill?.distributionScope).toBe("distributable");
		expect(buildSkill?.sourcePath).toBe(
			join(tempDir, "plugins", "dev", "skills", "build", "SKILL.md"),
		);

		const utilsSkill = entries.find(
			(entry) => entry.canonicalName === "utils:tersify-prompt",
		);
		expect(utilsSkill?.distributionScope).toBe("internal");
	});

	test("applies scope policy consistently for distributable and all views", async () => {
		const { entries } = await collectCatalogRegistry(tempDir);
		const distributableEntries = filterCatalogEntriesByScope(
			entries,
			"distributable",
		);
		const scopedResult = await collectScopedCatalogRegistry(
			tempDir,
			"distributable",
		);

		expect(getCatalogPluginsForScope("distributable")).toEqual(["base", "dev"]);
		expect(getCatalogDistributionScope("base")).toBe("distributable");
		expect(getCatalogDistributionScope("utils")).toBe("internal");
		expect(distributableEntries.map((entry) => entry.canonicalName)).toEqual([
			"dev:build",
			"base:alpha",
		]);
		expect(scopedResult.entries.map((entry) => entry.canonicalName)).toEqual(
			distributableEntries.map((entry) => entry.canonicalName),
		);
	});

	test("supports runtime lookups and installed-subset selection by canonical name", async () => {
		const { entries } = await collectCatalogRegistry(tempDir);
		const lookup = buildCatalogLookup(entries);
		const buildSkill = findCatalogEntryByCanonicalName(entries, "dev:build");
		const subset = selectCatalogEntriesByCanonicalNames(entries, [
			"utils:tersify-prompt",
			"dev:build",
			"dev:build",
			"missing:skill",
		]);

		expect(lookup.get("base:alpha")?.userFacingName).toBe("rp1-base:alpha");
		expect(buildSkill?.canonicalName).toBe("dev:build");
		expect(subset.map((entry) => entry.canonicalName)).toEqual([
			"dev:build",
			"utils:tersify-prompt",
		]);
	});

	test("renders scoped markdown from registry-backed entries", async () => {
		const { entries } = await collectCatalogRegistry(tempDir);
		const renderedCatalog = renderCatalogMarkdown(
			filterCatalogEntriesByScope(entries, "distributable"),
		);

		expect(renderedCatalog).toContain("# rp1 Skill Catalog");
		expect(renderedCatalog).toContain("## Development");
		expect(renderedCatalog).toContain("## Knowledge");
		expect(renderedCatalog).toContain("| Run Policy | Identity Args |");
		expect(renderedCatalog).toContain("| `/build` | dev |");
		expect(renderedCatalog).toContain("| resumable | `FEATURE_ID` |");
		expect(renderedCatalog).toContain("| `/build` | dev |");
		expect(renderedCatalog).toContain("| `/alpha` | base |");
		expect(renderedCatalog).not.toContain("tersify-prompt");
	});

	test("renders init skill awareness block from distributable registry entries", async () => {
		const { entries } = await collectCatalogRegistry(tempDir);
		const renderedBlock = renderInitSkillAwarenessBlock(
			filterCatalogEntriesByScope(entries, "distributable"),
		);

		expect(renderedBlock).toContain("### Skill Categories");
		expect(renderedBlock).toContain("| Development | /build |");
		expect(renderedBlock).toContain("| Knowledge | /alpha |");
		expect(renderedBlock).not.toContain("tersify-prompt");
	});

	test("reports missing discovery metadata instead of silently omitting skills", async () => {
		const brokenSkillDir = join(
			tempDir,
			"plugins",
			"dev",
			"skills",
			"broken-discovery",
		);
		await mkdir(brokenSkillDir, { recursive: true });
		await writeFile(
			join(brokenSkillDir, "SKILL.md"),
			`---
name: broken-discovery
description: "Broken skill that is missing required discovery metadata."
allowed-tools: Bash(echo *)
metadata:
  version: 1.0.0
  created: 2026-01-01
  author: test
---

# broken-discovery

Skill content here.
`,
		);

		const { entries, errors } = await collectCatalogRegistry(tempDir);

		expect(entries.map((entry) => entry.canonicalName)).not.toContain(
			"dev:broken-discovery",
		);
		expect(errors).toContain(
			`Invalid discovery metadata in ${join(brokenSkillDir, "SKILL.md")}: missing or invalid metadata.category, metadata.is_workflow`,
		);
	});
});
