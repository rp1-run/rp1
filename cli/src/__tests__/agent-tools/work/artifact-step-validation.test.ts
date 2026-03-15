/**
 * Tests for artifact step validation against workflow state machines.
 * Ensures --step values are validated before inserting into the database.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clearCache } from "../../../agent-tools/state-machine/index.js";
import {
	closeDatabase,
	getWorkflowForRun,
	insertStatusUpdate,
	queryArtifactsForFeature,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import { executeArtifact } from "../../../agent-tools/work/index.js";
import type { ArtifactInput } from "../../../agent-tools/work/models.js";
import {
	expectTaskLeft,
	expectTaskRight,
	getErrorMessage,
} from "../../helpers/index.js";

describe("artifact step validation", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `artifact-step-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-status.db");
	});

	beforeEach(() => {
		clearCache();
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("getWorkflowForRun", () => {
		test("returns workflow name from status_updates for a run", async () => {
			// Insert a status update with a workflow
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/wf-lookup",
						feature: "my-feature",
						step: "requirements",
						status: "started",
						workflow: "build",
						runId: "run-abc",
					},
					testDbPath,
				),
			);

			const workflow = await expectTaskRight(
				getWorkflowForRun(
					"/test/wf-lookup",
					"my-feature",
					"run-abc",
					testDbPath,
				),
			);

			expect(workflow).toBe("build");
		});

		test("returns null when no workflow exists for the run", async () => {
			const workflow = await expectTaskRight(
				getWorkflowForRun("/test/no-wf", "nonexistent", "run-xyz", testDbPath),
			);

			expect(workflow).toBeNull();
		});

		test("scopes lookup by runId when provided", async () => {
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/scope",
						feature: "feat",
						step: "requirements",
						status: "started",
						workflow: "build",
						runId: "run-1",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/scope",
						feature: "feat",
						step: "clarify",
						status: "started",
						workflow: "deep-research",
						runId: "run-2",
					},
					testDbPath,
				),
			);

			const workflow1 = await expectTaskRight(
				getWorkflowForRun("/test/scope", "feat", "run-1", testDbPath),
			);
			expect(workflow1).toBe("build");

			const workflow2 = await expectTaskRight(
				getWorkflowForRun("/test/scope", "feat", "run-2", testDbPath),
			);
			expect(workflow2).toBe("deep-research");
		});
	});

	describe("executeArtifact with step validation", () => {
		test("succeeds with valid step matching workflow state machine", async () => {
			// First, create a status update to associate the run with a workflow
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/valid-step",
						feature: "feat-valid",
						step: "requirements",
						status: "started",
						workflow: "build",
						runId: "run-valid",
					},
					testDbPath,
				),
			);

			const input: ArtifactInput = {
				projectPath: "/test/valid-step",
				feature: "feat-valid",
				runId: "run-valid",
				path: ".rp1/work/features/feat-valid/requirements.md",
				type: "markdown",
				step: "requirements",
			};

			const result = await expectTaskRight(executeArtifact(input, testDbPath));
			expect(result.data.step).toBe("requirements");
		});

		test("rejects invalid step that does not exist in workflow state machine", async () => {
			// Create a status update to associate the run with the build workflow
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/invalid-step",
						feature: "feat-invalid",
						step: "requirements",
						status: "started",
						workflow: "build",
						runId: "run-invalid",
					},
					testDbPath,
				),
			);

			const input: ArtifactInput = {
				projectPath: "/test/invalid-step",
				feature: "feat-invalid",
				runId: "run-invalid",
				path: ".rp1/work/features/feat-invalid/output.md",
				type: "markdown",
				step: "nonexistent-step",
			};

			const error = await expectTaskLeft(executeArtifact(input, testDbPath));
			const msg = getErrorMessage(error);
			expect(msg).toContain("Invalid artifact step");
			expect(msg).toContain("nonexistent-step");
			expect(msg).toContain("Valid steps:");
		});

		test("does not insert artifact when step validation fails", async () => {
			await expectTaskRight(
				insertStatusUpdate(
					{
						projectPath: "/test/no-insert",
						feature: "feat-no-insert",
						step: "requirements",
						status: "started",
						workflow: "build",
						runId: "run-no-insert",
					},
					testDbPath,
				),
			);

			const input: ArtifactInput = {
				projectPath: "/test/no-insert",
				feature: "feat-no-insert",
				runId: "run-no-insert",
				path: ".rp1/work/features/feat-no-insert/bad.md",
				type: "markdown",
				step: "bogus",
			};

			await expectTaskLeft(executeArtifact(input, testDbPath));

			// Verify nothing was inserted
			const artifacts = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/no-insert",
					"feat-no-insert",
					"run-no-insert",
					testDbPath,
				),
			);
			expect(artifacts.length).toBe(0);
		});

		test("skips validation when no step is provided", async () => {
			const input: ArtifactInput = {
				projectPath: "/test/no-step",
				feature: "feat-no-step",
				path: ".rp1/work/features/feat-no-step/output.md",
				type: "markdown",
			};

			const result = await expectTaskRight(executeArtifact(input, testDbPath));
			expect(result.data.step).toBeNull();
		});

		test("skips validation when no workflow is found for the run", async () => {
			// No status_updates exist for this feature/run, so no workflow to validate against
			const input: ArtifactInput = {
				projectPath: "/test/no-workflow",
				feature: "feat-no-wf",
				runId: "orphan-run",
				path: ".rp1/work/features/feat-no-wf/output.md",
				type: "markdown",
				step: "anything-goes",
			};

			const result = await expectTaskRight(executeArtifact(input, testDbPath));
			expect(result.data.step).toBe("anything-goes");
		});

		test("validates different valid steps for the build workflow", async () => {
			const validSteps = [
				"requirements",
				"design",
				"tasks",
				"build",
				"verify",
				"archive",
			];

			for (const step of validSteps) {
				closeDatabase();
				resetDatabaseInstance();

				const feature = `feat-${step}`;
				const runId = `run-${step}`;

				await expectTaskRight(
					insertStatusUpdate(
						{
							projectPath: "/test/multi-step",
							feature,
							step: "requirements",
							status: "started",
							workflow: "build",
							runId,
						},
						testDbPath,
					),
				);

				const result = await expectTaskRight(
					executeArtifact(
						{
							projectPath: "/test/multi-step",
							feature,
							runId,
							path: `.rp1/work/features/${feature}/artifact.md`,
							type: "markdown",
							step,
						},
						testDbPath,
					),
				);
				expect(result.data.step).toBe(step);
			}
		});
	});
});
