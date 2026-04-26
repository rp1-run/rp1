import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

describe("artifact template contracts", () => {
	test("birds-eye template stores snapshot metadata in generated frontmatter", async () => {
		const template = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/project-documenter/birds-eye-view.md",
		);
		const body = template.replace(FRONTMATTER_REGEX, "");

		expect(body.startsWith("---\n")).toBe(true);
		expect(body).toContain('snapshot_generated: "{YYYY-MM-DD}"');
		expect(body).toContain('snapshot_git_sha: "{GIT_SHA}"');
		expect(body).toContain("snapshot_coverage:");
		expect(body).toContain("snapshot_regenerate_command:");
		expect(body).not.toContain("> **Snapshot**");
		expect(body).toContain("# {Project Name} — Bird's-Eye View");
	});
});
