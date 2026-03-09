import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	buildConfigPatch,
	generateApprovalEntries,
	generateConfigDiff,
	mergeCodexConfig,
	readCodexConfig,
	writeCodexConfig,
} from "../../../install/codex/config.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

describe("codex config", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("codex-config-test");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	describe("readCodexConfig", () => {
		test("returns empty string when file does not exist", async () => {
			const configPath = join(tempDir, "nonexistent", "config.toml");
			const result = await readCodexConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe("");
			}
		});

		test("reads existing config file content", async () => {
			const configPath = join(tempDir, "config.toml");
			const content = 'sandbox_mode = "full"\n[model]\ndefault = "o3"';
			await writeFile(configPath, content);

			const result = await readCodexConfig(configPath)();

			expect(E.isRight(result)).toBe(true);
			if (E.isRight(result)) {
				expect(result.right).toBe(content);
			}
		});
	});

	describe("generateApprovalEntries", () => {
		test("generates entries for all required commands", () => {
			const entries = generateApprovalEntries();

			expect(entries).toContain('pattern = "rp1 agent-tools *"');
			expect(entries).toContain('pattern = "echo *"');
			expect(entries).toContain('pattern = "printf *"');
			expect(entries).toContain('pattern = "git *"');
		});

		test("uses [[shell.approved]] TOML table syntax", () => {
			const entries = generateApprovalEntries();
			const occurrences = entries.split("[[shell.approved]]").length - 1;

			expect(occurrences).toBe(4);
		});
	});

	describe("buildConfigPatch", () => {
		test("includes agent definitions from TOML files", async () => {
			const tomlPath = await writeFixture(
				tempDir,
				"base/rp1-agents.toml",
				'[agents.rp1-build]\nmodel = "o4-mini"\nrole = "worker"',
			);

			const result = await expectTaskRight(buildConfigPatch([tomlPath]));

			expect(result).toContain("[agents.rp1-build]");
			expect(result).toContain('model = "o4-mini"');
		});

		test("includes shell approval entries", async () => {
			const result = await expectTaskRight(buildConfigPatch([]));

			expect(result).toContain("[[shell.approved]]");
			expect(result).toContain('pattern = "rp1 agent-tools *"');
		});

		test("includes managed section header", async () => {
			const result = await expectTaskRight(buildConfigPatch([]));

			expect(result).toContain("rp1 managed section");
		});

		test("concatenates multiple TOML files", async () => {
			const basePath = await writeFixture(
				tempDir,
				"base/rp1-agents.toml",
				'[agents.rp1-build]\nmodel = "o4-mini"',
			);
			const devPath = await writeFixture(
				tempDir,
				"dev/rp1-agents.toml",
				'[agents.rp1-review]\nmodel = "o3"',
			);

			const result = await expectTaskRight(
				buildConfigPatch([basePath, devPath]),
			);

			expect(result).toContain("[agents.rp1-build]");
			expect(result).toContain("[agents.rp1-review]");
		});
	});

	describe("mergeCodexConfig", () => {
		test("appends to empty config", () => {
			const result = mergeCodexConfig("", "rp1 managed content");

			expect(result).toContain("# rp1:start");
			expect(result).toContain("rp1 managed content");
			expect(result).toContain("# rp1:end");
		});

		test("appends alongside existing content", () => {
			const existing = 'sandbox_mode = "full"\n';
			const result = mergeCodexConfig(existing, "rp1 managed content");

			expect(result).toContain("sandbox_mode");
			expect(result).toContain("# rp1:start");
			expect(result).toContain("rp1 managed content");
			expect(result).toContain("# rp1:end");
		});

		test("replaces existing rp1 fenced section", () => {
			const existing =
				'sandbox_mode = "full"\n\n# rp1:start\nold content\n# rp1:end\n';
			const result = mergeCodexConfig(existing, "new content");

			expect(result).toContain("sandbox_mode");
			expect(result).toContain("new content");
			expect(result).not.toContain("old content");
		});

		test("preserves non-rp1 content when replacing", () => {
			const existing =
				'[model]\ndefault = "o3"\n\n# rp1:start\nold\n# rp1:end\n\n[other]\nkey = "value"';
			const result = mergeCodexConfig(existing, "updated");

			expect(result).toContain('default = "o3"');
			expect(result).toContain('key = "value"');
			expect(result).toContain("updated");
			expect(result).not.toContain("old");
		});
	});

	describe("generateConfigDiff", () => {
		test("shows new file creation for empty existing", () => {
			const newContent = "# rp1:start\nsomething\n# rp1:end";
			const diff = generateConfigDiff("", newContent);

			expect(diff).toContain("new file will be created");
			expect(diff).toContain("+ # rp1:start");
		});

		test("shows append for existing without fenced section", () => {
			const existing = 'sandbox_mode = "full"';
			const newContent =
				'sandbox_mode = "full"\n\n# rp1:start\nstuff\n# rp1:end';
			const diff = generateConfigDiff(existing, newContent);

			expect(diff).toContain("rp1 section will be appended");
		});

		test("shows replace for existing with fenced section", () => {
			const existing = '# rp1:start\nold\n# rp1:end\nother = "val"';
			const newContent = '# rp1:start\nnew\n# rp1:end\nother = "val"';
			const diff = generateConfigDiff(existing, newContent);

			expect(diff).toContain("rp1 section will be replaced");
		});
	});

	describe("writeCodexConfig", () => {
		test("writes content to file", async () => {
			const configPath = join(tempDir, "config.toml");
			await expectTaskRight(writeCodexConfig(configPath, "test content"));

			const content = await readFile(configPath, "utf-8");
			expect(content).toBe("test content");
		});

		test("creates parent directories if missing", async () => {
			const configPath = join(tempDir, "nested", "deep", "config.toml");
			await expectTaskRight(writeCodexConfig(configPath, "content"));

			const content = await readFile(configPath, "utf-8");
			expect(content).toBe("content");
		});
	});
});
