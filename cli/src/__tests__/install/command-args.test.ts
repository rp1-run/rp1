import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { type CLIError, formatError } from "../../../shared/errors.js";
import type { Logger } from "../../../shared/logger.js";

type InstallCommandModule = typeof import("../../install/command.js");

const { executeInstall, executeVerify, parseInstallArgs } = (await import(
	`../../install/command.js?command-args-test=${Date.now()}`
)) as InstallCommandModule;

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

describe("install argument parsing", () => {
	const originalError = console.error;
	let errors: string[];

	beforeEach(() => {
		errors = [];
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
	});

	afterEach(() => {
		console.error = originalError;
	});

	test("supports positional and flag-based artifact paths", () => {
		expect(parseInstallArgs(["--artifacts-dir", "/tmp/artifacts"])).toEqual({
			artifactsDir: "/tmp/artifacts",
			dryRun: false,
			showHelp: false,
			yes: false,
			strict: false,
		});
		expect(parseInstallArgs(["-a", "/tmp/short"])).toMatchObject({
			artifactsDir: "/tmp/short",
		});
		expect(parseInstallArgs(["/tmp/positional", "--dry-run", "--yes"])).toEqual(
			{
				artifactsDir: "/tmp/positional",
				dryRun: true,
				showHelp: false,
				yes: true,
				strict: false,
			},
		);
	});

	test("tracks help, strict mode, and missing artifact path errors", () => {
		expect(parseInstallArgs(["--help"])).toMatchObject({
			showHelp: true,
		});
		expect(parseInstallArgs(["--strict", "-y"])).toMatchObject({
			strict: true,
			yes: true,
		});
		expect(parseInstallArgs(["--artifacts-dir"])).toMatchObject({
			showHelp: true,
		});
		expect(errors.at(-1)).toContain("--artifacts-dir requires a path");
	});

	test("executeInstall returns help success and missing-artifact usage errors", async () => {
		const helpResult = await executeInstall(["--help"], logger, {
			isTTY: false,
			skipPrompt: true,
		})();
		expect(E.isRight(helpResult)).toBe(true);

		const missingResult = await executeInstall(
			["--artifacts-dir", "/tmp/rp1-missing-artifacts-for-coverage"],
			logger,
			{
				isTTY: false,
				skipPrompt: true,
			},
		)();
		expect(E.isLeft(missingResult)).toBe(true);
		if (E.isLeft(missingResult)) {
			expect(formatError(missingResult.left as CLIError, false)).toContain(
				"Artifacts directory not found",
			);
		}
	});

	test("executeInstall validates prerequisites and reports dry-run artifact preview", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "rp1-install-dry-run-"));
		const originalHome = process.env.HOME;
		const originalPath = process.env.PATH;

		try {
			process.env.HOME = tempDir;
			const binDir = join(tempDir, "bin");
			const artifactsDir = join(tempDir, "artifacts");
			await mkdir(binDir, { recursive: true });
			await mkdir(artifactsDir, { recursive: true });
			await writeFile(
				join(binDir, "opencode"),
				"#!/usr/bin/env sh\necho 'opencode 1.0.0'\n",
				{ mode: 0o755 },
			);
			process.env.PATH = `${binDir}:${originalPath ?? ""}`;

			const result = await executeInstall([artifactsDir, "--dry-run"], logger, {
				isTTY: false,
				skipPrompt: true,
			})();

			expect(E.isRight(result)).toBe(true);
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("executeInstall installs manifest-backed artifacts into isolated OpenCode config", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "rp1-install-flow-"));
		const originalHome = process.env.HOME;
		const originalPath = process.env.PATH;

		try {
			process.env.HOME = tempDir;
			const binDir = join(tempDir, "bin");
			const artifactsDir = join(tempDir, "artifacts");
			await mkdir(binDir, { recursive: true });
			await writeFile(
				join(binDir, "opencode"),
				"#!/usr/bin/env sh\necho 'opencode 1.0.0'\n",
				{ mode: 0o755 },
			);
			process.env.PATH = `${binDir}:${originalPath ?? ""}`;

			for (const plugin of ["base", "dev"] as const) {
				const skillName = `rp1-${plugin}-skill`;
				const agentName = `rp1-${plugin}-agent`;
				await mkdir(join(artifactsDir, plugin, "skills", skillName), {
					recursive: true,
				});
				await mkdir(join(artifactsDir, plugin, "agents"), { recursive: true });
				await writeFile(
					join(artifactsDir, plugin, "skills", skillName, "SKILL.md"),
					`---
description: "${plugin} skill"
---

${plugin} skill body.
`,
				);
				await writeFile(
					join(artifactsDir, plugin, "agents", `${agentName}.md`),
					`---
description: "${plugin} agent"
---

${plugin} agent body.
`,
				);
				await writeFile(
					join(artifactsDir, plugin, "manifest.json"),
					JSON.stringify({
						plugin: `rp1-${plugin}`,
						version: "1.0.0",
						opencode_version_tested: "1.0.0",
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
			})();

			expect(E.isRight(result)).toBe(true);
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
			if (originalPath === undefined) {
				delete process.env.PATH;
			} else {
				process.env.PATH = originalPath;
			}
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	test("executeVerify reports a healthy isolated OpenCode installation", async () => {
		const tempDir = await mkdtemp(join(tmpdir(), "rp1-install-verify-"));
		const originalHome = process.env.HOME;

		try {
			process.env.HOME = tempDir;
			await mkdir(join(tempDir, ".config", "opencode", "agents"), {
				recursive: true,
			});
			await writeFile(
				join(tempDir, ".config", "opencode", "agents", "rp1-alpha.md"),
				"---\ndescription: Alpha agent\n---\n",
			);
			await mkdir(join(tempDir, ".config", "opencode", "skills", "rp1-alpha"), {
				recursive: true,
			});
			await writeFile(
				join(tempDir, ".config", "opencode", "skills", "rp1-alpha", "SKILL.md"),
				"---\ndescription: Alpha skill\n---\n",
			);
			await mkdir(join(tempDir, ".config", "opencode", "plugins"), {
				recursive: true,
			});
			await writeFile(
				join(tempDir, ".config", "opencode", "plugins", "rp1-base-hooks.ts"),
				"export default {};\n",
			);

			const result = await executeVerify([], logger)();

			expect(E.isRight(result)).toBe(true);
		} finally {
			if (originalHome === undefined) {
				delete process.env.HOME;
			} else {
				process.env.HOME = originalHome;
			}
			await rm(tempDir, { recursive: true, force: true });
		}
	});
});
