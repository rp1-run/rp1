import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	spyOn,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expectTaskRight } from "../../../../src/__tests__/helpers/index.js";
import {
	closeDatabase,
	getEmitDatabase,
	insertRun,
	resetInstance,
	upsertArtifact,
} from "../../../../src/agent-tools/emit/database.js";
import * as registry from "../../server/registry.js";
import {
	handleV2ArtifactContentRequest,
	handleV2RunDetailRequest,
} from "../../server/routes/v2-api.js";

const registrySpies: Array<{ mockRestore: () => void }> = [];

describe("handleV2RunDetailRequest", () => {
	let tempDir: string;
	let dbPath: string;
	let projectRoot: string;
	let caseIndex = 0;
	let originalDbEnv: string | undefined;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `v2-run-detail-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		originalDbEnv = process.env.RP1_DB;
		registrySpies.push(
			spyOn(registry, "getAllProjects").mockImplementation(async () => []),
			spyOn(registry, "getProject").mockImplementation(async () => null),
			spyOn(registry, "getProjectCount").mockImplementation(async () => 0),
			spyOn(registry, "isValidProject").mockImplementation(async () => false),
			spyOn(registry, "registerProject").mockImplementation(async () => {
				throw new Error(
					"registerProject should not be called in run detail tests",
				);
			}),
			spyOn(registry, "removeProject").mockImplementation(async () => false),
		);
	});

	beforeEach(async () => {
		caseIndex += 1;
		dbPath = join(tempDir, `case-${caseIndex}.db`);
		projectRoot = join(tempDir, `project-${caseIndex}`);
		await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
		await mkdir(join(projectRoot, ".rp1", "work"), { recursive: true });
		process.env.RP1_DB = dbPath;
	});

	afterEach(() => {
		closeDatabase();
		resetInstance();
	});

	afterAll(async () => {
		closeDatabase();
		resetInstance();
		if (originalDbEnv === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalDbEnv;
		}
		await rm(tempDir, { recursive: true, force: true });
		for (const spy of registrySpies) {
			spy.mockRestore();
		}
		registrySpies.length = 0;
	});

	test("serializes invocation context from bootstrap data and redacts unsafe identity values", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		insertRun(db, {
			id: "run-with-invocation",
			flow: "build",
			featureId: "feat-invocation",
			projectPath: projectRoot,
			rp1ProjectRoot: projectRoot,
			rp1KbRoot: join(projectRoot, ".rp1", "context"),
			rp1WorkRoot: join(projectRoot, ".rp1", "work"),
			projectId: "project-1",
			runPolicy: "resumable",
			workIdentity: "FEATURE_ID=feat-invocation|API_TOKEN=super-secret",
			bootstrapContext: JSON.stringify({
				workflow: {
					name: "build",
					runPolicy: "resumable",
					identityArgs: ["FEATURE_ID", "API_TOKEN"],
				},
				directories: {
					projectRoot,
					kbRoot: join(projectRoot, ".rp1", "context"),
					workRoot: join(projectRoot, ".rp1", "work"),
				},
				trace: {
					projectIdentity: "project-1",
					workIdentity: "FEATURE_ID=feat-invocation|API_TOKEN=super-secret",
					identityValues: {
						FEATURE_ID: "feat-invocation",
						API_TOKEN: "super-secret",
					},
					requestedProjectRoot: join(projectRoot, "worktrees", "feat"),
					canonicalProjectRoot: projectRoot,
					isWorktree: true,
					worktreeName: "feat",
					harness: "codex",
				},
				run: {
					decision: "matched_non_terminal_run",
				},
			}),
			harness: "codex",
		});

		const response = await handleV2RunDetailRequest("run-with-invocation");
		const run = (await response.json()) as Record<string, unknown>;
		const invocation = run.invocation as Record<string, unknown> | undefined;

		expect(response.status).toBe(200);
		expect(invocation).toBeTruthy();
		expect(invocation?.workflowName).toBe("build");
		expect(invocation?.runPolicy).toBe("resumable");
		expect(invocation?.decision).toBe("matched_non_terminal_run");
		expect(invocation?.canonicalProjectRoot).toBe(projectRoot);
		expect(invocation?.requestedProjectRoot).toBe(
			join(projectRoot, "worktrees", "feat"),
		);
		expect(invocation?.isWorktree).toBe(true);
		expect(invocation?.worktreeName).toBe("feat");
		expect(invocation?.workIdentity).toBe(
			"FEATURE_ID=feat-invocation|API_TOKEN=[redacted]",
		);
		expect(invocation?.identityValues).toEqual({
			FEATURE_ID: "feat-invocation",
			API_TOKEN: "[redacted]",
		});
	});

	test("omits invocation data for historical rows without bootstrap context", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		insertRun(db, {
			id: "historical-run",
			flow: "build",
			featureId: "feat-history",
			projectPath: projectRoot,
			rp1ProjectRoot: projectRoot,
			rp1KbRoot: join(projectRoot, ".rp1", "context"),
			rp1WorkRoot: join(projectRoot, ".rp1", "work"),
			projectId: "project-1",
			harness: "codex",
		});

		const response = await handleV2RunDetailRequest("historical-run");
		const run = (await response.json()) as Record<string, unknown>;

		expect(response.status).toBe(200);
		expect(Object.hasOwn(run, "invocation")).toBe(false);
	});

	test("projects URL artifacts in run detail without requiring file content", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		insertRun(db, {
			id: "run-with-url-artifact",
			flow: "pr-review",
			featureId: "pr-123",
			projectPath: projectRoot,
			rp1ProjectRoot: projectRoot,
			rp1KbRoot: join(projectRoot, ".rp1", "context"),
			rp1WorkRoot: join(projectRoot, ".rp1", "work"),
			projectId: "project-1",
			harness: "codex",
		});
		upsertArtifact(db, {
			docId: "doc-report",
			runId: "run-with-url-artifact",
			path: "pr-reviews/pr-123-review.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: projectRoot,
			projectId: "project-1",
			feature: "pr-123",
			step: "posting",
		});
		upsertArtifact(db, {
			docId: "link-reviewed-pr",
			runId: "run-with-url-artifact",
			locationKind: "url",
			path: "https://github.com/example/repo/pull/123",
			type: "link",
			storageRoot: "work_dir",
			url: "https://github.com/example/repo/pull/123",
			label: "Reviewed PR",
			relationship: "reviewed_pr",
			sourceContext: "PR review input resolution",
			sourceArtifactPath: "pr-reviews/pr-123-review.md",
			projectPath: projectRoot,
			projectId: "project-1",
			feature: "pr-123",
			step: "posting",
			subflow: true,
		});

		const response = await handleV2RunDetailRequest("run-with-url-artifact");
		const run = (await response.json()) as {
			artifacts: Array<Record<string, unknown>>;
		};

		expect(response.status).toBe(200);
		expect(run.artifacts).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					docId: "doc-report",
					path: ".rp1/work/pr-reviews/pr-123-review.md",
					type: "markdown",
				}),
				expect.objectContaining({
					docId: "link-reviewed-pr",
					locationKind: "url",
					path: "https://github.com/example/repo/pull/123",
					absolutePath: "https://github.com/example/repo/pull/123",
					type: "link",
					url: "https://github.com/example/repo/pull/123",
					label: "Reviewed PR",
					relationship: "reviewed_pr",
					sourceContext: "PR review input resolution",
					sourceArtifactPath: "pr-reviews/pr-123-review.md",
					step: "posting",
				}),
			]),
		);
	});

	test("rejects URL artifact content requests before filesystem fallback", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		insertRun(db, {
			id: "run-url-content",
			flow: "pr-review",
			featureId: "pr-123",
			projectPath: projectRoot,
			rp1ProjectRoot: projectRoot,
			rp1KbRoot: join(projectRoot, ".rp1", "context"),
			rp1WorkRoot: join(projectRoot, ".rp1", "work"),
			projectId: "project-1",
			harness: "codex",
		});
		upsertArtifact(db, {
			docId: "link-reviewed-pr",
			runId: "run-url-content",
			locationKind: "url",
			path: "https://github.com/example/repo/pull/123",
			type: "link",
			storageRoot: "work_dir",
			url: "https://github.com/example/repo/pull/123",
			label: "Reviewed PR",
			relationship: "reviewed_pr",
			sourceContext: "PR review input resolution",
			sourceArtifactPath: "pr-reviews/pr-123-review.md",
			projectPath: projectRoot,
			projectId: "project-1",
			feature: "pr-123",
			step: "posting",
		});

		const response = await handleV2ArtifactContentRequest(
			"run-url-content",
			"https://github.com/example/repo/pull/123",
		);
		const body = (await response.json()) as { error?: string };

		expect(response.status).toBe(400);
		expect(body.error).toBe("URL artifacts do not have file content");
	});
});
