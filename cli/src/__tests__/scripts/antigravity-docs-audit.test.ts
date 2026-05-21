import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	auditGeminiReferences,
	findProjectRoot,
	formatGeminiAuditResult,
} from "../../../scripts/audit-antigravity-docs.ts";
import {
	cleanupTempDir,
	createTempDir,
	writeFixture,
} from "../helpers/index.js";

describe("Antigravity docs Gemini leftover audit", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("antigravity-docs-audit");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test("allows explicit historical Gemini provenance and Antigravity profile paths", async () => {
		await writeFixture(
			tempDir,
			"docs/reference/platforms/gemini.md",
			"Gemini CLI support was never released as a public rp1 platform.\n",
		);
		await writeFixture(
			tempDir,
			"docs/reference/cli/install.md",
			"Install assets under `~/.gemini/antigravity-cli/rp1-base/`.\n",
		);

		const result = await auditGeminiReferences(tempDir, {
			targets: ["docs"],
			allowlist: {
				entries: [
					{
						path: "docs/reference/platforms/gemini.md",
						pattern: ".*",
						reason: "historical provenance",
					},
					{
						path: "docs/reference/cli/install.md",
						pattern: ".*~/.gemini/antigravity-cli/.*",
						reason: "Antigravity profile path",
					},
				],
			},
		});

		expect(result.violations).toEqual([]);
		expect(result.matches).toHaveLength(2);
		expect(formatGeminiAuditResult(result)).toContain("audit passed");
	});

	test("reports active Gemini claims outside the allowlist", async () => {
		await writeFixture(
			tempDir,
			"docs/index.md",
			"Gemini CLI is available as a first-class platform.\n",
		);

		const result = await auditGeminiReferences(tempDir, {
			targets: ["docs"],
			allowlist: { entries: [] },
		});

		expect(result.violations).toHaveLength(1);
		expect(result.violations[0]).toMatchObject({
			path: "docs/index.md",
			line: 1,
			column: 1,
			allowed: false,
		});
		expect(formatGeminiAuditResult(result)).toContain("audit failed");
	});

	test("does not treat an unrelated docs-only parent as the project root", async () => {
		await writeFixture(tempDir, "docs/notes.md", "# unrelated docs\n");
		await writeFixture(tempDir, "nested/file.txt", "content\n");

		await expect(findProjectRoot(join(tempDir, "nested"))).rejects.toThrow(
			"Could not find project root",
		);
	});
});
