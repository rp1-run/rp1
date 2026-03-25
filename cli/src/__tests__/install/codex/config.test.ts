import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

import {
	buildConfigPatch,
	deduplicatePatch,
	detectNotifyConfigConflict,
	generateConfigDiff,
	mergeCodexConfig,
	readCodexConfig,
	validateToml,
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

		test("includes managed section header", async () => {
			const result = await expectTaskRight(buildConfigPatch([]));

			expect(result).toContain("rp1 managed section");
		});

		test("includes features section with multi_agent enabled", async () => {
			const result = await expectTaskRight(buildConfigPatch([]));

			expect(result).toContain("[features]");
			expect(result).toContain("multi_agent = true");
		});

		test("includes Codex notify command settings", async () => {
			const result = await expectTaskRight(buildConfigPatch([]));

			expect(result).toContain('notifications = "all"');
			expect(result).toContain('notification_method = "command"');
			expect(result).toContain(
				'notify = ["rp1", "agent-tools", "codex-notify"]',
			);
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

	describe("deduplicatePatch", () => {
		test("skips [features] table when user already has it", () => {
			const userContent = "[features]\nmulti_agent = true\n";
			const patch =
				'# managed\n\n[features]\nmulti_agent = true\n\n[agents.rp1-build]\nmodel = "o3"\n';
			const { patch: result, skipped } = deduplicatePatch(patch, userContent);

			expect(result).not.toContain("[features]");
			expect(result).toContain("[agents.rp1-build]");
			expect(skipped).toContain("features");
		});

		test("keeps all content when no conflicts", () => {
			const userContent = 'model = "o3"\n';
			const patch =
				'[features]\nmulti_agent = true\n\n[agents.rp1-build]\nmodel = "o3"\n';
			const { patch: result, skipped } = deduplicatePatch(patch, userContent);

			expect(result).toContain("[features]");
			expect(result).toContain("[agents.rp1-build]");
			expect(skipped).toHaveLength(0);
		});

		test("returns patch unchanged when user content is unparseable", () => {
			const userContent = "[broken\ninvalid";
			const patch = "[features]\nmulti_agent = true\n";
			const { patch: result } = deduplicatePatch(patch, userContent);

			expect(result).toBe(patch);
		});
	});

	describe("mergeCodexConfig deduplication", () => {
		test("skips duplicate [features] table from patch", () => {
			const existing = "[features]\nmulti_agent = true\n";
			const patch =
				'[features]\nmulti_agent = true\n\n[agents.rp1-build]\nmodel = "o3"\n';
			const result = mergeCodexConfig(existing, patch);

			// The merged result should be valid TOML (no duplicate [features])
			const error = validateToml(result);
			expect(error).toBeNull();
			expect(result).toContain("[agents.rp1-build]");
		});

		test("produces valid TOML when user has [features] and we add agents", () => {
			const existing = 'model = "o3"\n\n[features]\nmulti_agent = true\n';
			const patch =
				'[features]\nmulti_agent = true\n\n[agents.rp1-build]\ndescription = "builder"\nconfig_file = "./agents/rp1/rp1-build.toml"\n';
			const result = mergeCodexConfig(existing, patch);

			const error = validateToml(result);
			expect(error).toBeNull();
			expect(result).toContain("[agents.rp1-build]");
		});
	});

	describe("detectNotifyConfigConflict", () => {
		test("returns null when user config does not own notify settings", () => {
			const existing = 'model = "o3"\n';
			expect(detectNotifyConfigConflict(existing)).toBeNull();
		});

		test("detects user-owned notify command", () => {
			const existing =
				'model = "o3"\nnotify = ["terminal-notifier", "-message", "done"]\n';
			expect(detectNotifyConfigConflict(existing)).toContain("notify");
		});

		test("ignores notify settings inside the rp1 fence", () => {
			const existing = `model = "o3"

# rp1:start
notifications = "all"
notification_method = "command"
notify = ["rp1", "agent-tools", "codex-notify"]
# rp1:end
`;
			expect(detectNotifyConfigConflict(existing)).toBeNull();
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

	describe("validateToml", () => {
		test("returns null for valid TOML", () => {
			const valid = 'model = "o3"\n\n[features]\nmulti_agent = true\n';
			expect(validateToml(valid)).toBeNull();
		});

		test("returns null for empty string", () => {
			expect(validateToml("")).toBeNull();
		});

		test("returns null for TOML with comments", () => {
			const withComments =
				"# rp1:start\n# managed\n[features]\nmulti_agent = true\n# rp1:end\n";
			expect(validateToml(withComments)).toBeNull();
		});

		test("returns error message for invalid TOML", () => {
			const invalid = "[broken\nkey = ";
			const result = validateToml(invalid);
			expect(result).not.toBeNull();
			expect(typeof result).toBe("string");
		});
	});

	describe("writeCodexConfig", () => {
		test("writes valid TOML content to file", async () => {
			const configPath = join(tempDir, "config.toml");
			const validToml = 'model = "o3"\n';
			await expectTaskRight(writeCodexConfig(configPath, validToml));

			const content = await readFile(configPath, "utf-8");
			expect(content).toBe(validToml);
		});

		test("creates parent directories if missing", async () => {
			const configPath = join(tempDir, "nested", "deep", "config.toml");
			const validToml = 'key = "value"\n';
			await expectTaskRight(writeCodexConfig(configPath, validToml));

			const content = await readFile(configPath, "utf-8");
			expect(content).toBe(validToml);
		});

		test("rejects invalid TOML to protect user config", async () => {
			const configPath = join(tempDir, "config.toml");
			const invalidToml = "[broken\nkey = ";
			const result = await writeCodexConfig(configPath, invalidToml)();

			expect(E.isLeft(result)).toBe(true);
			if (E.isLeft(result)) {
				expect(result.left._tag).toBe("ConfigError");
			}
		});
	});
});
