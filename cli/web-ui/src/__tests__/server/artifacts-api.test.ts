/**
 * Unit tests for artifact save endpoint path validation and baseline capture.
 * Tests directory traversal prevention, project root boundary enforcement,
 * non-existent file rejection, valid write success, and baseline capture on
 * first save with non-overwrite on subsequent saves.
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
	setArtifactBaseline: (db: Database, docId: string, baseline: string) => {
		db.prepare(
			"UPDATE artifacts SET baseline = $baseline WHERE doc_id = $docId",
		).run({ $baseline: baseline, $docId: docId });
	},
}));

mock.module("../../server/registry", () => ({
	getAllProjects: async () => [
		{ id: "test-project", path: tmpDir, name: "Test Project" },
	],
}));

import {
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
