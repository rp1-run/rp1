import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	fakeCommand,
	parseWorkflowName,
	resolveArtifactPaths,
} from "../../commands/fake.js";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

describe("fake workflow command", () => {
	const originalExit = process.exit;
	const originalError = console.error;
	const originalLog = console.log;
	const originalCwd = process.cwd();
	let errors: string[];
	let logs: string[];
	let tempDir: string | undefined;

	beforeEach(() => {
		errors = [];
		logs = [];
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
	});

	afterEach(async () => {
		process.chdir(originalCwd);
		console.error = originalError;
		console.log = originalLog;
		process.exit = originalExit;
		delete process.env.RP1_DB;
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
			tempDir = undefined;
		}
	});

	test("pure helpers parse workflow names and resolve work artifact paths", () => {
		expect(parseWorkflowName(" /build 'demo feature' ")).toBe("build");
		expect(parseWorkflowName("pr-review 123")).toBe("pr-review");
		expect(resolveArtifactPaths("/work", "demo-feature", "design.md")).toEqual({
			artifactPath: join("features", "demo-feature", "design.md"),
			fullDir: join("/work", "features", "demo-feature"),
		});
	});

	test("rejects invalid speed before loading state machine data", async () => {
		fakeCommand.exitOverride();

		await expect(
			fakeCommand.parseAsync(["node", "fake", "/build", "--speed", "warp"]),
		).rejects.toMatchObject({ code: 1 });

		expect(errors.at(-1)).toContain("Invalid speed");
	});

	test("runs a fast fake workflow with artifact and subflow events in an isolated project", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-fake-command-"));
		const rp1Dir = join(tempDir, ".rp1");
		await mkdir(join(rp1Dir, "work"), { recursive: true });
		await writeFile(join(rp1Dir, "project_id"), crypto.randomUUID());
		process.env.RP1_DB = join(tempDir, "events.db");
		process.chdir(tempDir);

		fakeCommand.exitOverride();
		await fakeCommand.parseAsync([
			"node",
			"fake",
			"/build 'coverage repair'",
			"--speed",
			"fast",
			"--feature",
			"coverage-repair",
			"--pause-at",
			"build",
			"--with-btw",
			"--with-artifacts",
			"--with-subflows",
		]);

		const output = logs.join("\n");
		expect(output).toContain('Simulating workflow "build"');
		expect(output).toContain("Simulation paused");
		await expect(
			stat(
				join(rp1Dir, "work", "features", "coverage-repair", "requirements.md"),
			),
		).resolves.toBeDefined();
	});
});
