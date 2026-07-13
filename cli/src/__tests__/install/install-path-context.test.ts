import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import type { Logger } from "../../../shared/logger.js";
import { executeInstall } from "../../install/command.js";
import { installRp1 } from "../../install/installer.js";
import { resolveInstallPathContext } from "../../install/paths.js";

const logger: Logger = {
	trace: () => {},
	debug: () => {},
	info: () => {},
	warn: () => {},
	error: () => {},
	start: () => {},
	success: () => {},
	fail: () => {},
	box: () => {},
};

const writeFixture = async (
	root: string,
	relativePath: string,
	content: string,
): Promise<void> => {
	const target = join(root, relativePath);
	await mkdir(dirname(target), { recursive: true });
	await writeFile(target, content);
};

describe("OpenCode install path context", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-install-paths-"));
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("retains one isolated home through rollback", async () => {
		const isolatedHome = join(tempDir, "home");
		const pluginDir = join(tempDir, "plugin");
		const paths = resolveInstallPathContext({ homeDir: isolatedHome });

		await writeFixture(
			isolatedHome,
			".config/opencode/agents/rp1-base-existing.md",
			"original",
		);
		await writeFixture(pluginDir, "agents/rp1-base-partial.md", "partial");

		const result = await installRp1(
			[pluginDir],
			undefined,
			undefined,
			undefined,
			true,
			paths,
		)();

		expect(E.isLeft(result)).toBe(true);
		expect(
			await readFile(
				join(paths.openCodeConfigDir, "agents", "rp1-base-existing.md"),
				"utf-8",
			),
		).toBe("original");
		expect(
			await stat(join(paths.openCodeConfigDir, "agents", "rp1-base-partial.md"))
				.then(() => true)
				.catch(() => false),
		).toBe(false);
		expect(paths.backupDir.startsWith(isolatedHome)).toBe(true);
	});

	test("retains one isolated home through successful command installation", async () => {
		const isolatedHome = join(tempDir, "home");
		const artifactsDir = join(tempDir, "artifacts");
		const binDir = join(tempDir, "bin");
		const originalPath = process.env.PATH;

		await mkdir(binDir, { recursive: true });
		await writeFile(
			join(binDir, "opencode"),
			"#!/usr/bin/env sh\necho 'opencode 1.0.0'\n",
			{ mode: 0o755 },
		);
		process.env.PATH = `${binDir}:${originalPath ?? ""}`;

		try {
			for (const plugin of ["base", "dev"] as const) {
				const skillName = `rp1-${plugin}-skill`;
				const agentName = `rp1-${plugin}-agent`;
				const pluginDir = join(artifactsDir, plugin);

				await writeFixture(
					pluginDir,
					`skills/${skillName}/SKILL.md`,
					`---\ndescription: "${plugin} skill"\n---\n`,
				);
				await writeFixture(
					pluginDir,
					`agents/${agentName}.md`,
					`---\ndescription: "${plugin} agent"\n---\n`,
				);
				if (plugin === "base") {
					await writeFixture(
						pluginDir,
						"platforms/opencode/index.ts",
						"export default {};\n",
					);
				}
				await writeFixture(
					pluginDir,
					"manifest.json",
					JSON.stringify({
						plugin: `rp1-${plugin}`,
						version: "1.0.0",
						opencode_version_tested: "1.0.0",
						hasOpenCodePlugin: plugin === "base",
						artifacts: {
							commands: [],
							agents: [agentName],
							skills: [skillName],
						},
					}),
				);
			}

			const result = await executeInstall([artifactsDir, "--yes"], logger, {
				isTTY: false,
				skipPrompt: true,
				homeDir: isolatedHome,
			})();

			expect(E.isRight(result)).toBe(true);
			expect(
				await readFile(
					join(isolatedHome, ".config/opencode/agents/rp1-base-agent.md"),
					"utf-8",
				),
			).toContain("base agent");
			expect(
				await readFile(
					join(isolatedHome, ".rp1/platform-versions.json"),
					"utf-8",
				),
			).toContain('"opencode"');
		} finally {
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
		}
	});

	test("preserves production paths when no home is supplied", () => {
		const paths = resolveInstallPathContext();

		expect(paths.homeDir).toBe(homedir());
		expect(paths.openCodeConfigDir).toBe(
			join(homedir(), ".config", "opencode"),
		);
		expect(paths.backupDir).toBe(join(homedir(), ".opencode-rp1-backups"));
		expect(paths.stagingDir).toBe(join(homedir(), ".config", ".rp1-staging"));
	});
});
