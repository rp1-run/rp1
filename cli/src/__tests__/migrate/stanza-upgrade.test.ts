import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AGENTS_REFERENCE_TEMPLATE } from "../../init/templates/index.js";
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";
import { upgradeStanzas } from "../../migrate/stanza-upgrade.js";

describe("stanza-upgrade", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-stanza-upgrade-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("upgrades legacy unversioned markers to latest", () => {
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"# My Project\n\n<!-- rp1:start -->\nold content\n<!-- rp1:end -->\n\nCustom notes.",
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded).toHaveLength(1);
		expect(result.filesUpgraded[0].file).toBe("CLAUDE.md");
		expect(result.filesUpgraded[0].fromVersion).toBe("0.0.0");
		expect(result.filesUpgraded[0].toVersion).toBe(LATEST_FENCE_VERSION);

		const updated = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
		expect(updated).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);
		expect(updated).toContain(`<!-- rp1:end:v${LATEST_FENCE_VERSION} -->`);
	});

	test("upgrades stale versioned markers to latest", () => {
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start:v0.1.0 -->\nold template\n<!-- rp1:end:v0.1.0 -->",
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded).toHaveLength(1);
		expect(result.filesUpgraded[0].fromVersion).toBe("0.1.0");
		expect(result.filesUpgraded[0].toVersion).toBe(LATEST_FENCE_VERSION);
	});

	test("skips files already at current version", () => {
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->\ncurrent\n<!-- rp1:end:v${LATEST_FENCE_VERSION} -->`,
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded).toHaveLength(0);
		expect(result.filesAlreadyCurrent).toEqual(["CLAUDE.md"]);
	});

	test("preserves user content outside fences", () => {
		const userHeader = "# My Custom Header\n\nImportant notes.\n\n";
		const userFooter = "\n\n## My Custom Footer\nMore notes.";
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			`${userHeader}<!-- rp1:start:v0.1.0 -->\nold managed\n<!-- rp1:end:v0.1.0 -->${userFooter}`,
		);

		upgradeStanzas(tempDir);

		const updated = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
		expect(updated).toContain("# My Custom Header");
		expect(updated).toContain("Important notes.");
		expect(updated).toContain("## My Custom Footer");
		expect(updated).toContain("More notes.");
		expect(updated).not.toContain("old managed");
	});

	test("reports missing files as not found", () => {
		const result = upgradeStanzas(tempDir);

		expect(result.filesNotFound).toEqual(
			expect.arrayContaining(["CLAUDE.md", "AGENTS.md", ".gitignore"]),
		);
		expect(result.filesUpgraded).toHaveLength(0);
	});

	test("idempotent second run reports already current", () => {
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start:v0.1.0 -->\nold\n<!-- rp1:end:v0.1.0 -->",
		);

		const first = upgradeStanzas(tempDir);
		expect(first.filesUpgraded).toHaveLength(1);

		const second = upgradeStanzas(tempDir);
		expect(second.filesUpgraded).toHaveLength(0);
		expect(second.filesAlreadyCurrent).toEqual(["CLAUDE.md"]);
	});

	test("upgrades .gitignore with shell fence markers", () => {
		writeFileSync(
			join(tempDir, ".gitignore"),
			"node_modules/\n\n# rp1:start\n.rp1/work/\n# rp1:end\n\ndist/",
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded.some((f) => f.file === ".gitignore")).toBe(
			true,
		);

		const updated = readFileSync(join(tempDir, ".gitignore"), "utf-8");
		expect(updated).toContain(`# rp1:start:v${LATEST_FENCE_VERSION}`);
		expect(updated).toContain(`# rp1:end:v${LATEST_FENCE_VERSION}`);
		expect(updated).toContain("node_modules/");
		expect(updated).toContain("dist/");
	});

	test("handles multiple files in single run", () => {
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start:v0.1.0 -->\nold\n<!-- rp1:end:v0.1.0 -->",
		);
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			"<!-- rp1:start -->\nlegacy\n<!-- rp1:end -->",
		);
		writeFileSync(
			join(tempDir, ".gitignore"),
			`# rp1:start:v${LATEST_FENCE_VERSION}\n.rp1/work/\n# rp1:end:v${LATEST_FENCE_VERSION}`,
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded).toHaveLength(2);
		expect(result.filesAlreadyCurrent).toEqual([".gitignore"]);
		expect(result.filesScanned).toBe(3);
	});

	test("preserves the Codex AGENTS.md template flavor during upgrades", () => {
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			[
				"<!-- rp1:start:v0.1.0 -->",
				"## Codex agent conventions",
				"",
				"Legacy codex text",
				"<!-- rp1:end:v0.1.0 -->",
			].join("\n"),
		);

		const result = upgradeStanzas(tempDir);

		expect(result.filesUpgraded).toHaveLength(1);
		expect(result.filesUpgraded[0].file).toBe("AGENTS.md");

		const updated = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");
		expect(updated).toContain("## Codex agent conventions");
		expect(updated).not.toContain("## rp1 Skill Awareness");
		expect(updated).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);
	});

	test("scans exactly 3 known files", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });

		const result = upgradeStanzas(tempDir);

		expect(result.filesScanned).toBe(3);
	});

	describe("single-file deduplication during upgrade", () => {
		test("upgrade replaces CLAUDE.md full template with @AGENTS.md reference when both have fences", () => {
			writeFileSync(
				join(tempDir, "CLAUDE.md"),
				"# Project\n\n<!-- rp1:start:v0.1.0 -->\n## rp1 Knowledge Base\nOld full template\n<!-- rp1:end:v0.1.0 -->",
			);
			writeFileSync(
				join(tempDir, "AGENTS.md"),
				"<!-- rp1:start:v0.1.0 -->\n## rp1 Knowledge Base\nOld full template\n<!-- rp1:end:v0.1.0 -->",
			);

			const result = upgradeStanzas(tempDir);

			expect(result.filesUpgraded).toHaveLength(2);

			const claude = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
			const agents = readFileSync(join(tempDir, "AGENTS.md"), "utf-8");

			expect(claude).toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claude).not.toContain("## rp1 Knowledge Base");
			expect(claude).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);

			expect(agents).toContain("## rp1 Knowledge Base");
			expect(agents).toContain(`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->`);

			expect(claude).toContain("# Project");
		});

		test("upgrade keeps CLAUDE.md full template when AGENTS.md has no fence", () => {
			writeFileSync(
				join(tempDir, "CLAUDE.md"),
				"<!-- rp1:start:v0.1.0 -->\n## rp1 Knowledge Base\nOld\n<!-- rp1:end:v0.1.0 -->",
			);
			writeFileSync(join(tempDir, "AGENTS.md"), "# No fenced content\n");

			const result = upgradeStanzas(tempDir);

			expect(result.filesUpgraded).toHaveLength(1);
			expect(result.filesUpgraded[0].file).toBe("CLAUDE.md");

			const claude = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
			expect(claude).toContain("## rp1 Knowledge Base");
			expect(claude).not.toContain(AGENTS_REFERENCE_TEMPLATE);
		});

		test("upgrade keeps CLAUDE.md full template when AGENTS.md does not exist", () => {
			writeFileSync(
				join(tempDir, "CLAUDE.md"),
				"<!-- rp1:start:v0.1.0 -->\nold\n<!-- rp1:end:v0.1.0 -->",
			);

			const result = upgradeStanzas(tempDir);

			expect(result.filesUpgraded).toHaveLength(1);
			const claude = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
			expect(claude).toContain("## rp1 Knowledge Base");
			expect(claude).not.toContain(AGENTS_REFERENCE_TEMPLATE);
		});

		test("upgrade is idempotent with @AGENTS.md reference", () => {
			writeFileSync(
				join(tempDir, "CLAUDE.md"),
				`<!-- rp1:start:v0.1.0 -->\n${AGENTS_REFERENCE_TEMPLATE}\n<!-- rp1:end:v0.1.0 -->`,
			);
			writeFileSync(
				join(tempDir, "AGENTS.md"),
				"<!-- rp1:start:v0.1.0 -->\n## rp1 Knowledge Base\nold\n<!-- rp1:end:v0.1.0 -->",
			);

			const first = upgradeStanzas(tempDir);
			expect(first.filesUpgraded).toHaveLength(2);

			const second = upgradeStanzas(tempDir);
			expect(second.filesUpgraded).toHaveLength(0);
			expect(second.filesAlreadyCurrent).toContain("CLAUDE.md");
			expect(second.filesAlreadyCurrent).toContain("AGENTS.md");

			const claude = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
			expect(claude).toContain(AGENTS_REFERENCE_TEMPLATE);
			expect(claude).not.toContain("## rp1 Knowledge Base");
		});
	});
});
