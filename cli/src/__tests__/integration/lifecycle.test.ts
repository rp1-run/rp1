/**
 * Integration tests for full plugin lifecycle: build → install → verify.
 * Tests end-to-end workflow with real filesystem operations.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import {
	generateAgentFile,
	generateCommandFile,
	generateManifest,
} from "../../build/generator.js";
import { parseAgent, parseCommand } from "../../build/parser.js";
import { defaultRegistry } from "../../build/registry.js";
import {
	transformAgent,
	transformCommand,
} from "../../build/transformations.js";
import { copyArtifacts } from "../../install/installer.js";
import {
	cleanupTempDir,
	createTempDir,
	getFixturePath,
	writeFixture,
} from "../helpers/index.js";

describe("integration: lifecycle", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await createTempDir("lifecycle-");
	});

	afterEach(async () => {
		await cleanupTempDir(tempDir);
	});

	test(
		"command full lifecycle: parse → transform → generate → write → verify",
		async () => {
			// 1. Parse command from fixture
			const commandPath = getFixturePath(
				"valid-plugin",
				"commands/sample-command.md",
			);
			const parseResult = await parseCommand(commandPath)();

			expect(E.isRight(parseResult)).toBe(true);
			if (!E.isRight(parseResult)) return;
			const cmd = parseResult.right;

			expect(cmd.name).toBe("sample-command");
			expect(cmd.description).toBeDefined();

			// 2. Transform to OpenCode format
			const transformResult = transformCommand(cmd, defaultRegistry);

			expect(E.isRight(transformResult)).toBe(true);
			if (!E.isRight(transformResult)) return;
			const ocCmd = transformResult.right;

			// 3. Generate output file
			const generateResult = generateCommandFile(ocCmd, cmd.name);

			expect(E.isRight(generateResult)).toBe(true);
			if (!E.isRight(generateResult)) return;
			const { filename, content } = generateResult.right;

			expect(filename).toBe("sample-command.md");
			expect(content).toContain("---");
			expect(content).toContain("description:");

			// 4. Write to temp dir
			const outputPath = join(tempDir, filename);
			await writeFile(outputPath, content);

			// 5. Verify output is valid
			const writtenContent = await readFile(outputPath, "utf-8");
			expect(writtenContent).toContain("---");
			// Should have frontmatter structure
			const parts = writtenContent.split("---");
			expect(parts.length).toBeGreaterThanOrEqual(3);
		},
		{ timeout: 60000 },
	);

	test(
		"agent full lifecycle: parse → transform → generate → write → verify",
		async () => {
			// 1. Parse agent from fixture
			const agentPath = getFixturePath(
				"valid-plugin",
				"agents/sample-agent.md",
			);
			const parseResult = await parseAgent(agentPath)();

			expect(E.isRight(parseResult)).toBe(true);
			if (!E.isRight(parseResult)) return;
			const agent = parseResult.right;

			expect(agent.name).toBe("sample-agent");
			expect(agent.description).toBeDefined();
			expect(Array.isArray(agent.tools)).toBe(true);

			// 2. Transform to OpenCode format
			const transformResult = transformAgent(agent, defaultRegistry);

			expect(E.isRight(transformResult)).toBe(true);
			if (!E.isRight(transformResult)) return;
			const ocAgent = transformResult.right;

			expect(ocAgent.mode).toBe("subagent");

			// 3. Generate output file
			const generateResult = generateAgentFile(ocAgent);

			expect(E.isRight(generateResult)).toBe(true);
			if (!E.isRight(generateResult)) return;
			const { filename, content } = generateResult.right;

			expect(filename).toBe("sample-agent.md");
			expect(content).toContain("mode: subagent");
			expect(content).toContain("tools:");

			// 4. Write to temp dir
			const outputPath = join(tempDir, filename);
			await writeFile(outputPath, content);

			// 5. Verify output structure
			const writtenContent = await readFile(outputPath, "utf-8");
			expect(writtenContent).toContain("---");
			expect(writtenContent).toContain("mode: subagent");
		},
		{ timeout: 60000 },
	);

	test(
		"build output directory structure matches expected layout",
		async () => {
			// Set up a mock build output directory
			const buildDir = join(tempDir, "build-output");

			// Create expected structure: command/, agent/, skill/
			await writeFixture(
				buildDir,
				"command/rp1-base/test-command.md",
				"---\ndescription: Test\n---\nContent",
			);
			await writeFixture(
				buildDir,
				"agent/rp1-base/test-agent.md",
				"---\ndescription: Test\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nContent",
			);
			await writeFixture(
				buildDir,
				"skill/test-skill/SKILL.md",
				"---\nname: test-skill\ndescription: A test skill for testing\n---\nContent",
			);

			// Verify directory structure
			const entries = await readdir(buildDir);
			expect(entries).toContain("command");
			expect(entries).toContain("agent");
			expect(entries).toContain("skill");

			// Verify subdirectory contents
			const commandEntries = await readdir(join(buildDir, "command"));
			expect(commandEntries).toContain("rp1-base");

			const agentEntries = await readdir(join(buildDir, "agent"));
			expect(agentEntries).toContain("rp1-base");

			const skillEntries = await readdir(join(buildDir, "skill"));
			expect(skillEntries).toContain("test-skill");
		},
		{ timeout: 60000 },
	);

	test(
		"generated manifest.json lists all artifacts correctly",
		async () => {
			const commands = ["cmd1", "cmd2", "cmd3"];
			const agents = ["agent1", "agent2"];
			const skills = ["skill1"];

			const manifestResult = generateManifest(
				"test-plugin",
				"1.0.0",
				commands,
				agents,
				skills,
			);

			expect(E.isRight(manifestResult)).toBe(true);
			if (!E.isRight(manifestResult)) return;

			const manifestJson = JSON.parse(manifestResult.right);

			expect(manifestJson.plugin).toBe("test-plugin");
			expect(manifestJson.version).toBe("1.0.0");
			expect(manifestJson.artifacts.commands).toEqual(commands);
			expect(manifestJson.artifacts.agents).toEqual(agents);
			expect(manifestJson.artifacts.skills).toEqual(skills);
			expect(manifestJson.requirements.opencodeVersion).toBe(">=0.8.0");

			// Write manifest and verify round-trip
			const manifestPath = join(tempDir, "manifest.json");
			await writeFile(manifestPath, manifestResult.right);

			const readManifest = JSON.parse(await readFile(manifestPath, "utf-8"));
			expect(readManifest.plugin).toBe("test-plugin");
		},
		{ timeout: 60000 },
	);

	test(
		"full build→install cycle copies artifacts to target",
		async () => {
			const sourceDir = join(tempDir, "source");
			const targetDir = join(tempDir, "target");

			// Set up source with all artifact types
			await writeFixture(
				sourceDir,
				"command/rp1-base/lifecycle-cmd.md",
				"---\ndescription: Lifecycle test command\n---\nCommand body",
			);
			await writeFixture(
				sourceDir,
				"agent/rp1-base/lifecycle-agent.md",
				"---\ndescription: Lifecycle test agent\nmode: subagent\ntools:\n  bash: true\n  write: false\n  edit: false\n---\nAgent body",
			);
			await writeFixture(
				sourceDir,
				"skill/lifecycle-skill/SKILL.md",
				"---\nname: lifecycle-skill\ndescription: Lifecycle test skill here\n---\nSkill body",
			);

			// Install artifacts
			const installResult = await copyArtifacts(sourceDir, targetDir)();

			expect(E.isRight(installResult)).toBe(true);
			if (!E.isRight(installResult)) return;

			const filesCopied = installResult.right;
			expect(filesCopied).toBe(3);

			// Verify all artifacts exist in target
			const cmdStat = await stat(
				join(targetDir, "command/rp1-base/lifecycle-cmd.md"),
			);
			expect(cmdStat.isFile()).toBe(true);

			const agentStat = await stat(
				join(targetDir, "agent/rp1-base/lifecycle-agent.md"),
			);
			expect(agentStat.isFile()).toBe(true);

			const skillStat = await stat(
				join(targetDir, "skill/lifecycle-skill/SKILL.md"),
			);
			expect(skillStat.isFile()).toBe(true);

			// Verify content integrity
			const cmdContent = await readFile(
				join(targetDir, "command/rp1-base/lifecycle-cmd.md"),
				"utf-8",
			);
			expect(cmdContent).toContain("Lifecycle test command");
		},
		{ timeout: 60000 },
	);
});
