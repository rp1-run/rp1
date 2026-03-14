import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import {
	buildConfigPatch,
	mergeCodexConfig,
	readCodexConfig,
	writeCodexConfig,
} from "../../../install/codex/config.js";
import {
	backupCodexInstallation,
	copyCodexAgents,
	copyCodexSkills,
	uninstallCodex,
	validateCodexArtifacts,
} from "../../../install/codex/installer.js";
import type { CodexPaths } from "../../../install/codex/models.js";
import {
	cleanupTempDir,
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

describe("codex integration", () => {
	let tempDir: string;
	let paths: CodexPaths;
	let artifactsDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("codex-integration-test");
		paths = {
			skillsDir: join(tempDir, "home", ".agents", "skills"),
			configDir: join(tempDir, "home", ".codex"),
			configFile: join(tempDir, "home", ".codex", "config.toml"),
			backupDir: join(tempDir, "home", ".codex-rp1-backups"),
			agentsDir: join(tempDir, "home", ".codex", "agents", "rp1"),
		};
		artifactsDir = join(tempDir, "artifacts");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	async function setupArtifacts(): Promise<string[]> {
		await writeFixture(
			join(artifactsDir, "base"),
			"skills/rp1-build/SKILL.md",
			"---\nname: rp1-build\n---\nBuild skill",
		);
		await writeFixture(
			join(artifactsDir, "base"),
			"skills/rp1-build/agents/openai.yaml",
			"agent: rp1-build",
		);
		await writeFixture(
			join(artifactsDir, "base"),
			"rp1-agents.toml",
			'[agents.rp1-build]\ndescription = "Build agent"\nconfig_file = "./agents/rp1/rp1-build.toml"',
		);
		await writeFixture(
			join(artifactsDir, "base"),
			"agents/rp1-build.toml",
			'model = "o4-mini"\ndeveloper_instructions = """Build instructions"""',
		);
		await writeFixture(
			join(artifactsDir, "dev"),
			"skills/rp1-review/SKILL.md",
			"---\nname: rp1-review\n---\nReview skill",
		);
		await writeFixture(
			join(artifactsDir, "dev"),
			"skills/rp1-review/agents/openai.yaml",
			"agent: rp1-review",
		);
		await writeFixture(
			join(artifactsDir, "dev"),
			"rp1-agents.toml",
			'[agents.rp1-review]\ndescription = "Review agent"\nconfig_file = "./agents/rp1/rp1-review.toml"',
		);
		await writeFixture(
			join(artifactsDir, "dev"),
			"agents/rp1-review.toml",
			'model = "o3"\ndeveloper_instructions = """Review instructions"""',
		);

		const validated = await expectTaskRight(
			validateCodexArtifacts(artifactsDir),
		);
		return [...validated];
	}

	test("full install + verify + uninstall cycle", async () => {
		const pluginDirs = await setupArtifacts();

		await expectTaskRight(backupCodexInstallation(paths));

		const skillsCopied = await expectTaskRight(
			copyCodexSkills(pluginDirs, paths.skillsDir),
		);
		expect(skillsCopied).toBeGreaterThan(0);

		const skillEntries = await readdir(paths.skillsDir);
		expect(skillEntries).toContain("rp1-build");
		expect(skillEntries).toContain("rp1-review");

		const agentsCopied = await expectTaskRight(
			copyCodexAgents(pluginDirs, paths.agentsDir),
		);
		expect(agentsCopied).toBe(2);

		const agentEntries = await readdir(paths.agentsDir);
		expect(agentEntries).toContain("rp1-build.toml");
		expect(agentEntries).toContain("rp1-review.toml");

		const tomlPaths = pluginDirs.map((d) => join(d, "rp1-agents.toml"));
		const patch = await expectTaskRight(buildConfigPatch(tomlPaths));
		const existingConfig = await expectTaskRight(
			readCodexConfig(paths.configFile),
		);
		const newConfig = mergeCodexConfig(existingConfig, patch);
		await expectTaskRight(writeCodexConfig(paths.configFile, newConfig));

		const config = await readFile(paths.configFile, "utf-8");
		expect(config).toContain("# rp1:start");
		expect(config).toContain("# rp1:end");
		expect(config).toContain("[agents.rp1-build]");
		expect(config).toContain("[agents.rp1-review]");
		expect(config).toContain('config_file = "./agents/rp1/rp1-build.toml"');

		const uninstallResult = await expectTaskRight(uninstallCodex(paths, false));
		expect(uninstallResult.skillsRemoved).toBe(2);
		expect(uninstallResult.configCleaned).toBe(true);

		const postEntries = await readdir(paths.skillsDir);
		expect(postEntries).not.toContain("rp1-build");
		expect(postEntries).not.toContain("rp1-review");

		let agentsDirExists = true;
		try {
			await stat(paths.agentsDir);
		} catch {
			agentsDirExists = false;
		}
		expect(agentsDirExists).toBe(false);

		const postConfig = await readFile(paths.configFile, "utf-8");
		expect(postConfig).not.toContain("[agents.rp1-build]");
		expect(postConfig).not.toContain("[agents.rp1-review]");
	});

	test("install preserves existing user config", async () => {
		const pluginDirs = await setupArtifacts();

		await mkdir(paths.configDir, { recursive: true });
		await writeFile(
			paths.configFile,
			'sandbox_mode = "full"\n\n[model]\ndefault = "o3"\n',
		);

		await expectTaskRight(copyCodexSkills(pluginDirs, paths.skillsDir));

		const tomlPaths = pluginDirs.map((d) => join(d, "rp1-agents.toml"));
		const patch = await expectTaskRight(buildConfigPatch(tomlPaths));
		const existingConfig = await expectTaskRight(
			readCodexConfig(paths.configFile),
		);
		const newConfig = mergeCodexConfig(existingConfig, patch);
		await expectTaskRight(writeCodexConfig(paths.configFile, newConfig));

		const config = await readFile(paths.configFile, "utf-8");
		expect(config).toContain('sandbox_mode = "full"');
		expect(config).toContain('default = "o3"');
		expect(config).toContain("# rp1:start");

		await expectTaskRight(uninstallCodex(paths, false));

		const cleanedConfig = await readFile(paths.configFile, "utf-8");
		expect(cleanedConfig).toContain("sandbox_mode");
		expect(cleanedConfig).toContain('default = "o3"');
		expect(cleanedConfig).not.toContain("[agents.rp1-build]");
	});

	test("reinstall replaces old rp1 content", async () => {
		const pluginDirs = await setupArtifacts();

		await expectTaskRight(copyCodexSkills(pluginDirs, paths.skillsDir));
		const tomlPaths = pluginDirs.map((d) => join(d, "rp1-agents.toml"));
		const patch1 = await expectTaskRight(buildConfigPatch(tomlPaths));
		const existing1 = await expectTaskRight(readCodexConfig(paths.configFile));
		const config1 = mergeCodexConfig(existing1, patch1);
		await expectTaskRight(writeCodexConfig(paths.configFile, config1));

		const firstConfig = await readFile(paths.configFile, "utf-8");
		expect(firstConfig).toContain("# rp1:start");

		const backup = await expectTaskRight(backupCodexInstallation(paths));
		expect(backup).not.toBeNull();

		await expectTaskRight(copyCodexSkills(pluginDirs, paths.skillsDir));
		const patch2 = await expectTaskRight(buildConfigPatch(tomlPaths));
		const existing2 = await expectTaskRight(readCodexConfig(paths.configFile));
		const config2 = mergeCodexConfig(existing2, patch2);
		await expectTaskRight(writeCodexConfig(paths.configFile, config2));

		const secondConfig = await readFile(paths.configFile, "utf-8");
		const fenceCount = (secondConfig.match(/# rp1:start/g) || []).length;
		expect(fenceCount).toBe(1);
	});

	test("install with pre-existing non-rp1 skills preserves them", async () => {
		const pluginDirs = await setupArtifacts();

		await writeFixture(
			paths.skillsDir,
			"user-custom-skill/SKILL.md",
			"user skill content",
		);

		await expectTaskRight(copyCodexSkills(pluginDirs, paths.skillsDir));

		const entries = await readdir(paths.skillsDir);
		expect(entries).toContain("user-custom-skill");
		expect(entries).toContain("rp1-build");
		expect(entries).toContain("rp1-review");

		const userContent = await readFile(
			join(paths.skillsDir, "user-custom-skill", "SKILL.md"),
			"utf-8",
		);
		expect(userContent).toBe("user skill content");
	});
});
