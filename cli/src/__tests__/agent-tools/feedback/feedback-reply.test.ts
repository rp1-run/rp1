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
import { executeFeedbackReply } from "../../../agent-tools/feedback/reply.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
} from "../../helpers/index.js";

describe("feedback reply", () => {
	let tempDir: string;
	let dbPath: string;
	let testCounter = 0;
	const runId = "run-reply-test";

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("feedback-reply");
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
			docId: "doc-reply",
			runId,
			path: "file.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("creates reply with agent author attribution", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const root = upsertAnnotation(db, {
			docId: "doc-reply",
			runId,
			content: "Something is off",
			status: "open",
			author: "user",
		});

		const result = await expectTaskRight(
			executeFeedbackReply(
				{ annotationId: root.id, content: "Investigating now" },
				dbPath,
			),
		);

		expect(result.data.replyId).toBeDefined();
		expect(result.data.annotationId).toBe(root.id);

		const reply = getAnnotationById(db, result.data.replyId);
		expect(reply).toBeDefined();
		expect(reply?.content).toBe("Investigating now");
		expect(reply?.author).toBe("agent");
		expect(reply?.parentId).toBe(root.id);
	});

	test("preserves existing replies when adding new one", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));
		const root = upsertAnnotation(db, {
			docId: "doc-reply",
			runId,
			content: "Check this",
			status: "open",
			author: "user",
		});

		upsertAnnotation(db, {
			docId: "doc-reply",
			runId,
			content: "First reply",
			parentId: root.id,
			status: "open",
			author: "user",
		});

		await expectTaskRight(
			executeFeedbackReply(
				{ annotationId: root.id, content: "Agent reply" },
				dbPath,
			),
		);

		const allForDoc = getAnnotationsForDocId(db, "doc-reply");
		const replies = allForDoc.filter((a) => a.parentId === root.id);
		expect(replies).toHaveLength(2);
		expect(replies.map((r) => r.content)).toContain("First reply");
		expect(replies.map((r) => r.content)).toContain("Agent reply");
	});

	test("returns error for non-existent parent annotation", async () => {
		const error = await expectTaskLeft(
			executeFeedbackReply({ annotationId: 99999, content: "Hello" }, dbPath),
		);
		expect(error._tag).toBe("NotFoundError");
	});
});
