import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getArtifactBaseline,
	getEmitDatabase,
	insertRun,
	resetInstance,
	setArtifactBaseline,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeFeedbackAcceptEdit } from "../../../agent-tools/feedback/accept.js";
import {
	createTempDir,
	expectTaskLeft,
	expectTaskRight,
} from "../../helpers/index.js";

describe("feedback accept-edit", () => {
	let tempDir: string;
	let dbPath: string;
	let testCounter = 0;
	const runId = "run-accept-test";

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("feedback-accept");
		testCounter++;
		dbPath = join(tempDir, `test-${testCounter}.db`);
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		insertRun(db, {
			id: runId,
			flow: "build",
			featureId: "feat-1",
			projectPath: tempDir,
		});
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("clears baseline on accept", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-accept",
			runId,
			path: "edited.md",
			type: "markdown",
			projectPath: tempDir,
			feature: "feat-1",
		});

		setArtifactBaseline(db, "doc-accept", "original content");

		const result = await expectTaskRight(
			executeFeedbackAcceptEdit({ docId: "doc-accept" }, dbPath),
		);

		expect(result.data.accepted).toBe(true);
		expect(result.data.docId).toBe("doc-accept");

		const baseline = getArtifactBaseline(db, "doc-accept");
		expect(baseline).not.toBeNull();
		expect(baseline?.baseline).toBeNull();
	});

	test("returns error when baseline is already null", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-no-edit",
			runId,
			path: "clean.md",
			type: "markdown",
			projectPath: tempDir,
			feature: "feat-1",
		});

		const error = await expectTaskLeft(
			executeFeedbackAcceptEdit({ docId: "doc-no-edit" }, dbPath),
		);
		expect(error._tag).toBe("UsageError");
	});

	test("returns error for non-existent artifact", async () => {
		const error = await expectTaskLeft(
			executeFeedbackAcceptEdit({ docId: "nonexistent-doc" }, dbPath),
		);
		expect(error._tag).toBe("NotFoundError");
	});
});
