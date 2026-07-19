import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { closeDatabase } from "../../agent-tools/emit/database.js";

class ProcessExit extends Error {
	readonly code: number;

	constructor(code: number | string | null | undefined) {
		super(`process.exit(${code ?? 0})`);
		this.code = Number(code ?? 0);
	}
}

describe("agent-tools command adapter", () => {
	const originalExit = process.exit;
	const originalLog = console.log;
	const originalError = console.error;
	let dbPath: string;
	let tempDir: string;
	let logs: string[];
	let errors: string[];

	beforeEach(() => {
		tempDir = "";
		dbPath = join(
			tmpdir(),
			`rp1-agent-tools-command-${Date.now()}-${Math.random()}.db`,
		);
		process.env.RP1_DB = dbPath;
		logs = [];
		errors = [];
		process.exit = ((code?: number | string | null) => {
			throw new ProcessExit(code);
		}) as typeof process.exit;
		console.log = (...args: unknown[]) => {
			logs.push(args.map(String).join(" "));
		};
		console.error = (...args: unknown[]) => {
			errors.push(args.map(String).join(" "));
		};
	});

	afterEach(async () => {
		process.exit = originalExit;
		console.log = originalLog;
		console.error = originalError;
		closeDatabase();
		delete process.env.RP1_DB;
		await rm(dbPath, { force: true });
		await rm(`${dbPath}-wal`, { force: true });
		await rm(`${dbPath}-shm`, { force: true });
		if (tempDir) {
			await rm(tempDir, { recursive: true, force: true });
		}
	});

	const runCommand = async (args: readonly string[]) => {
		const { agentToolsCommand } = await import("../../agent-tools/command.js");
		agentToolsCommand.exitOverride();
		return agentToolsCommand.parseAsync(["node", "agent-tools", ...args]);
	};

	const expectExit = async (
		args: readonly string[],
		code: number,
	): Promise<void> => {
		await expect(runCommand(args)).rejects.toMatchObject({ code });
	};

	const lastOutput = <T>(): T => {
		const raw = logs.at(-1);
		if (!raw) {
			throw new Error("No command output captured");
		}
		return JSON.parse(raw) as T;
	};

	const createProject = async (): Promise<string> => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-command-adapter-"));
		await mkdir(join(tempDir, ".rp1"), { recursive: true });
		await writeFile(
			join(tempDir, ".rp1", "project_id"),
			"550e8400-e29b-41d4-a716-446655440000\n",
		);
		return tempDir;
	};

	test("mmd-validate rejects invalid timeout values with a JSON error", async () => {
		await expectExit(["mmd-validate", "--timeout", "0"], 1);

		expect(errors.at(-1)).toContain("Invalid timeout value");
	});

	test("mmd-validate and rp1-root-dir return successful JSON payloads", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-command-adapter-"));
		const diagramPath = join(tempDir, "diagram.md");
		await writeFile(diagramPath, "# Document without diagrams\n");

		await expectExit(["mmd-validate", diagramPath], 0);
		const validation = lastOutput<{
			success: boolean;
			data: { summary: { total: number; valid: number; invalid: number } };
		}>();
		expect(validation.success).toBe(true);
		expect(validation.data.summary).toMatchObject({
			total: 0,
			valid: 0,
			invalid: 0,
		});

		await expectExit(["rp1-root-dir"], 0);
		const roots = lastOutput<{
			success: boolean;
			data: { projectRoot: string; workRoot: string };
		}>();
		expect(roots.success).toBe(true);
		expect(roots.data.projectRoot).toBe(resolve(".."));
		expect(roots.data.workRoot).toContain(".rp1/work");
	});

	test("resolve-args and workflow-bootstrap resolve generated workflow inputs", async () => {
		const projectRoot = resolve("..");
		const schemaPath = join(projectRoot, "plugins/dev/skills/build/SKILL.md");

		await expectExit(
			[
				"resolve-args",
				"--schema-path",
				schemaPath,
				"--args",
				"coverage-feature --afk",
				"--project-root",
				projectRoot,
			],
			0,
		);
		const resolved = lastOutput<{
			success: boolean;
			data: { arguments: { FEATURE_ID: string; AFK: boolean } };
		}>();
		expect(resolved.success).toBe(true);
		expect(resolved.data.arguments).toMatchObject({
			FEATURE_ID: "coverage-feature",
			AFK: true,
		});

		await expectExit(
			[
				"workflow-bootstrap",
				"--name",
				"build",
				"--schema-path",
				schemaPath,
				"--args",
				"coverage-feature --afk",
				"--project-root",
				projectRoot,
				"--harness",
				"codex",
			],
			0,
		);
		const bootstrap = lastOutput<{
			success: boolean;
			data: { workflow: { name: string }; run: { runId: string } };
		}>();
		expect(bootstrap.success).toBe(true);
		expect(bootstrap.data.workflow.name).toBe("build");
		expect(bootstrap.data.run.runId).toBeTruthy();
	});

	test("emit rejects invalid event options before touching the event store", async () => {
		await expectExit(
			[
				"emit",
				"--type",
				"not-real",
				"--run-id",
				"run-1",
				"--workflow",
				"build",
				"--data",
				"{}",
			],
			1,
		);

		expect(errors.at(-1)).toContain("Invalid event type");
	});

	test("emit and resume-run operate on an isolated project event store", async () => {
		const projectRoot = await createProject();
		const runId = "550e8400-e29b-41d4-a716-446655440001";

		await expectExit(
			[
				"emit",
				"--type",
				"status_change",
				"--run-id",
				runId,
				"--workflow",
				"build",
				"--step",
				"task-builder:building",
				"--unit",
				"coverage-task",
				"--data",
				'{"status":"running","feature":"coverage-feature"}',
				"--project",
				projectRoot,
				"--harness",
				"codex",
			],
			0,
		);
		const emitted = lastOutput<{
			success: boolean;
			data: { runId: string; type: string; runStatus: string };
		}>();
		expect(emitted.success).toBe(true);
		expect(emitted.data).toMatchObject({
			runId,
			type: "status_change",
			runStatus: "running",
		});

		await expectExit(
			[
				"emit",
				"--type",
				"status_change",
				"--run-id",
				runId,
				"--workflow",
				"build",
				"resume-run",
				"--feature",
				"coverage-feature",
				"--flow",
				"build",
				"--project",
				projectRoot,
			],
			0,
		);
		const resumed = lastOutput<{
			data: { flow: string; featureId: string; runId: string };
		}>();
		expect(resumed.data).toMatchObject({
			flow: "build",
			featureId: "coverage-feature",
		});
		expect(resumed.data.runId).toBeTruthy();
	});

	test("feedback read validates run IDs before querying annotations", async () => {
		await expectExit(
			["feedback", "read", "--run-id", "   ", "--status", "open"],
			1,
		);

		expect(errors.at(-1)).toContain("run-id");
	});

	test("task commands create, list, pickup, complete, and get queue records", async () => {
		await expectExit(
			[
				"task",
				"create",
				"--type",
				"verify",
				"--description",
				"Run verification",
				"--payload",
				'{"scope":"focused"}',
			],
			0,
		);
		const created = lastOutput<{ data: { id: number; status: string } }>();
		expect(created.data.status).toBe("pending");

		await expectExit(
			["task", "list", "--status", "pending", "--limit", "5"],
			0,
		);
		const listed = lastOutput<{ data: Array<{ id: number }> }>();
		expect(listed.data.map((task) => task.id)).toContain(created.data.id);

		await expectExit(["task", "pickup"], 0);
		const picked = lastOutput<{ data: { id: number; status: string } }>();
		expect(picked.data.id).toBe(created.data.id);
		expect(picked.data.status).toBe("in_progress");

		await expectExit(
			["task", "complete", "--id", String(created.data.id), "--result", "ok"],
			0,
		);
		const completed = lastOutput<{
			data: { result: string; status: string };
		}>();
		expect(completed.data).toMatchObject({
			status: "completed",
			result: "ok",
		});

		await expectExit(["task", "get", "--id", String(created.data.id)], 0);
		const fetched = lastOutput<{ data: { id: number; status: string } }>();
		expect(fetched.data).toMatchObject({
			id: created.data.id,
			status: "completed",
		});
	});

	test("task fail and cancel transition queued records through command adapters", async () => {
		await expectExit(
			[
				"task",
				"create",
				"--type",
				"review",
				"--description",
				"Review coverage findings",
			],
			0,
		);
		const taskToFail = lastOutput<{ data: { id: number } }>().data.id;

		await expectExit(["task", "pickup"], 0);
		await expectExit(
			["task", "fail", "--id", String(taskToFail), "--result", "blocked"],
			0,
		);
		const failed = lastOutput<{ data: { id: number; status: string } }>();
		expect(failed.data).toMatchObject({
			id: taskToFail,
			status: "failed",
		});

		await expectExit(
			[
				"task",
				"create",
				"--type",
				"archive",
				"--description",
				"Archive unused queued work",
			],
			0,
		);
		const taskToCancel = lastOutput<{ data: { id: number } }>().data.id;

		await expectExit(["task", "cancel", "--id", String(taskToCancel)], 0);
		const cancelled = lastOutput<{ data: { id: number; status: string } }>();
		expect(cancelled.data).toMatchObject({
			id: taskToCancel,
			status: "cancelled",
		});
	});

	test("task fail and cancel validate positive integer IDs", async () => {
		await expectExit(["task", "fail", "--id", "0"], 1);
		expect(errors.at(-1)).toContain("Invalid --id value");

		await expectExit(["task", "cancel", "--id", "-1"], 1);
		expect(errors.at(-1)).toContain("Invalid --id value");

		await expectExit(["task", "list", "--limit", "not-a-number"], 1);
		expect(errors.at(-1)).toContain("Invalid --limit value");
	});

	test("feedback write commands validate IDs and content before database writes", async () => {
		await expectExit(["feedback", "resolve", "0"], 1);
		expect(errors.at(-1)).toContain("annotation ID");

		await expectExit(["feedback", "reply", "42", "--content", "   "], 1);
		expect(errors.at(-1)).toContain("content");

		await expectExit(["feedback", "accept-edit", "   "], 1);
		expect(errors.at(-1)).toContain("doc-id");
	});

	test("socratic-duel commands surface validation failures as JSON errors", async () => {
		await expectExit(["socratic-duel", "status"], 1);
		expect(errors.at(-1)).toContain("socratic-duel");

		await expectExit(
			[
				"socratic-duel",
				"join",
				"--target",
				"relative.md",
				"--participant-name",
				"codex",
				"--harness",
				"codex",
			],
			1,
		);
		expect(errors.at(-1)).toContain("socratic-duel");

		await expectExit(
			[
				"socratic-duel",
				"refresh-lock",
				"--duel-id",
				"missing",
				"--participant-id",
				"p1",
				"--lease-token",
				"token",
			],
			1,
		);
		expect(errors.at(-1)).toContain("socratic-duel");

		await expectExit(
			[
				"socratic-duel",
				"release-lock",
				"--duel-id",
				"missing",
				"--participant-id",
				"p1",
				"--close",
				"--outcome",
				"NOT_REAL",
			],
			1,
		);
		expect(errors.at(-1)).toContain("Invalid --outcome value");
	});

	test("socratic-duel command adapters run the join, status, claim, refresh, and release lifecycle", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-duel-command-"));
		const targetPath = join(tempDir, "proposal.md");
		const debateDir = join(tempDir, "debates");
		await mkdir(debateDir, { recursive: true });
		await writeFile(targetPath, "# Proposal\n\nInitial position.\n");

		await expectExit(
			[
				"socratic-duel",
				"join",
				"--target",
				targetPath,
				"--topic",
				"Coverage repair",
				"--debate-dir",
				debateDir,
				"--participant-name",
				"codex",
				"--harness",
				"codex",
				"--model-id",
				"gpt-5",
			],
			0,
		);
		const joined = lastOutput<{
			data: { duel_id: string; participant_id: string; next_step: string };
		}>();
		expect(joined.data.next_step).toBe("wait_peer");

		await expectExit(
			["socratic-duel", "status", "--duel-id", joined.data.duel_id],
			0,
		);
		const status = lastOutput<{
			data: { duel: { id: string }; participant_count: number };
		}>();
		expect(status.data.duel.id).toBe(joined.data.duel_id);
		expect(status.data.participant_count).toBe(1);

		await expectExit(
			[
				"socratic-duel",
				"join",
				"--target",
				targetPath,
				"--topic",
				"Coverage repair",
				"--debate-dir",
				debateDir,
				"--participant-name",
				"reviewer",
				"--harness",
				"codex",
				"--model-id",
				"gpt-5",
			],
			0,
		);
		const joinedPeer = lastOutput<{ data: { participant_count: number } }>();
		expect(joinedPeer.data.participant_count).toBe(2);

		await expectExit(
			[
				"socratic-duel",
				"claim-lock",
				"--duel-id",
				joined.data.duel_id,
				"--participant-id",
				joined.data.participant_id,
			],
			0,
		);
		const claimed = lastOutput<{
			data: { acquired: boolean; lease_token: string };
		}>();
		expect(claimed.data.acquired).toBe(true);
		expect(claimed.data.lease_token).toBeTruthy();

		await expectExit(
			[
				"socratic-duel",
				"refresh-lock",
				"--duel-id",
				joined.data.duel_id,
				"--participant-id",
				joined.data.participant_id,
				"--lease-token",
				claimed.data.lease_token,
			],
			0,
		);
		const refreshed = lastOutput<{ data: { refreshed: boolean } }>();
		expect(refreshed.data.refreshed).toBe(true);

		await expectExit(
			[
				"socratic-duel",
				"release-lock",
				"--duel-id",
				joined.data.duel_id,
				"--participant-id",
				joined.data.participant_id,
				"--lease-token",
				claimed.data.lease_token,
			],
			0,
		);
		const released = lastOutput<{ data: { released: boolean } }>();
		expect(released.data.released).toBe(true);
	});

	test("socratic-duel release-lock refuses TIMEOUT close after a late peer join", async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-duel-timeout-command-"));
		const targetPath = join(tempDir, "proposal.md");
		const debateDir = join(tempDir, "debates");
		await mkdir(debateDir, { recursive: true });
		await writeFile(targetPath, "# Proposal\n\nInitial position.\n");

		await expectExit(
			[
				"socratic-duel",
				"join",
				"--target",
				targetPath,
				"--topic",
				"Timeout race",
				"--debate-dir",
				debateDir,
				"--participant-name",
				"codex",
				"--harness",
				"codex",
				"--model-id",
				"gpt-5",
			],
			0,
		);
		const joined = lastOutput<{
			data: { duel_id: string; participant_id: string };
		}>();

		await expectExit(
			[
				"socratic-duel",
				"claim-lock",
				"--duel-id",
				joined.data.duel_id,
				"--participant-id",
				joined.data.participant_id,
				"--for-timeout",
			],
			0,
		);
		const timeoutClaim = lastOutput<{
			data: {
				lease_token: string;
				participant_count: number;
				next_step: string;
			};
		}>();
		expect(timeoutClaim.data.participant_count).toBe(1);
		expect(timeoutClaim.data.next_step).toBe("update_markdown");

		await expectExit(
			[
				"socratic-duel",
				"join",
				"--target",
				targetPath,
				"--topic",
				"Timeout race",
				"--debate-dir",
				debateDir,
				"--participant-name",
				"reviewer",
				"--harness",
				"codex",
				"--model-id",
				"gpt-5",
			],
			0,
		);

		await expectExit(
			[
				"socratic-duel",
				"release-lock",
				"--duel-id",
				joined.data.duel_id,
				"--participant-id",
				joined.data.participant_id,
				"--lease-token",
				timeoutClaim.data.lease_token,
				"--close",
				"--outcome",
				"TIMEOUT",
			],
			0,
		);
		const rejected = lastOutput<{
			data: {
				closed: boolean;
				participant_count: number;
				next_step: string;
				outcome: string;
				reason: string;
				status: string;
			};
		}>();
		expect(rejected.data.closed).toBe(false);
		expect(rejected.data.participant_count).toBe(2);
		expect(rejected.data.next_step).toBe("compose_turn");
		expect(rejected.data.outcome).toBe("TIMEOUT");
		expect(rejected.data.reason).toContain("second participant is present");
		expect(rejected.data.status).toBe("ACTIVE");
	});

	test("emit end-run with valid args does not fail on parent required options", async () => {
		const projectRoot = await createProject();
		const runId = "550e8400-e29b-41d4-a716-446655440099";
		await expectExit(
			[
				"emit",
				"--workflow",
				"build",
				"--type",
				"status_change",
				"--run-id",
				runId,
				"--step",
				"requirements",
				"--project",
				projectRoot,
				"--data",
				'{"status":"running"}',
			],
			0,
		);

		await expectExit(
			[
				"emit",
				"end-run",
				"--run-id",
				runId,
				"--outcome",
				"cancelled",
				"--reason",
				"regression test",
				"--project",
				projectRoot,
			],
			0,
		);
	});

	test("emit resume-run with valid args dispatches to its action (cross-platform)", async () => {
		const projectRoot = await createProject();
		// Pre-fix bug: Commander rejected this with parent's "required option '--type'"
		// before subcommand dispatch. Post-fix: the parent's required-option
		// gate no longer fires and the call reaches resume-run's action.
		await expectExit(
			[
				"emit",
				"resume-run",
				"--feature",
				"some-feature",
				"--flow",
				"build",
				"--project",
				projectRoot,
			],
			0,
		);
		const joinedErrors = errors.join("\n");
		expect(joinedErrors).not.toMatch(/required option '--type'/);
		expect(joinedErrors).not.toMatch(/required option '--run-id'/);
		expect(joinedErrors).not.toMatch(/required option '--workflow'/);
		expect(joinedErrors).not.toMatch(/Project path must be absolute/);
	});

	test("resume-run project path validation recognizes Windows absolute paths", async () => {
		const { isPlatformAbsoluteProjectPath } = await import(
			"../../agent-tools/command.js"
		);

		expect(isPlatformAbsoluteProjectPath("C:\\code\\rp1", "win32")).toBe(true);
		expect(isPlatformAbsoluteProjectPath("/tmp/rp1", "linux")).toBe(true);
		expect(isPlatformAbsoluteProjectPath("relative\\rp1", "win32")).toBe(false);
	});

	test("emit end-run without --run-id fails via action guard, not Commander", async () => {
		const projectRoot = await createProject();
		await expectExit(
			["emit", "end-run", "--outcome", "cancelled", "--project", projectRoot],
			1,
		);
		const joinedErrors = errors.join("\n");
		expect(joinedErrors).not.toMatch(/required option '--run-id'/);
		const errorPayload = errors.at(-1);
		expect(errorPayload).toBeDefined();
		const parsed = JSON.parse(errorPayload as string) as {
			tool: string;
			errors: { message: string }[];
		};
		expect(parsed.tool).toBe("emit");
		expect(parsed.errors[0]?.message).toMatch(/run.?id/i);
	});

	test("bare emit without --run-id still errors via validateEmitOptions, not Commander", async () => {
		const projectRoot = await createProject();
		await expectExit(
			[
				"emit",
				"--workflow",
				"build",
				"--type",
				"status_change",
				"--step",
				"requirements",
				"--project",
				projectRoot,
			],
			1,
		);
		const errorPayload = errors.at(-1);
		expect(errorPayload).toBeDefined();
		const parsed = JSON.parse(errorPayload as string) as {
			tool: string;
			errors: { message: string }[];
		};
		expect(parsed.tool).toBe("emit");
		expect(parsed.errors[0]?.message).toMatch(/run.?id/i);
	});

	test("emit invocation does not eagerly load unrelated tool modules", async () => {
		const projectRoot = await createProject();
		const runId = "550e8400-e29b-41d4-a716-446655440077";

		// Emit a status_change -- only the emit module should load.
		// If socratic-duel or other modules loaded eagerly, the old
		// side-effect imports would have triggered them at import time.
		// With lazy loading, only the emit module is imported on demand.
		await expectExit(
			[
				"emit",
				"--type",
				"status_change",
				"--run-id",
				runId,
				"--workflow",
				"build",
				"--step",
				"task-builder:building",
				"--data",
				'{"status":"running","feature":"lazy-test"}',
				"--project",
				projectRoot,
			],
			0,
		);
		const emitted = lastOutput<{
			success: boolean;
			data: { runId: string; type: string };
		}>();
		expect(emitted.success).toBe(true);
		expect(emitted.data.type).toBe("status_change");

		const { TOOL_MODULES } = await import("../../agent-tools/command.js");
		expect(TOOL_MODULES).toBeInstanceOf(Map);
		expect(TOOL_MODULES.size).toBe(15);

		// Verify that calling an unrelated tool's loader actually works
		// (proves modules load on demand, not at import time)
		const loader = TOOL_MODULES.get("mmd-validate");
		expect(loader).toBeDefined();
	});

	test("emit batch processes multiple events and returns per-event results", async () => {
		const projectRoot = await createProject();
		const runId = "550e8400-e29b-41d4-a716-446655440088";

		const batchEvents = JSON.stringify([
			{
				type: "status_change",
				step: "task-builder:building",
				data: { status: "running", feature: "batch-test" },
			},
			{
				type: "status_change",
				step: "task-builder:completed",
				data: { status: "completed", feature: "batch-test" },
			},
		]);

		await expectExit(
			[
				"emit",
				"--run-id",
				runId,
				"--workflow",
				"build",
				"--batch",
				batchEvents,
				"--project",
				projectRoot,
			],
			0,
		);
		const result = lastOutput<{
			success: boolean;
			data: {
				results: Array<{
					index: number;
					type: string;
					success: boolean;
					eventId?: number;
				}>;
				succeeded: number;
				failed: number;
				total: number;
			};
		}>();
		expect(result.success).toBe(true);
		expect(result.data.succeeded).toBe(2);
		expect(result.data.failed).toBe(0);
		expect(result.data.total).toBe(2);
		expect(result.data.results).toHaveLength(2);
		expect(result.data.results[0].success).toBe(true);
		expect(result.data.results[1].success).toBe(true);
	});

	test("emit batch stops at first invalid event and reports partial results", async () => {
		const projectRoot = await createProject();
		const runId = "550e8400-e29b-41d4-a716-446655440089";

		const batchEvents = JSON.stringify([
			{
				type: "status_change",
				step: "task-builder:building",
				data: { status: "running", feature: "batch-fail" },
			},
			{
				type: "status_change",
				step: "task-builder:completed",
				data: {},
			},
		]);

		await expectExit(
			[
				"emit",
				"--run-id",
				runId,
				"--workflow",
				"build",
				"--batch",
				batchEvents,
				"--project",
				projectRoot,
			],
			1,
		);
		const errorPayload = errors.at(-1);
		expect(errorPayload).toBeDefined();
		const parsed = JSON.parse(errorPayload as string) as {
			errors: { message: string }[];
		};
		expect(parsed.errors[0]?.message).toContain("Batch event[1]");
	});
});
