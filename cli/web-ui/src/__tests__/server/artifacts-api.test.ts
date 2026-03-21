/**
 * Unit tests for artifact save endpoint path validation, baseline capture,
 * and patch (unified diff) endpoint.
 */

import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
}));

mock.module("../../server/registry", () => ({
	getAllProjects: async () => [
		{ id: "test-project", path: tmpDir, name: "Test Project" },
	],
}));

import {
	handleArtifactPatchRequest,
	handleArtifactSaveRequest,
	validateSavePath,
} from "../../server/routes/artifacts-api";

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
		testDb.exec(`
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
		`);

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
		patchDb.exec(`
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
		`);

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
