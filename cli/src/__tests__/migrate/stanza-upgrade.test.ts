import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

	test("scans exactly 3 known files", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });

		const result = upgradeStanzas(tempDir);

		expect(result.filesScanned).toBe(3);
	});
});
