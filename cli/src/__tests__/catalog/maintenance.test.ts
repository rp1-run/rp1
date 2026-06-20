import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	AGENT_CATALOG_RELATIVE_PATH,
	checkCatalogArtifacts,
	GUIDE_CATALOG_RELATIVE_PATH,
	SKILL_CATALOG_RELATIVE_PATH,
	writeCatalogArtifacts,
} from "../../catalog/maintenance.js";
import {
	INIT_TEMPLATE_OUTPUT_RELATIVE_PATH,
	INIT_TEMPLATE_SOURCE_RELATIVE_PATH,
} from "../../init/templates/generator.js";
import { cleanupTempDir, createTempDir } from "../helpers/index.js";

const SKILL_FRONTMATTER = (
	name: string,
	description: string,
	category: string,
	isWorkflow: boolean,
) => `---
name: ${name}
description: "${description}"
allowed-tools: Bash(echo *)
metadata:
  category: ${category}
  is_workflow: ${isWorkflow}
  version: 1.0.0
  created: 2026-01-01
  author: test
---

# ${name}

Skill content here.
`;

const AGENT_FRONTMATTER = (name: string, description: string) => `---
name: ${name}
description: "${description}"
tools: Read
model: inherit
---

# ${name}

Agent content here.
`;

const INIT_TEMPLATE = `## rp1 Knowledge Base
{%- unless platform == "codex" %}
## rp1 Skill Awareness

{{ skillAwarenessBlock }}
{%- endunless %}
{%- if platform == "codex" %}
## Codex agent conventions
{%- endif %}
`;

describe("catalog maintenance", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("catalog-maintenance");

		await mkdir(join(tempDir, "plugins", "base", "skills", "guide"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "base", "skills", "alpha"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "dev", "skills", "build"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "base", "agents"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "plugins", "dev", "agents"), {
			recursive: true,
		});
		await mkdir(join(tempDir, "cli", "src", "build", "templates", "init"), {
			recursive: true,
		});

		await writeFile(
			join(tempDir, "plugins", "base", "skills", "alpha", "SKILL.md"),
			SKILL_FRONTMATTER(
				"alpha",
				"Alpha skill for knowledge management.",
				"knowledge",
				false,
			),
		);
		await writeFile(
			join(tempDir, "plugins", "dev", "skills", "build", "SKILL.md"),
			SKILL_FRONTMATTER(
				"build",
				"Build workflow for development tasks.",
				"development",
				true,
			),
		);
		await writeFile(
			join(tempDir, "plugins", "base", "agents", "alpha-agent.md"),
			AGENT_FRONTMATTER(
				"alpha-agent",
				"Alpha agent that stays in sync with source files.",
			),
		);
		await writeFile(
			join(tempDir, "plugins", "dev", "agents", "build-agent.md"),
			AGENT_FRONTMATTER(
				"build-agent",
				"Build agent that stays in sync with source files.",
			),
		);
		await writeFile(
			join(tempDir, INIT_TEMPLATE_SOURCE_RELATIVE_PATH),
			INIT_TEMPLATE,
		);
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("generates fresh approved artifacts and removes the legacy skill catalog", async () => {
		await mkdir(join(tempDir, "catalog"), { recursive: true });
		await writeFile(
			join(tempDir, SKILL_CATALOG_RELATIVE_PATH),
			"legacy skill catalog",
		);

		const result = await writeCatalogArtifacts(tempDir);

		expect(result.errors).toEqual([]);
		expect(
			await readFile(join(tempDir, GUIDE_CATALOG_RELATIVE_PATH), "utf-8"),
		).toContain("# rp1 Skill Catalog");
		expect(
			await readFile(
				join(tempDir, INIT_TEMPLATE_OUTPUT_RELATIVE_PATH),
				"utf-8",
			),
		).toContain("CLAUDE_CODE_TEMPLATE");
		expect(
			await readFile(join(tempDir, AGENT_CATALOG_RELATIVE_PATH), "utf-8"),
		).toContain("last_checksum");
		expect(
			await readFile(join(tempDir, SKILL_CATALOG_RELATIVE_PATH), "utf-8").catch(
				() => null,
			),
		).toBeNull();

		const checkResult = await checkCatalogArtifacts(tempDir);
		expect(checkResult.issues).toEqual([]);
	});

	test("flags stale guide and init artifacts", async () => {
		await writeCatalogArtifacts(tempDir);

		await writeFile(
			join(tempDir, GUIDE_CATALOG_RELATIVE_PATH),
			"stale guide catalog",
		);
		await writeFile(
			join(tempDir, INIT_TEMPLATE_OUTPUT_RELATIVE_PATH),
			"stale init template output",
		);

		const result = await checkCatalogArtifacts(tempDir);
		const issuePaths = result.issues.map((issue) => issue.relativePath);

		expect(issuePaths).toContain(GUIDE_CATALOG_RELATIVE_PATH);
		expect(issuePaths).toContain(INIT_TEMPLATE_OUTPUT_RELATIVE_PATH);
	});

	test("flags unauthorized duplicate skill inventory sources", async () => {
		await writeCatalogArtifacts(tempDir);

		await writeFile(
			join(tempDir, SKILL_CATALOG_RELATIVE_PATH),
			"legacy skill catalog",
		);
		await writeFile(
			join(tempDir, INIT_TEMPLATE_SOURCE_RELATIVE_PATH),
			`${INIT_TEMPLATE}\nInstalled plugins: rp1-base, rp1-dev.\n`,
		);

		const result = await checkCatalogArtifacts(tempDir);
		const issuePaths = result.issues.map((issue) => issue.relativePath);

		expect(issuePaths).toContain(SKILL_CATALOG_RELATIVE_PATH);
		expect(issuePaths).toContain(INIT_TEMPLATE_SOURCE_RELATIVE_PATH);
	});

	test("flags manual markdown skill inventories outside the allowlist", async () => {
		await writeCatalogArtifacts(tempDir);
		await mkdir(join(tempDir, "docs", "reference"), { recursive: true });
		await writeFile(
			join(tempDir, "docs", "reference", "skills.md"),
			[
				"# Skills",
				"",
				"Installed plugins: rp1-base, rp1-dev. Run `/guide` to discover skills.",
			].join("\n"),
		);

		const result = await checkCatalogArtifacts(tempDir);

		expect(result.issues.map((issue) => issue.relativePath)).toContain(
			"docs/reference/skills.md",
		);
	});

	test("surfaces missing discovery metadata through catalog-check", async () => {
		await writeCatalogArtifacts(tempDir);
		await mkdir(join(tempDir, "plugins", "dev", "skills", "broken"), {
			recursive: true,
		});
		await writeFile(
			join(tempDir, "plugins", "dev", "skills", "broken", "SKILL.md"),
			`---
name: broken
description: "Broken skill that is missing required discovery metadata."
allowed-tools: Bash(echo *)
metadata:
  version: 1.0.0
  created: 2026-01-01
  author: test
---

# broken

Skill content here.
`,
		);

		const result = await checkCatalogArtifacts(tempDir);

		expect(result.issues).toContainEqual(
			expect.objectContaining({
				relativePath: "catalog-registry",
				message: expect.stringContaining("metadata.category"),
			}),
		);
		expect(result.issues).toContainEqual(
			expect.objectContaining({
				relativePath: "catalog-registry",
				message: expect.stringContaining("metadata.is_workflow"),
			}),
		);
	});

	test("preserves the agent freshness guarantee through the transitional artifact", async () => {
		await writeCatalogArtifacts(tempDir);

		await writeFile(
			join(tempDir, "plugins", "dev", "agents", "build-agent.md"),
			AGENT_FRONTMATTER(
				"build-agent",
				"Build agent description changed after generation.",
			),
		);

		const result = await checkCatalogArtifacts(tempDir);

		expect(result.issues.map((issue) => issue.relativePath)).toContain(
			AGENT_CATALOG_RELATIVE_PATH,
		);
	});
});
