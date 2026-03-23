import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getAnnotationById,
	getAnnotationsForDocId,
	getEmitDatabase,
	insertRun,
	resetInstance,
	upsertAnnotation,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeFeedbackResolve } from "../../../agent-tools/feedback/resolve.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
} from "../../helpers/index.js";

describe("feedback resolve", () => {
	let tempDir: string;
	let dbPath: string;
	let testCounter = 0;
	const runId = "run-resolve-test";

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("feedback-resolve");
		testCounter++;
		dbPath = join(tempDir, `test-${testCounter}.db`);
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat-1",
			projectPath: tempDir,
		});

		upsertArtifact(db, {
			docId: "doc-resolve",
			runId,
			path: "file.md",
			type: "markdown",
			projectPath: tempDir,
			feature: "feat-1",
		});
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("resolves annotation without reply", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const ann = upsertAnnotation(db, {
			docId: "doc-resolve",
			runId,
			content: "Issue here",
			status: "open",
			author: "user",
		});

		const result = await expectTaskRight(
			executeFeedbackResolve({ annotationId: ann.id }, dbPath),
		);

		expect(result.data.resolved).toBe(true);
		expect(result.data.annotationId).toBe(ann.id);
		expect(result.data.replyId).toBeUndefined();

		const updated = getAnnotationById(db, ann.id);
		expect(updated?.status).toBe("resolved");
	});

	test("resolves annotation with reply and agent attribution", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const ann = upsertAnnotation(db, {
			docId: "doc-resolve",
			runId,
			content: "Fix this",
			status: "open",
			author: "user",
		});

		const result = await expectTaskRight(
			executeFeedbackResolve(
				{ annotationId: ann.id, reply: "Applied the fix" },
				dbPath,
			),
		);

		expect(result.data.resolved).toBe(true);
		expect(result.data.replyId).toBeDefined();

		const updated = getAnnotationById(db, ann.id);
		expect(updated?.status).toBe("resolved");

		const allForDoc = getAnnotationsForDocId(db, "doc-resolve");
		const reply = allForDoc.find((a) => a.parentId === ann.id);
		expect(reply).toBeDefined();
		expect(reply?.content).toBe("Applied the fix");
		expect(reply?.author).toBe("agent");
	});

	test("returns error for non-existent annotation", async () => {
		const error = await expectTaskLeft(
			executeFeedbackResolve({ annotationId: 99999 }, dbPath),
		);
		expect(error._tag).toBe("NotFoundError");
	});

	test("rejects resolving a reply annotation", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const root = upsertAnnotation(db, {
			docId: "doc-resolve",
			runId,
			content: "Root",
			status: "open",
			author: "user",
		});

		const reply = upsertAnnotation(db, {
			docId: "doc-resolve",
			runId,
			content: "Reply",
			parentId: root.id,
			status: "open",
			author: "agent",
		});

		const error = await expectTaskLeft(
			executeFeedbackResolve({ annotationId: reply.id }, dbPath),
		);
		expect(error._tag).toBe("UsageError");
	});
});
