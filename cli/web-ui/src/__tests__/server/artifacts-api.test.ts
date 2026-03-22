/**
 * Unit tests for artifact save endpoint path validation, baseline capture,
 * patch (unified diff) endpoint, and doc_id-based path reconciliation.
 */

import { Database } from "bun:sqlite";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import * as E from "fp-ts/lib/Either.js";

let testDb: Database;
let tmpDir: string;

const runId = "test-run-001";
const docId = "test-doc-001";
const artifactPath = "docs/design.md";
const originalContent = "# Original Design\n\nThis is the original file.";

mock.module("../../../../src/agent-tools/emit/database.js", () => ({
	getEmitDatabase: () => async () => E.right(testDb),
	getRunById: (db: Database, id: string) => {
		const row = db
			.prepare("SELECT * FROM runs WHERE id = $id")
			.get({ $id: id }) as {
			id: string;
			flow: string;
			feature_id: string;
			project_path: string;
		} | null;
		if (!row) return null;
		return {
			id: row.id,
			flow: row.flow,
			featureId: row.feature_id,
			projectPath: row.project_path,
			status: "running" as const,
			createdAt: new Date().toISOString(),
			updatedAt: new Date().toISOString(),
		};
	},
	setArtifactBaseline: (db: Database, dId: string, baseline: string) => {
		db.prepare(
			"UPDATE artifacts SET baseline = $baseline WHERE doc_id = $docId",
		).run({ $baseline: baseline, $docId: dId });
	},
	getArtifactBaseline: (db: Database, dId: string) => {
		const row = db
			.prepare(
				"SELECT baseline, path, project_path FROM artifacts WHERE doc_id = $docId",
			)
			.get({ $docId: dId }) as {
			baseline: string | null;
			path: string;
			project_path: string;
		} | null;
		if (!row) return null;
		return {
			baseline: row.baseline,
			path: row.path,
			projectPath: row.project_path,
		};
	},
	updateArtifactPath: (db: Database, dId: string, newPath: string) => {
		db.prepare("UPDATE artifacts SET path = $path WHERE doc_id = $docId").run({
			$path: newPath,
			$docId: dId,
		});
	},
	getArtifactByDocId: (db: Database, dId: string) => {
		const row = db
			.prepare("SELECT * FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: dId }) as {
			id: number;
			doc_id: string;
			run_id: string;
			path: string;
			type: string;
			project_path: string;
			feature: string;
			step: string | null;
			subflow: number;
			created_at: string;
		} | null;
		if (!row) return null;
		return {
			id: row.id,
			docId: row.doc_id,
			runId: row.run_id,
			path: row.path,
			type: row.type,
			projectPath: row.project_path,
			feature: row.feature,
			step: row.step,
			subflow: row.subflow === 1,
			createdAt: row.created_at,
		};
	},
	getArtifactByRunAndDocId: (db: Database, rId: string, dId: string) => {
		const row = db
			.prepare(
				"SELECT * FROM artifacts WHERE run_id = $runId AND doc_id = $docId LIMIT 1",
			)
			.get({ $runId: rId, $docId: dId }) as {
			id: number;
			doc_id: string;
			run_id: string;
			path: string;
			type: string;
			project_path: string;
			feature: string;
			step: string | null;
			subflow: number;
			created_at: string;
		} | null;
		if (!row) return null;
		return {
			id: row.id,
			docId: row.doc_id,
			runId: row.run_id,
			path: row.path,
			type: row.type,
			projectPath: row.project_path,
			feature: row.feature,
			step: row.step,
			subflow: row.subflow === 1,
			createdAt: row.created_at,
		};
	},
}));

mock.module("../../server/registry", () => ({
	getAllProjects: async () => [
		{ id: "test-project", path: tmpDir, name: "Test Project" },
	],
}));

import {
	broadcastPathReconciliation,
	extractDocIdFromContent,
	extractDocIdFromFrontmatter,
	handleArtifactPatchRequest,
	handleArtifactSaveRequest,
	resolveArtifactPath,
	scanForDocId,
	validateSavePath,
} from "../../server/routes/artifacts-api";

const SCHEMA_SQL = `
	CREATE TABLE schema_version (version INTEGER NOT NULL);
	INSERT INTO schema_version (version) VALUES (4);

	CREATE TABLE runs (
		id TEXT PRIMARY KEY NOT NULL,
		flow TEXT NOT NULL,
		feature_id TEXT NOT NULL,
		project_path TEXT NOT NULL,
		status TEXT NOT NULL DEFAULT 'not_started',
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
		updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);

	CREATE TABLE artifacts (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		doc_id TEXT UNIQUE NOT NULL,
		run_id TEXT REFERENCES runs(id),
		path TEXT NOT NULL,
		type TEXT NOT NULL DEFAULT 'other',
		project_path TEXT NOT NULL,
		feature TEXT NOT NULL,
		step TEXT,
		subflow INTEGER NOT NULL DEFAULT 0,
		baseline TEXT DEFAULT NULL,
		created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
	);
`;

describe("validateSavePath", () => {
	const projectRoot = "/home/user/project";

	test("rejects paths containing directory traversal", () => {
		const result = validateSavePath("../etc/passwd", projectRoot);
		expect(result).toBe("Invalid path: directory traversal not allowed");
	});

	test("rejects paths with embedded traversal segments", () => {
		const result = validateSavePath("docs/../../../etc/shadow", projectRoot);
		expect(result).toBe("Invalid path: directory traversal not allowed");
	});

	test("rejects paths that resolve outside project root", () => {
		const result = validateSavePath("/etc/passwd", projectRoot);
		expect(result).not.toBeNull();
	});

	test("accepts valid relative paths within project root", () => {
		const result = validateSavePath(
			".rp1/work/features/my-feature/tasks.md",
			projectRoot,
		);
		expect(result).toBeNull();
	});

	test("accepts paths in nested directories", () => {
		const result = validateSavePath("src/components/App.tsx", projectRoot);
		expect(result).toBeNull();
	});

	test("accepts simple filenames", () => {
		const result = validateSavePath("README.md", projectRoot);
		expect(result).toBeNull();
	});
});

describe("handleArtifactSaveRequest baseline capture", () => {
	beforeAll(async () => {
		tmpDir = await mkdtemp(join(tmpdir(), "rp1-artifact-test-"));

		testDb = new Database(":memory:");
		testDb.exec("PRAGMA foreign_keys = ON;");
		testDb.exec(SCHEMA_SQL);

		testDb
			.prepare(
				"INSERT INTO runs (id, flow, feature_id, project_path) VALUES ($id, $flow, $featureId, $projectPath)",
			)
			.run({
				$id: runId,
				$flow: "build",
				$featureId: "test-feature",
				$projectPath: tmpDir,
			});

		testDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES ($docId, $runId, $path, $type, $projectPath, $feature)",
			)
			.run({
				$docId: docId,
				$runId: runId,
				$path: artifactPath,
				$type: "markdown",
				$projectPath: tmpDir,
				$feature: "test-feature",
			});

		await Bun.write(join(tmpDir, artifactPath), originalContent);
	});

	afterAll(async () => {
		testDb?.close();
		if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
	});

	test("captures baseline on first save and does not overwrite on subsequent saves", async () => {
		const editedContent = "# Edited Design\n\nThis has been modified.";
		const secondEditContent = "# Second Edit\n\nModified again.";

		const baselineBefore = testDb
			.prepare("SELECT baseline FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: docId }) as { baseline: string | null };
		expect(baselineBefore.baseline).toBeNull();

		const firstSaveReq = new Request("http://localhost/api/save", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: artifactPath, content: editedContent }),
		});

		const firstResponse = await handleArtifactSaveRequest(runId, firstSaveReq, {
			port: 3000,
			startTime: Date.now(),
		});
		expect(firstResponse.status).toBe(200);

		const firstBody = (await firstResponse.json()) as { saved: boolean };
		expect(firstBody.saved).toBe(true);

		const baselineAfterFirst = testDb
			.prepare("SELECT baseline FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: docId }) as { baseline: string | null };
		expect(baselineAfterFirst.baseline).toBe(originalContent);

		const fileAfterFirst = await Bun.file(join(tmpDir, artifactPath)).text();
		expect(fileAfterFirst).toBe(editedContent);

		const secondSaveReq = new Request("http://localhost/api/save", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				path: artifactPath,
				content: secondEditContent,
			}),
		});

		const secondResponse = await handleArtifactSaveRequest(
			runId,
			secondSaveReq,
			{ port: 3000, startTime: Date.now() },
		);
		expect(secondResponse.status).toBe(200);

		const baselineAfterSecond = testDb
			.prepare("SELECT baseline FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: docId }) as { baseline: string | null };
		expect(baselineAfterSecond.baseline).toBe(originalContent);

		const fileAfterSecond = await Bun.file(join(tmpDir, artifactPath)).text();
		expect(fileAfterSecond).toBe(secondEditContent);
	});
});

describe("handleArtifactPatchRequest", () => {
	const patchDocId = "patch-doc-001";
	const patchArtifactPath = "docs/patch-test.md";
	const patchOriginal = "line one\nline two\nline three\n";
	let patchTmpDir: string;
	let patchDb: Database;

	beforeAll(async () => {
		patchTmpDir = await mkdtemp(join(tmpdir(), "rp1-patch-test-"));

		patchDb = new Database(":memory:");
		patchDb.exec("PRAGMA foreign_keys = ON;");
		patchDb.exec(SCHEMA_SQL);

		patchDb
			.prepare(
				"INSERT INTO runs (id, flow, feature_id, project_path) VALUES ($id, $flow, $featureId, $projectPath)",
			)
			.run({
				$id: "patch-run-001",
				$flow: "build",
				$featureId: "test-feature",
				$projectPath: patchTmpDir,
			});

		patchDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES ($docId, $runId, $path, $type, $projectPath, $feature)",
			)
			.run({
				$docId: patchDocId,
				$runId: "patch-run-001",
				$path: patchArtifactPath,
				$type: "markdown",
				$projectPath: patchTmpDir,
				$feature: "test-feature",
			});

		await Bun.write(join(patchTmpDir, patchArtifactPath), patchOriginal);

		testDb = patchDb;
	});

	afterAll(async () => {
		patchDb?.close();
		if (patchTmpDir) await rm(patchTmpDir, { recursive: true, force: true });
	});

	test("returns 404 when artifact doc_id is not found", async () => {
		const response = await handleArtifactPatchRequest("nonexistent-doc");
		expect(response.status).toBe(404);
		const body = (await response.json()) as { error: string };
		expect(body.error).toContain("Artifact not found");
	});

	test("returns null patch when no baseline exists", async () => {
		const response = await handleArtifactPatchRequest(patchDocId);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			patch: string | null;
			message: string;
		};
		expect(body.patch).toBeNull();
		expect(body.message).toBe("No edits recorded");
	});

	test("returns null patch when baseline equals current content", async () => {
		patchDb
			.prepare(
				"UPDATE artifacts SET baseline = $baseline WHERE doc_id = $docId",
			)
			.run({ $baseline: patchOriginal, $docId: patchDocId });

		const response = await handleArtifactPatchRequest(patchDocId);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			patch: string | null;
			message: string;
		};
		expect(body.patch).toBeNull();
		expect(body.message).toBe("No changes");
	});

	test("returns unified diff when baseline exists and file has been modified", async () => {
		const modifiedContent =
			"line one\nline two modified\nline three\nline four\n";
		await Bun.write(join(patchTmpDir, patchArtifactPath), modifiedContent);

		const response = await handleArtifactPatchRequest(patchDocId);
		expect(response.status).toBe(200);
		const body = (await response.json()) as { patch: string };
		expect(body.patch).toBeDefined();
		expect(body.patch).toContain("---");
		expect(body.patch).toContain("+++");
		expect(body.patch).toContain("@@");
		expect(body.patch).toContain("-line two");
		expect(body.patch).toContain("+line two modified");
		expect(body.patch).toContain("+line four");
	});

	test("returns null patch when file is missing from disk", async () => {
		const missingDocId = "missing-file-doc";
		patchDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature, baseline) VALUES ($docId, $runId, $path, $type, $projectPath, $feature, $baseline)",
			)
			.run({
				$docId: missingDocId,
				$runId: "patch-run-001",
				$path: "docs/nonexistent.md",
				$type: "markdown",
				$projectPath: patchTmpDir,
				$feature: "test-feature",
				$baseline: "some baseline content",
			});

		const response = await handleArtifactPatchRequest(missingDocId);
		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			patch: string | null;
			message: string;
		};
		expect(body.patch).toBeNull();
		expect(body.message).toBe("File not found on disk");
	});
});

describe("extractDocIdFromFrontmatter", () => {
	test("extracts doc_id from valid frontmatter", () => {
		const content = "---\nrp1_doc_id: abc-123-def\ntitle: Test\n---\n# Hello";
		expect(extractDocIdFromFrontmatter(content)).toBe("abc-123-def");
	});

	test("returns null when no frontmatter present", () => {
		expect(extractDocIdFromFrontmatter("# No frontmatter")).toBeNull();
	});

	test("returns null when frontmatter has no doc_id", () => {
		const content = "---\ntitle: Test\n---\n# Hello";
		expect(extractDocIdFromFrontmatter(content)).toBeNull();
	});

	test("returns null when frontmatter is unclosed", () => {
		const content = "---\nrp1_doc_id: abc-123\n# No closing delimiter";
		expect(extractDocIdFromFrontmatter(content)).toBeNull();
	});
});

describe("scanForDocId", () => {
	let scanTmpDir: string;

	beforeAll(async () => {
		scanTmpDir = await mkdtemp(join(tmpdir(), "rp1-scan-test-"));
		const workDir = join(scanTmpDir, ".rp1", "work");

		await mkdir(join(workDir, "features", "feat-1"), { recursive: true });
		await mkdir(join(workDir, "archives", "features", "feat-1"), {
			recursive: true,
		});

		await Bun.write(
			join(workDir, "features", "feat-1", "tasks.md"),
			"---\nrp1_doc_id: scan-target-id\ntitle: Tasks\n---\n# Tasks",
		);

		await Bun.write(
			join(workDir, "features", "feat-1", "design.md"),
			"---\nrp1_doc_id: other-id\ntitle: Design\n---\n# Design",
		);

		await Bun.write(
			join(workDir, "features", "feat-1", "notes.txt"),
			"---\nrp1_doc_id: should-not-match\n---\nNot a markdown file",
		);
	});

	afterAll(async () => {
		if (scanTmpDir) await rm(scanTmpDir, { recursive: true, force: true });
	});

	test("finds file by doc_id in .rp1/work/", async () => {
		const result = await scanForDocId(scanTmpDir, "scan-target-id");
		expect(result).toBe(".rp1/work/features/feat-1/tasks.md");
	});

	test("returns null for non-existent doc_id", async () => {
		const result = await scanForDocId(scanTmpDir, "nonexistent-id");
		expect(result).toBeNull();
	});

	test("does not match non-.md files", async () => {
		const result = await scanForDocId(scanTmpDir, "should-not-match");
		expect(result).toBeNull();
	});

	test("finds file after it was moved to archives", async () => {
		const src = join(
			scanTmpDir,
			".rp1",
			"work",
			"features",
			"feat-1",
			"tasks.md",
		);
		const dest = join(
			scanTmpDir,
			".rp1",
			"work",
			"archives",
			"features",
			"feat-1",
			"tasks.md",
		);
		await rename(src, dest);

		const result = await scanForDocId(scanTmpDir, "scan-target-id");
		expect(result).toBe(".rp1/work/archives/features/feat-1/tasks.md");

		// Move it back for other tests
		await rename(dest, src);
	});
});

describe("resolveArtifactPath", () => {
	let reconcileTmpDir: string;
	let reconcileDb: Database;
	const reconcileDocId = "reconcile-doc-001";

	beforeAll(async () => {
		reconcileTmpDir = await mkdtemp(join(tmpdir(), "rp1-reconcile-test-"));
		reconcileDb = new Database(":memory:");
		reconcileDb.exec("PRAGMA foreign_keys = ON;");
		reconcileDb.exec(SCHEMA_SQL);

		reconcileDb
			.prepare(
				"INSERT INTO runs (id, flow, feature_id, project_path) VALUES ($id, $flow, $featureId, $projectPath)",
			)
			.run({
				$id: "reconcile-run",
				$flow: "build",
				$featureId: "test-feature",
				$projectPath: reconcileTmpDir,
			});

		reconcileDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES ($docId, $runId, $path, $type, $projectPath, $feature)",
			)
			.run({
				$docId: reconcileDocId,
				$runId: "reconcile-run",
				$path: ".rp1/work/features/feat-1/tasks.md",
				$type: "markdown",
				$projectPath: reconcileTmpDir,
				$feature: "test-feature",
			});

		await mkdir(join(reconcileTmpDir, ".rp1", "work", "features", "feat-1"), {
			recursive: true,
		});
		await Bun.write(
			join(reconcileTmpDir, ".rp1", "work", "features", "feat-1", "tasks.md"),
			`---\nrp1_doc_id: ${reconcileDocId}\ntitle: Tasks\n---\n# Tasks`,
		);

		testDb = reconcileDb;
	});

	afterAll(async () => {
		reconcileDb?.close();
		if (reconcileTmpDir)
			await rm(reconcileTmpDir, { recursive: true, force: true });
	});

	test("cache hit: returns immediately when file exists at stored path", async () => {
		const result = await resolveArtifactPath(
			reconcileDb,
			reconcileTmpDir,
			".rp1/work/features/feat-1/tasks.md",
			reconcileDocId,
		);
		expect(result).toBe(
			join(reconcileTmpDir, ".rp1/work/features/feat-1/tasks.md"),
		);

		// Path in DB should not have changed
		const row = reconcileDb
			.prepare("SELECT path FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: reconcileDocId }) as { path: string };
		expect(row.path).toBe(".rp1/work/features/feat-1/tasks.md");
	});

	test("cache miss + scan hit: finds moved file and updates DB path", async () => {
		// Move the file to archives
		const archiveDir = join(
			reconcileTmpDir,
			".rp1",
			"work",
			"archives",
			"features",
			"feat-1",
		);
		await mkdir(archiveDir, { recursive: true });
		await rename(
			join(reconcileTmpDir, ".rp1", "work", "features", "feat-1", "tasks.md"),
			join(archiveDir, "tasks.md"),
		);

		const result = await resolveArtifactPath(
			reconcileDb,
			reconcileTmpDir,
			".rp1/work/features/feat-1/tasks.md",
			reconcileDocId,
		);
		expect(result).toBe(
			join(reconcileTmpDir, ".rp1/work/archives/features/feat-1/tasks.md"),
		);

		// DB path should be updated
		const row = reconcileDb
			.prepare("SELECT path FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: reconcileDocId }) as { path: string };
		expect(row.path).toBe(".rp1/work/archives/features/feat-1/tasks.md");
	});

	test("cache miss + scan miss: returns null when file is deleted", async () => {
		// Remove the file entirely
		await rm(
			join(
				reconcileTmpDir,
				".rp1",
				"work",
				"archives",
				"features",
				"feat-1",
				"tasks.md",
			),
		);

		const result = await resolveArtifactPath(
			reconcileDb,
			reconcileTmpDir,
			".rp1/work/archives/features/feat-1/tasks.md",
			reconcileDocId,
		);
		expect(result).toBeNull();
	});
});

describe("handleArtifactSaveRequest with moved file", () => {
	const movedRunId = "moved-run-001";
	const movedDocId = "moved-doc-001";
	const originalPath = ".rp1/work/features/feat-move/design.md";
	const archivedPath = ".rp1/work/archives/features/feat-move/design.md";
	let movedTmpDir: string;
	let movedDb: Database;

	beforeAll(async () => {
		movedTmpDir = await mkdtemp(join(tmpdir(), "rp1-moved-test-"));
		movedDb = new Database(":memory:");
		movedDb.exec("PRAGMA foreign_keys = ON;");
		movedDb.exec(SCHEMA_SQL);

		movedDb
			.prepare(
				"INSERT INTO runs (id, flow, feature_id, project_path) VALUES ($id, $flow, $featureId, $projectPath)",
			)
			.run({
				$id: movedRunId,
				$flow: "build",
				$featureId: "feat-move",
				$projectPath: movedTmpDir,
			});

		movedDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES ($docId, $runId, $path, $type, $projectPath, $feature)",
			)
			.run({
				$docId: movedDocId,
				$runId: movedRunId,
				$path: originalPath,
				$type: "markdown",
				$projectPath: movedTmpDir,
				$feature: "feat-move",
			});

		// Create at archived location (simulating archiver already moved it)
		await mkdir(dirname(join(movedTmpDir, archivedPath)), {
			recursive: true,
		});
		const fileContent = `---\nrp1_doc_id: ${movedDocId}\ntitle: Design\n---\n# Design doc content`;
		await Bun.write(join(movedTmpDir, archivedPath), fileContent);

		tmpDir = movedTmpDir;
		testDb = movedDb;
	});

	afterAll(async () => {
		movedDb?.close();
		if (movedTmpDir) await rm(movedTmpDir, { recursive: true, force: true });
	});

	test("save succeeds after file moved: falls back to doc_id lookup and reconciles", async () => {
		const newContent = `---\nrp1_doc_id: ${movedDocId}\ntitle: Design\n---\n# Updated design`;

		// Save using the ARCHIVED path (where the file actually is)
		const req = new Request("http://localhost/api/save", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ path: archivedPath, content: newContent }),
		});

		const response = await handleArtifactSaveRequest(movedRunId, req, {
			port: 3000,
			startTime: Date.now(),
		});
		expect(response.status).toBe(200);

		const body = (await response.json()) as { saved: boolean };
		expect(body.saved).toBe(true);

		// Verify the DB path was updated
		const row = movedDb
			.prepare("SELECT path FROM artifacts WHERE doc_id = $docId")
			.get({ $docId: movedDocId }) as { path: string };
		expect(row.path).toBe(archivedPath);

		// Verify file was written
		const written = await Bun.file(join(movedTmpDir, archivedPath)).text();
		expect(written).toBe(newContent);
	});
});

describe("broadcastPathReconciliation", () => {
	test("calls broadcastEvent with artifact_registered type and correct fields", () => {
		const calls: unknown[][] = [];
		const mockHub = {
			broadcastEvent: (...args: unknown[]) => {
				calls.push(args);
			},
		};

		broadcastPathReconciliation(
			mockHub as any,
			"proj-1",
			"run-1",
			"feat-1",
			"doc-1",
			".rp1/work/archives/features/feat-1/tasks.md",
		);

		expect(calls).toHaveLength(1);
		const [projectId, _eventId, eventType, runId, featureId, step, data] =
			calls[0];
		expect(projectId).toBe("proj-1");
		expect(eventType).toBe("artifact_registered");
		expect(runId).toBe("run-1");
		expect(featureId).toBe("feat-1");
		expect(step).toBeNull();
		expect(data).toEqual({
			docId: "doc-1",
			path: ".rp1/work/archives/features/feat-1/tasks.md",
			reconciled: true,
		});
	});

	test("does nothing when websocketHub is undefined", () => {
		expect(() => {
			broadcastPathReconciliation(
				undefined,
				"proj-1",
				"run-1",
				"feat-1",
				"doc-1",
				"some/path.md",
			);
		}).not.toThrow();
	});
});

describe("handleArtifactSaveRequest broadcasts after path reconciliation", () => {
	const bcastRunId = "bcast-run-001";
	const bcastDocId = "bcast-doc-001";
	const bcastOriginalPath = ".rp1/work/features/feat-bcast/design.md";
	const bcastArchivedPath = ".rp1/work/archives/features/feat-bcast/design.md";
	let bcastTmpDir: string;
	let bcastDb: Database;

	beforeAll(async () => {
		bcastTmpDir = await mkdtemp(join(tmpdir(), "rp1-bcast-test-"));
		bcastDb = new Database(":memory:");
		bcastDb.exec("PRAGMA foreign_keys = ON;");
		bcastDb.exec(SCHEMA_SQL);

		bcastDb
			.prepare(
				"INSERT INTO runs (id, flow, feature_id, project_path) VALUES ($id, $flow, $featureId, $projectPath)",
			)
			.run({
				$id: bcastRunId,
				$flow: "build",
				$featureId: "feat-bcast",
				$projectPath: bcastTmpDir,
			});

		bcastDb
			.prepare(
				"INSERT INTO artifacts (doc_id, run_id, path, type, project_path, feature) VALUES ($docId, $runId, $path, $type, $projectPath, $feature)",
			)
			.run({
				$docId: bcastDocId,
				$runId: bcastRunId,
				$path: bcastOriginalPath,
				$type: "markdown",
				$projectPath: bcastTmpDir,
				$feature: "feat-bcast",
			});

		await mkdir(dirname(join(bcastTmpDir, bcastArchivedPath)), {
			recursive: true,
		});
		const fileContent = `---\nrp1_doc_id: ${bcastDocId}\ntitle: Design\n---\n# Design`;
		await Bun.write(join(bcastTmpDir, bcastArchivedPath), fileContent);

		tmpDir = bcastTmpDir;
		testDb = bcastDb;
	});

	afterAll(async () => {
		bcastDb?.close();
		if (bcastTmpDir) await rm(bcastTmpDir, { recursive: true, force: true });
	});

	test("broadcasts artifact_registered when save handler reconciles a moved file via doc_id fallback", async () => {
		const broadcastCalls: unknown[][] = [];
		const mockHub = {
			broadcastEvent: (...args: unknown[]) => {
				broadcastCalls.push(args);
			},
		};

		const newContent = `---\nrp1_doc_id: ${bcastDocId}\ntitle: Design\n---\n# Updated`;
		const req = new Request("http://localhost/api/save", {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				path: bcastArchivedPath,
				content: newContent,
			}),
		});

		const response = await handleArtifactSaveRequest(bcastRunId, req, {
			port: 3000,
			startTime: Date.now(),
			websocketHub: mockHub as any,
		});
		expect(response.status).toBe(200);

		expect(broadcastCalls.length).toBeGreaterThanOrEqual(1);
		const call = broadcastCalls[0];
		const [projectId, _eventId, eventType, callRunId, featureId, _step, data] =
			call;
		expect(projectId).toBe("test-project");
		expect(eventType).toBe("artifact_registered");
		expect(callRunId).toBe(bcastRunId);
		expect(featureId).toBe("feat-bcast");
		expect((data as Record<string, unknown>).docId).toBe(bcastDocId);
		expect((data as Record<string, unknown>).reconciled).toBe(true);
	});
});
