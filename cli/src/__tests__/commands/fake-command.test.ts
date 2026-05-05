import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
	mkdir,
	mkdtemp,
	readFile,
	rm,
	stat,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { closeDatabase } from "../../agent-tools/emit/database.js";
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

	const createIsolatedProject = async (): Promise<string> => {
		closeDatabase();
		tempDir = await mkdtemp(join(tmpdir(), "rp1-fake-command-"));
		const rp1Dir = join(tempDir, ".rp1");
		await mkdir(join(rp1Dir, "work"), { recursive: true });
		await writeFile(join(rp1Dir, "project_id"), crypto.randomUUID());
		process.env.RP1_DB = join(tempDir, "events.db");
		process.chdir(tempDir);
		return rp1Dir;
	};

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
		closeDatabase();
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

	test(
		"runs a fast fake workflow with artifact and subflow events in an isolated project",
		async () => {
			const rp1Dir = await createIsolatedProject();

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
				"implementation",
				"--with-btw",
				"--with-artifacts",
				"--with-subflows",
			]);

			const output = logs.join("\n");
			expect(output).toContain('Simulating workflow "build"');
			expect(output).toContain("Simulation paused");
			await expect(
				stat(
					join(
						rp1Dir,
						"work",
						"features",
						"coverage-repair",
						"requirements.md",
					),
				),
			).resolves.toBeDefined();
		},
		{ timeout: 10000 },
	);

	test(
		"runs a complete Build v2 fake workflow and writes phase artifacts",
		async () => {
			const rp1Dir = await createIsolatedProject();

			fakeCommand.exitOverride();
			await fakeCommand.parseAsync([
				"node",
				"fake",
				"/build 'complete coverage repair'",
				"--speed",
				"fast",
				"--feature",
				"complete-repair",
				"--with-btw",
				"--with-artifacts",
				"--with-subflows",
			]);

			const featureDir = join(rp1Dir, "work", "features", "complete-repair");
			await expect(
				readFile(join(featureDir, "requirements.md"), "utf-8"),
			).resolves.toContain("# Fake Requirements Artifact");
			await expect(
				readFile(join(featureDir, "design.md"), "utf-8"),
			).resolves.toContain("# Fake Design Artifact");
			await expect(
				readFile(join(featureDir, "build-report.md"), "utf-8"),
			).resolves.toContain("# Fake Build Report");
			await expect(
				readFile(join(featureDir, "verify-report.md"), "utf-8"),
			).resolves.toContain("# Fake Verification Report");

			const output = logs.join("\n");
			expect(output).toContain("Simulation complete");
			expect(output).toContain("[4/4] release");
		},
		{ timeout: 10000 },
	);

	test(
		"supports injected failure and concurrent pause simulations",
		async () => {
			await createIsolatedProject();

			fakeCommand.exitOverride();
			await fakeCommand.parseAsync([
				"node",
				"fake",
				"/build 'failure coverage repair'",
				"--speed",
				"fast",
				"--feature",
				"failure-repair",
				"--fail-at",
				"planning",
			]);

			await fakeCommand.parseAsync([
				"node",
				"fake",
				"/build 'parallel coverage repair'",
				"--speed",
				"fast",
				"--feature",
				"parallel-repair",
				"--pause-at",
				"requirements",
				"--count",
				"2",
			]);

			const output = logs.join("\n");
			expect(output).toContain('Simulation failed at step "planning"');
			expect(output).toContain("All runs finished");
			expect(output).toContain("2/2 succeeded");
		},
		{ timeout: 10000 },
	);

	test("rejects unknown workflows and invalid Build v2 steps", async () => {
		fakeCommand.exitOverride();

		await expect(
			fakeCommand.parseAsync(["node", "fake", "/missing-workflow"]),
		).rejects.toMatchObject({ code: 1 });
		expect(errors.at(-1)).toContain(
			"Ensure a ## STATE-MACHINE section with a stateDiagram-v2 block exists",
		);

		errors = [];
		await expect(
			fakeCommand.parseAsync([
				"node",
				"fake",
				"/build 'bad step'",
				"--fail-at",
				"build",
			]),
		).rejects.toMatchObject({ code: 1 });
		expect(errors.at(-1)).toContain(
			"Valid steps: requirements, planning, implementation, release",
		);
	});

	test("rejects empty workflow names", async () => {
		fakeCommand.exitOverride();

		await expect(
			fakeCommand.parseAsync(["node", "fake", "/"]),
		).rejects.toMatchObject({ code: 1 });
		expect(errors.at(-1)).toContain(
			"Could not extract workflow name from command string",
		);
	});
});
