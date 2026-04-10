/**
 * Unit tests for the build-time CATALOG.md generator.
 * Verifies catalog collection, rendering, and idempotent generation.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type CatalogEntry,
	collectCatalogEntries,
	generateCatalog,
	renderCatalog,
} from "../../build/catalog-generator.js";
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

describe("catalog-generator", () => {
	describe("renderCatalog", () => {
		test("renders entries grouped by category with correct table structure", () => {
			const entries: CatalogEntry[] = [
				{
					name: "build",
					plugin: "dev",
					description: "End-to-end feature workflow.",
					category: "development",
					isWorkflow: true,
					keyArgs: ["FEATURE_ID", "AFK"],
				},
				{
					name: "speedrun",
					plugin: "dev",
					description: "Quick iteration loop.",
					category: "development",
					isWorkflow: true,
					keyArgs: [],
				},
				{
					name: "code-check",
					plugin: "dev",
					description: "Fast code hygiene validation.",
					category: "quality",
					isWorkflow: false,
					keyArgs: ["TARGET"],
				},
			];

			const result = renderCatalog(entries);

			expect(result).toContain("# rp1 Skill Catalog");
			expect(result).toContain("## Development");
			expect(result).toContain("## Quality");
			expect(result).toContain("| Key Args |");
			expect(result).toContain(
				"| `/build` | dev | End-to-end feature workflow. | `FEATURE_ID`, `AFK` | Yes |",
			);
			expect(result).toContain(
				"| `/speedrun` | dev | Quick iteration loop. |  | Yes |",
			);
			expect(result).toContain(
				"| `/code-check` | dev | Fast code hygiene validation. | `TARGET` |  |",
			);
		});

		test("renders category-level trigger signals", () => {
			const entries: CatalogEntry[] = [
				{
					name: "build",
					plugin: "dev",
					description: "End-to-end feature workflow.",
					category: "development",
					isWorkflow: true,
					keyArgs: [],
				},
			];

			const result = renderCatalog(entries);

			expect(result).toContain("> **Suggest when**:");
			expect(result).toContain("new feature");
		});

		test("omits categories with no entries", () => {
			const entries: CatalogEntry[] = [
				{
					name: "pr-review",
					plugin: "dev",
					description: "PR review workflow.",
					category: "review",
					isWorkflow: true,
					keyArgs: [],
				},
			];

			const result = renderCatalog(entries);

			expect(result).toContain("## Review");
			expect(result).not.toContain("## Development");
			expect(result).not.toContain("## Quality");
		});

		test("includes auto-generation notice", () => {
			const result = renderCatalog([]);
			expect(result).toContain("Auto-generated from skill frontmatter");
			expect(result).toContain("Do not edit manually");
		});
	});

	describe("collectCatalogEntries", () => {
		test("collects entries from real plugin source tree", async () => {
			const { entries } = await collectCatalogEntries(
				join(import.meta.dir, "..", "..", "..", ".."),
			);

			expect(entries.length).toBeGreaterThan(0);

			const categories = new Set(entries.map((e) => e.category));
			expect(categories.size).toBeGreaterThan(3);

			const plugins = new Set(entries.map((e) => e.plugin));
			expect(plugins.has("base")).toBe(true);
			expect(plugins.has("dev")).toBe(true);
			expect(plugins.has("utils")).toBe(false);

			const workflows = entries.filter((e) => e.isWorkflow);
			expect(workflows.length).toBeGreaterThan(0);

			const buildSkill = entries.find((e) => e.name === "build");
			expect(buildSkill).toBeDefined();
			expect(buildSkill!.category).toBe("development");
			expect(buildSkill!.isWorkflow).toBe(true);
			expect(buildSkill!.plugin).toBe("dev");
		});
	});

	describe("generateCatalog", () => {
		let tempDir: string;

		beforeEach(async () => {
			tempDir = await createTempDir("catalog");
		});

		afterEach(async () => {
			await cleanupTempDir(tempDir);
		});

		test("generates catalog file from fixture skills", async () => {
			await mkdir(join(tempDir, "plugins", "base", "skills", "alpha"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "base", "skills", "guide"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "dev", "skills", "beta"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "utils", "skills", "gamma"), {
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
				join(tempDir, "plugins", "dev", "skills", "beta", "SKILL.md"),
				SKILL_FRONTMATTER(
					"beta",
					"Beta workflow for development tasks.",
					"development",
					true,
				),
			);
			await writeFile(
				join(tempDir, "plugins", "utils", "skills", "gamma", "SKILL.md"),
				SKILL_FRONTMATTER(
					"gamma",
					"Gamma prompt utility for internal use.",
					"prompt",
					false,
				),
			);

			const outputPath = join(
				tempDir,
				"plugins",
				"base",
				"skills",
				"guide",
				"CATALOG.md",
			);
			const { entries } = await generateCatalog(tempDir, outputPath);

			expect(entries).toHaveLength(2);
			expect(entries.map((entry) => entry.name)).not.toContain("gamma");

			const content = await readFile(outputPath, "utf-8");
			expect(content).toContain("# rp1 Skill Catalog");
			expect(content).toContain("## Development");
			expect(content).toContain("## Knowledge");
			expect(content).toContain("| `/beta` | dev |");
			expect(content).toContain("| `/alpha` | base |");
			expect(content).not.toContain("| `/gamma` | utils |");
			expect(content).not.toContain("## Prompt");
		});

		test("idempotent generation produces identical output", async () => {
			await mkdir(join(tempDir, "plugins", "base", "skills", "test-skill"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "base", "skills", "guide"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "dev", "skills"), {
				recursive: true,
			});
			await mkdir(join(tempDir, "plugins", "utils", "skills"), {
				recursive: true,
			});

			await writeFile(
				join(tempDir, "plugins", "base", "skills", "test-skill", "SKILL.md"),
				SKILL_FRONTMATTER(
					"test-skill",
					"A test skill for idempotency checking.",
					"quality",
					false,
				),
			);

			const outputPath = join(
				tempDir,
				"plugins",
				"base",
				"skills",
				"guide",
				"CATALOG.md",
			);

			await generateCatalog(tempDir, outputPath);
			const first = await readFile(outputPath, "utf-8");

			await generateCatalog(tempDir, outputPath);
			const second = await readFile(outputPath, "utf-8");

			expect(first).toBe(second);
		});
	});
});
