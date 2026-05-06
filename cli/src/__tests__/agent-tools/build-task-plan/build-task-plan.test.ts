import { afterEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	execute,
	planPathFor,
} from "../../../agent-tools/build-task-plan/index.js";
import type { BuildTaskPlanResult } from "../../../agent-tools/build-task-plan/models.js";
import { getTool } from "../../../agent-tools/index.js";
import type { ToolResult } from "../../../agent-tools/models.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

const mainPath = join(import.meta.dir, "..", "..", "..", "main.ts");

const taskPlan = (tasks: unknown[]): string =>
	JSON.stringify(
		{
			schema_version: 1,
			feature_id: "build-v2",
			tasks,
		},
		null,
		2,
	);

const codeTask = (
	id: string,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
	id,
	title: `Task ${id}`,
	type: "code",
	status: "pending",
	complexity: "simple",
	acceptance_refs: ["REQ-009"],
	dependencies: [],
	reference: "design.md#task-plan",
	target: "src/task.ts",
	...overrides,
});

const docTask = (
	id: string,
	overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
	id,
	title: `Task ${id}`,
	type: "docs",
	status: "pending",
	complexity: "simple",
	acceptance_refs: ["REQ-010"],
	dependencies: [],
	reference: "design.md#documentation-impact",
	target: "docs/reference/dev/build.md",
	...overrides,
});

const parseCliOutput = <T>(output: string): ToolResult<T> =>
	JSON.parse(output) as ToolResult<T>;

describe("build-task-plan", () => {
	let tempDirs: string[] = [];

	afterEach(async () => {
		for (const tempDir of tempDirs) {
			await rm(tempDir, { recursive: true, force: true });
		}
		tempDirs = [];
	});

	test("registers the build-task-plan tool", () => {
		expect(getTool("build-task-plan")?.description).toContain(
			"schema-backed tasks.json",
		);
	});

	test("resolves tasks.md to tasks.json and groups pending task units", async () => {
		const tempDir = await createTempDir("build-task-plan");
		tempDirs.push(tempDir);
		const featureDir = join(tempDir, "features", "build-v2");
		const tasksPath = await writeFixture(
			featureDir,
			"tasks.md",
			"- [ ] **T1**: human task\n",
		);
		await writeFixture(
			featureDir,
			"tasks.json",
			taskPlan([
				codeTask("T6"),
				codeTask("T7"),
				codeTask("T2", { dependencies: ["T1"] }),
				codeTask("T1"),
				codeTask("T3", { complexity: "complex", dependencies: ["T2"] }),
				codeTask("T4", { status: "completed" }),
				codeTask("T5", { status: "blocked" }),
				docTask("TD1", { dependencies: ["T2"] }),
			]),
		);

		const result = await expectTaskRight(
			execute(
				JSON.stringify({
					tasks_path: tasksPath,
					max_simple_batch: 2,
					complex_isolated: true,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(result.success).toBe(true);
		expect(result.data?.plan_path).toBe(join(featureDir, "tasks.json"));
		expect(result.data?.implementation_tasks.map((task) => task.id)).toEqual([
			"T6",
			"T7",
			"T1",
			"T2",
			"T3",
		]);
		expect(result.data?.documentation_tasks.map((task) => task.id)).toEqual([
			"TD1",
		]);
		expect(result.data?.task_units).toEqual([
			{
				unit_id: 1,
				task_ids: ["T6", "T7"],
				complexity: "simple",
				depends_on: [],
			},
			{
				unit_id: 2,
				task_ids: ["T1"],
				complexity: "simple",
				depends_on: [],
			},
			{
				unit_id: 3,
				task_ids: ["T2"],
				complexity: "simple",
				depends_on: ["T1"],
			},
			{
				unit_id: 4,
				task_ids: ["T3"],
				complexity: "complex",
				depends_on: ["T2"],
			},
		]);
		expect(result.data?.summary).toMatchObject({
			total_tasks: 8,
			pending: 6,
			completed: 1,
			blocked: 1,
			implementation_pending: 5,
			documentation_pending: 1,
			total_units: 4,
		});
		expect(result.data?.warnings).toEqual([
			`Resolved machine task plan sidecar from "${tasksPath}" to "${join(featureDir, "tasks.json")}".`,
		]);
	});

	test("does not fall back to parsing markdown when tasks.json is missing", async () => {
		const tempDir = await createTempDir("build-task-plan-no-json");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.md",
			"- [ ] **T1**: markdown-only task `[complexity:simple]`\n",
		);

		const error = await expectTaskLeft(
			execute(JSON.stringify({ tasks_path: tasksPath }), {
				inputSource: "stdin",
			}),
		);

		expect(error._tag).toBe("NotFoundError");
		expect(planPathFor(tasksPath)).toBe(
			join(tempDir, "features", "build-v2", "tasks.json"),
		);
	});

	test("returns schema errors for malformed task rows", async () => {
		const tempDir = await createTempDir("build-task-plan-schema");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.json",
			taskPlan([
				{
					id: "T1",
					title: "Missing fields",
					type: "code",
					status: "pending",
					complexity: "tiny",
					acceptance_refs: ["REQ-009"],
					dependencies: [],
				},
				codeTask("T2", { dependencies: ["T404"] }),
			]),
		);

		const result = await expectTaskRight(
			execute(JSON.stringify({ tasks_path: tasksPath }), {
				inputSource: "stdin",
			}),
		);

		expect(result.success).toBe(false);
		expect(result.errors?.map((error) => error.message)).toEqual([
			'Task at index 0 has invalid "complexity". Expected one of: simple, medium, complex.',
			'Task at index 0 must include non-empty "target".',
			'Task "T2" depends on unknown task "T404".',
		]);
	});

	test("excludes pending code tasks whose prerequisites are blocked", async () => {
		const tempDir = await createTempDir("build-task-plan-blocked-deps");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.json",
			taskPlan([
				codeTask("T1", { status: "blocked" }),
				codeTask("T2", { dependencies: ["T1"] }),
				codeTask("T3"),
			]),
		);

		const result = await expectTaskRight(
			execute(JSON.stringify({ tasks_path: tasksPath }), {
				inputSource: "stdin",
			}),
		);

		expect(result.success).toBe(true);
		expect(result.data?.implementation_tasks.map((task) => task.id)).toEqual([
			"T3",
		]);
		expect(result.data?.task_units.map((unit) => unit.task_ids)).toEqual([
			["T3"],
		]);
		expect(result.data?.warnings).toContain(
			'Task "T2" is pending but blocked by prerequisite: T1',
		);
		expect(result.data?.summary.skipped_blocked).toBe(2);
	});

	test("allows non-isolated complex tasks to share independent batches", async () => {
		const tempDir = await createTempDir("build-task-plan-complex-batch");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.json",
			taskPlan([
				codeTask("T1"),
				codeTask("T2", { complexity: "complex" }),
				codeTask("T3"),
			]),
		);

		const result = await expectTaskRight(
			execute(
				JSON.stringify({
					tasks_path: tasksPath,
					max_simple_batch: 3,
					complex_isolated: false,
				}),
				{ inputSource: "stdin" },
			),
		);

		expect(result.success).toBe(true);
		expect(result.data?.task_units).toEqual([
			{
				unit_id: 1,
				task_ids: ["T1", "T2", "T3"],
				complexity: "complex",
				depends_on: [],
			},
		]);
	});

	test("accepts CLI flags for task path and grouping options", async () => {
		const tempDir = await createTempDir("build-task-plan-cli");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.json",
			taskPlan([codeTask("T1"), codeTask("T2")]),
		);

		const proc = Bun.spawn(
			[
				process.execPath,
				mainPath,
				"agent-tools",
				"build-task-plan",
				"--tasks-path",
				tasksPath,
				"--max-simple-batch",
				"1",
				"--complex-isolated",
				"true",
			],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stdout, stderr] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const output = parseCliOutput<BuildTaskPlanResult | null>(stdout);

		expect(exitCode).toBe(0);
		expect(stderr).toBe("");
		expect(output.success).toBe(true);
		expect(output.data?.task_units.map((unit) => unit.task_ids)).toEqual([
			["T1"],
			["T2"],
		]);
	});

	test("rejects invalid CLI numeric flags instead of defaulting them", async () => {
		const tempDir = await createTempDir("build-task-plan-cli-invalid");
		tempDirs.push(tempDir);
		const tasksPath = await writeFixture(
			tempDir,
			"features/build-v2/tasks.json",
			taskPlan([codeTask("T1")]),
		);

		const proc = Bun.spawn(
			[
				process.execPath,
				mainPath,
				"agent-tools",
				"build-task-plan",
				"--tasks-path",
				tasksPath,
				"--max-simple-batch",
				"abc",
			],
			{
				stdout: "pipe",
				stderr: "pipe",
			},
		);
		const [exitCode, stdout] = await Promise.all([
			proc.exited,
			new Response(proc.stdout).text(),
			new Response(proc.stderr).text(),
		]);
		const output = parseCliOutput<null>(stdout);

		expect(exitCode).toBe(1);
		expect(output.success).toBe(false);
		expect(output.errors?.[0]?.message).toContain('Invalid "max_simple_batch"');
	});
});
