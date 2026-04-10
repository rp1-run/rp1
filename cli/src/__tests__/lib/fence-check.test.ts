import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkFenceStaleness } from "../../lib/fence-check.js";
import { LATEST_FENCE_VERSION } from "../../lib/fence-version.js";

describe("fence-check", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-fence-check-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns hasProject false when no .rp1 directory exists", () => {
		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(false);
		expect(result.staleFiles).toHaveLength(0);
		expect(result.currentFiles).toHaveLength(0);
		expect(result.latestFenceVersion).toBe(LATEST_FENCE_VERSION);
	});

	test("reports all files current when at latest version", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			`# Header\n\n<!-- rp1:start:v${LATEST_FENCE_VERSION} -->\nmanaged\n<!-- rp1:end:v${LATEST_FENCE_VERSION} -->\n`,
		);
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->\nagents\n<!-- rp1:end:v${LATEST_FENCE_VERSION} -->\n`,
		);
		writeFileSync(
			join(tempDir, ".gitignore"),
			`# rp1:start:v${LATEST_FENCE_VERSION}\n.rp1/work/\n# rp1:end:v${LATEST_FENCE_VERSION}\n`,
		);

		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(true);
		expect(result.staleFiles).toHaveLength(0);
		expect(result.currentFiles).toEqual(
			expect.arrayContaining(["CLAUDE.md", "AGENTS.md", ".gitignore"]),
		);
	});

	test("reports stale files when version is older", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start:v0.1.0 -->\nold\n<!-- rp1:end:v0.1.0 -->\n",
		);
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->\ncurrent\n<!-- rp1:end:v${LATEST_FENCE_VERSION} -->\n`,
		);

		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(true);
		expect(result.staleFiles).toEqual(["CLAUDE.md"]);
		expect(result.currentFiles).toEqual(["AGENTS.md"]);
		expect(result.oldestVersion).toBe("0.1.0");
	});

	test("treats legacy unversioned markers as stale", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start -->\nlegacy content\n<!-- rp1:end -->\n",
		);
		writeFileSync(
			join(tempDir, ".gitignore"),
			"# rp1:start\n.rp1/work/\n# rp1:end\n",
		);

		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(true);
		expect(result.staleFiles).toEqual(
			expect.arrayContaining(["CLAUDE.md", ".gitignore"]),
		);
	});

	test("skips files that do not exist", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			`<!-- rp1:start:v${LATEST_FENCE_VERSION} -->\nmanaged\n<!-- rp1:end:v${LATEST_FENCE_VERSION} -->\n`,
		);

		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(true);
		expect(result.staleFiles).toHaveLength(0);
		expect(result.currentFiles).toEqual(["CLAUDE.md"]);
	});

	test("skips files without fence markers", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(join(tempDir, "CLAUDE.md"), "# My Project\nNo fences here.");

		const result = checkFenceStaleness(tempDir);

		expect(result.hasProject).toBe(true);
		expect(result.staleFiles).toHaveLength(0);
		expect(result.currentFiles).toHaveLength(0);
	});

	test("tracks oldest version across stale files", () => {
		mkdirSync(join(tempDir, ".rp1"), { recursive: true });
		writeFileSync(
			join(tempDir, "CLAUDE.md"),
			"<!-- rp1:start:v0.5.0 -->\nold\n<!-- rp1:end:v0.5.0 -->\n",
		);
		writeFileSync(
			join(tempDir, "AGENTS.md"),
			"<!-- rp1:start:v0.3.0 -->\nolder\n<!-- rp1:end:v0.3.0 -->\n",
		);

		const result = checkFenceStaleness(tempDir);

		expect(result.oldestVersion).toBe("0.3.0");
		expect(result.staleFiles).toHaveLength(2);
	});
});
