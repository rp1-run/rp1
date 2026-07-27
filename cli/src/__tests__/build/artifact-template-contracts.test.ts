import { describe, expect, test } from "bun:test";
import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";

const projectRoot = join(import.meta.dir, "..", "..", "..", "..");
const FRONTMATTER_REGEX = /^---\r?\n[\s\S]*?\r?\n---\r?\n/;

/**
 * Regex that matches direct template path references in agent/skill files.
 * Captures the path portion after the `plugins/base/skills/artifact-templates/`
 * prefix, including the full relative path within the templates directory.
 */
const TEMPLATE_PATH_REGEX =
	/plugins\/base\/skills\/artifact-templates\/(templates\/[^\s`)"']+\.(?:md|json|yaml))/g;

const readProjectFile = async (relativePath: string): Promise<string> =>
	readFile(join(projectRoot, relativePath), "utf-8");

/**
 * Read a skill's full prompt surface: SKILL.md plus every file under its
 * references/ directory. Progressive disclosure splits one skill's
 * instructions across several files, so a contract about what the skill
 * specifies holds over the whole surface, not SKILL.md alone.
 */
const readSkillSurface = async (skillRelativeDir: string): Promise<string> => {
	const dir = join(projectRoot, skillRelativeDir);
	const parts = [await readFile(join(dir, "SKILL.md"), "utf-8")];
	const refsDir = join(dir, "references");
	try {
		for (const entry of (await readdir(refsDir)).sort()) {
			if (entry.endsWith(".md")) {
				parts.push(await readFile(join(refsDir, entry), "utf-8"));
			}
		}
	} catch {
		// No references/ directory for this skill.
	}
	return parts.join("\n");
};

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

	test("pr-review report template declares the conditional Reviewed PR external link", async () => {
		const template = await readProjectFile(
			"plugins/base/skills/artifact-templates/templates/pr-review-reporter/pr-review-report.md",
		);
		const body = template.replace(FRONTMATTER_REGEX, "");

		expect(template).toContain(
			"Include External Links only when PR_INFO.reviewed_pr_url is present.",
		);
		expect(body).toContain("## External Links");
		expect(body).toContain("| Label | URL | Relationship | Source Context |");
		expect(body).toContain(
			"| Reviewed PR | {REVIEWED_PR_URL} | reviewed_pr | PR review input resolution |",
		);
		expect(body).not.toContain("GitHub Review");
	});

	test("pr-review reporter limits External Links to one reviewed PR row", async () => {
		const reporter = await readProjectFile(
			"plugins/dev/agents/pr-review-reporter.md",
		);

		expect(reporter).toContain("PR_INFO.reviewed_pr_url");
		expect(reporter).toContain("exactly one `External Links` section");
		expect(reporter).toContain("one `Reviewed PR` row");
		expect(reporter).toContain("omit the whole section");
		expect(reporter).toContain("Do not leave `{REVIEWED_PR_URL}`");
		expect(reporter).toContain("Do not add posted GitHub review URLs");
		expect(reporter).toContain("URLs discovered in findings markdown");
	});

	test("pr-review skill registers only the reviewed PR URL as a link artifact", async () => {
		const skill = await readSkillSurface("plugins/dev/skills/pr-review");
		const linkArtifacts = await readProjectFile(
			"plugins/dev/skills/pr-review/references/link-artifacts.md",
		);
		// readSkillSurface already includes references/, so `skill` covers the
		// companion too. Concatenating linkArtifacts again would double-count
		// its payloads. It stays read separately for the assertions below that
		// pin which file the content lives in.
		const linkPayloads = [
			...skill.matchAll(/--data '([^']*"locationKind":"url"[^']*)'/g),
		].map((match) => match[1]);
		const reusablePayloads = linkPayloads.filter((payload) =>
			payload.includes('"url":"{LINK_URL}"'),
		);
		const prReviewPayloads = linkPayloads.filter((payload) =>
			payload.includes('"url":"{REVIEWED_PR_URL}"'),
		);

		// SKILL.md carries the pointer and core identity
		expect(skill).toContain("REVIEWED_PR_URL");
		expect(skill).toContain("reviewed_pr_url: REVIEWED_PR_URL");
		expect(skill).toContain("references/link-artifacts.md");

		// The reusable pattern and PR review binding live in the reference companion
		expect(linkArtifacts).toContain(
			"Reusable External Link Artifact Registration Pattern",
		);
		expect(linkArtifacts).toContain(
			"Use this insertable block in any orchestrator",
		);
		expect(linkArtifacts).toContain(
			"| `{LINK_URL}` | Canonical `http` or `https` URL from structured workflow state |",
		);
		expect(linkArtifacts).toContain(
			"Collect link values from explicit workflow state, not by scanning generated markdown for URLs.",
		);
		expect(linkArtifacts).toContain("## PR Review Binding");
		expect(reusablePayloads).toHaveLength(1);
		expect(prReviewPayloads).toHaveLength(1);
		expect(prReviewPayloads[0]).toContain('"url":"{REVIEWED_PR_URL}"');
		expect(prReviewPayloads[0]).toContain('"label":"Reviewed PR"');
		expect(prReviewPayloads[0]).toContain('"relationship":"reviewed_pr"');
		expect(prReviewPayloads[0]).toContain(
			'"sourceContext":"PR review input resolution"',
		);
		expect(prReviewPayloads[0]).toContain(
			'"sourceArtifactPath":"{REPORT_PATH}"',
		);
		expect(linkArtifacts).toContain(
			"Skip this emit entirely when `REVIEWED_PR_URL` is empty.",
		);
		expect(linkArtifacts).toContain(
			"If link artifact registration fails, warn and continue",
		);
		expect(linkArtifacts).toContain(
			"Do not register posted GitHub review URLs",
		);
		expect(skill).not.toContain('"url":"{REVIEW_URL}"');
	});

	test("all direct template path references in agent and skill files point to existing files", async () => {
		const pluginDirs = ["plugins/base", "plugins/dev", "plugins/utils"];
		const mdFiles: string[] = [];

		const walk = async (dir: string): Promise<void> => {
			const entries = await readdir(join(projectRoot, dir), {
				withFileTypes: true,
			});
			for (const entry of entries) {
				const rel = `${dir}/${entry.name}`;
				if (entry.isDirectory()) {
					// Skip the artifact-templates directory itself
					if (rel.includes("artifact-templates/templates")) continue;
					await walk(rel);
				} else if (entry.name.endsWith(".md")) {
					mdFiles.push(rel);
				}
			}
		};

		for (const dir of pluginDirs) {
			await walk(dir);
		}

		expect(mdFiles.length).toBeGreaterThan(0);

		const pathRefs: Array<{ file: string; templatePath: string }> = [];

		for (const file of mdFiles) {
			const content = await readProjectFile(file);
			for (const match of content.matchAll(TEMPLATE_PATH_REGEX)) {
				pathRefs.push({
					file,
					templatePath: `plugins/base/skills/artifact-templates/${match[1]}`,
				});
			}
		}

		expect(pathRefs.length).toBeGreaterThan(20);

		const missing: string[] = [];
		for (const ref of pathRefs) {
			const absPath = join(projectRoot, ref.templatePath);
			try {
				await stat(absPath);
			} catch {
				missing.push(`${ref.file} -> ${ref.templatePath}`);
			}
		}

		expect(missing).toEqual([]);
	});
});
