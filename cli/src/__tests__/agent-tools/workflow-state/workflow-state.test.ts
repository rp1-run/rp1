import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	insertEvent,
	insertRun,
	resetInstance,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { getTool } from "../../../agent-tools/index.js";
import { execute } from "../../../agent-tools/workflow-state/index.js";
import { createTempDir, expectTaskRight } from "../../helpers/index.js";

const parentPhases = [
	"requirements",
	"planning",
	"implementation",
	"release",
] as const;

const inputFor = (runId: string, feature = "build-v2"): string =>
	JSON.stringify({
		run_id: runId,
		workflow: "build",
		feature,
		parent_phases: parentPhases,
		recent_event_limit: 2,
	});

describe("workflow-state", () => {
	let tempDir: string;
	let originalDbEnv: string | undefined;

	beforeEach(async () => {
		tempDir = await createTempDir("workflow-state");
		originalDbEnv = process.env.RP1_DB;
		process.env.RP1_DB = join(tempDir, "rp1-test.db");
		closeDatabase();
		resetInstance();
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		if (originalDbEnv === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDbEnv;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	test("registers the workflow-state tool", () => {
		expect(getTool("workflow-state")?.description).toContain(
			"Read workflow run state",
		);
	});

	test("returns the next incomplete parent phase from effective step state", async () => {
		const db = await expectTaskRight(getEmitDatabase());
		insertRun(db, {
			id: "run-next-phase",
			flow: "build",
			featureId: "build-v2",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId: "run-next-phase",
			type: "status_change",
			step: "requirements",
			data: JSON.stringify({ status: "completed" }),
		});
		insertEvent(db, {
			runId: "run-next-phase",
			type: "status_change",
			step: "planning",
			data: JSON.stringify({ status: "completed" }),
		});

		for (const path of [
			"features/build-v2/requirements.md",
			"features/build-v2/design.md",
			"features/build-v2/tasks.md",
			"features/build-v2/tasks.json",
		]) {
			upsertArtifact(db, {
				docId: `doc-${path}`,
				runId: "run-next-phase",
				path,
				type: path.endsWith(".json") ? "other" : "markdown",
				storageRoot: "work_dir",
				projectPath: tempDir,
				feature: "build-v2",
			});
		}

		const result = await expectTaskRight(
			execute(inputFor("run-next-phase"), { inputSource: "stdin" }),
		);

		expect(result.success).toBe(true);
		expect(result.data.summary.next_phase).toBe("implementation");
		expect(result.data.summary.contract_gaps).toEqual([]);
		expect(result.data.phases.map((phase) => phase.status)).toEqual([
			"completed",
			"completed",
			"not_started",
			"not_started",
		]);
		expect(result.data.recent_events).toHaveLength(2);
	});

	test("reports completed-phase artifact gaps without inspecting feature files", async () => {
		const db = await expectTaskRight(getEmitDatabase());
		insertRun(db, {
			id: "run-contract-gap",
			flow: "build",
			featureId: "build-v2",
			projectPath: tempDir,
		});

		insertEvent(db, {
			runId: "run-contract-gap",
			type: "status_change",
			step: "requirements",
			data: JSON.stringify({ status: "completed" }),
		});
		insertEvent(db, {
			runId: "run-contract-gap",
			type: "status_change",
			step: "planning",
			data: JSON.stringify({ status: "completed" }),
		});

		upsertArtifact(db, {
			docId: "doc-requirements",
			runId: "run-contract-gap",
			path: "features/build-v2/requirements.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "build-v2",
		});
		upsertArtifact(db, {
			docId: "doc-design",
			runId: "run-contract-gap",
			path: "features/build-v2/design.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "build-v2",
		});

		const result = await expectTaskRight(
			execute(inputFor("run-contract-gap"), { inputSource: "stdin" }),
		);

		expect(result.data.summary.next_phase).toBe("planning");
		expect(result.data.summary.contract_gaps).toEqual([
			{
				phase: "planning",
				missing_artifacts: [
					"features/build-v2/tasks.md",
					"features/build-v2/tasks.json",
				],
				message:
					'Completed phase "planning" is missing registered artifact output.',
			},
		]);
	});
});
