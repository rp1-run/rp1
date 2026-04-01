import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import {
	closeDatabase,
	getEmitDatabase,
	insertRun,
	resetInstance,
	setArtifactBaseline,
	upsertAnnotation,
	upsertArtifact,
} from "../../../agent-tools/emit/database.js";
import { executeFeedbackRead } from "../../../agent-tools/feedback/read.js";
import {
	createTempDir,
	expectTaskRight,
	writeFixture,
} from "../../helpers/index.js";

describe("feedback read", () => {
	let tempDir: string;
	let dbPath: string;
	let testCounter = 0;
	const runId = "run-feedback-read";

	beforeEach(async () => {
		closeDatabase();
		resetInstance();
		tempDir = await createTempDir("feedback-read");
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

	test("returns empty result when no annotations or edits exist", async () => {
		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations).toHaveLength(0);
		expect(result.data.edits).toHaveLength(0);
		expect(result.data.summary.totalAnnotations).toBe(0);
		expect(result.data.summary.totalEdits).toBe(0);
	});

	test("returns annotations filtered by open status", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-1",
			runId,
			path: "requirements.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		upsertAnnotation(db, {
			docId: "doc-1",
			runId,
			content: "Fix this requirement",
			status: "open",
			author: "user",
			data: JSON.stringify({ artifactPath: "requirements.md" }),
		});

		upsertAnnotation(db, {
			docId: "doc-1",
			runId,
			content: "Already handled",
			status: "resolved",
			author: "user",
			data: JSON.stringify({ artifactPath: "requirements.md" }),
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations).toHaveLength(1);
		expect(result.data.annotations[0].content).toBe("Fix this requirement");
		expect(result.data.annotations[0].status).toBe("open");
	});

	test("returns all annotations when status is all", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-2",
			runId,
			path: "design.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		upsertAnnotation(db, {
			docId: "doc-2",
			runId,
			content: "Open one",
			status: "open",
			author: "user",
		});

		upsertAnnotation(db, {
			docId: "doc-2",
			runId,
			content: "Resolved one",
			status: "resolved",
			author: "user",
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "all", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations).toHaveLength(2);
	});

	test("finds annotations with null run_id via artifact join", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-null-run",
			runId,
			path: "design.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		// Simulate the bug: annotation created without run_id (as the web UI did)
		upsertAnnotation(db, {
			docId: "doc-null-run",
			content: "Fix this diagram",
			status: "open",
			author: "user",
			data: JSON.stringify({ artifactPath: "design.md" }),
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations).toHaveLength(1);
		expect(result.data.annotations[0].content).toBe("Fix this diagram");

		// Also verify with status "all"
		const allResult = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "all", projectPath: tempDir },
				dbPath,
			),
		);

		expect(allResult.data.annotations).toHaveLength(1);
	});

	test("includes replies nested under root annotations", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-3",
			runId,
			path: "code.ts",
			type: "code",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		const root = upsertAnnotation(db, {
			docId: "doc-3",
			runId,
			content: "This function is wrong",
			status: "open",
			author: "user",
		});

		upsertAnnotation(db, {
			docId: "doc-3",
			runId,
			content: "Looking into it",
			parentId: root.id,
			status: "open",
			author: "agent",
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations).toHaveLength(1);
		const ann = result.data.annotations[0];
		expect(ann.content).toBe("This function is wrong");
		expect(ann.replies).toHaveLength(1);
		expect(ann.replies[0].content).toBe("Looking into it");
		expect(ann.replies[0].author).toBe("agent");
	});

	test("computes diffs for artifacts with edited baselines", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		await writeFixture(
			tempDir,
			"edited-file.md",
			"# Updated\n\nNew content here.",
		);

		upsertArtifact(db, {
			docId: "doc-edit-1",
			runId,
			path: "edited-file.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		setArtifactBaseline(db, "doc-edit-1", "# Original\n\nOld content here.");

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.edits).toHaveLength(1);
		expect(result.data.edits[0].docId).toBe("doc-edit-1");
		expect(result.data.edits[0].artifactPath).toBe("edited-file.md");
		expect(result.data.edits[0].patch).toContain("---");
		expect(result.data.edits[0].patch).toContain("+++");
		expect(result.data.edits[0].patch).toContain("Original");
		expect(result.data.edits[0].patch).toContain("Updated");
	});

	test("filters out artifacts where baseline matches current content", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		const content = "# Same\n\nNo changes.";
		await writeFixture(tempDir, "unchanged.md", content);

		upsertArtifact(db, {
			docId: "doc-unchanged",
			runId,
			path: "unchanged.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		setArtifactBaseline(db, "doc-unchanged", content);

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.edits).toHaveLength(0);
	});

	test("summary groups annotations by artifact type", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-req",
			runId,
			path: "requirements.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		upsertArtifact(db, {
			docId: "doc-code",
			runId,
			path: "src/index.ts",
			type: "code",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		upsertAnnotation(db, {
			docId: "doc-req",
			runId,
			content: "Requirement issue",
			status: "open",
			author: "user",
			data: JSON.stringify({ artifactPath: "requirements.md" }),
		});

		upsertAnnotation(db, {
			docId: "doc-code",
			runId,
			content: "Code bug",
			status: "open",
			author: "user",
			data: JSON.stringify({ artifactPath: "src/index.ts" }),
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.summary.totalAnnotations).toBe(2);
		expect(result.data.summary.byArtifactType.requirements).toBe(1);
		expect(result.data.summary.byArtifactType.code).toBe(1);
	});

	test("parses anchor data from annotation JSON", async () => {
		const db = await expectTaskRight(getEmitDatabase(dbPath));

		upsertArtifact(db, {
			docId: "doc-anchor",
			runId,
			path: "design.md",
			type: "markdown",
			storageRoot: "work_dir",
			projectPath: tempDir,
			feature: "feat-1",
		});

		const anchorData = {
			artifactPath: "design.md",
			anchor: { line: 10, column: 5 },
		};

		upsertAnnotation(db, {
			docId: "doc-anchor",
			runId,
			content: "Anchored note",
			status: "open",
			author: "user",
			data: JSON.stringify(anchorData),
		});

		const result = await expectTaskRight(
			executeFeedbackRead(
				{ runId, status: "open", projectPath: tempDir },
				dbPath,
			),
		);

		expect(result.data.annotations[0].artifactPath).toBe("design.md");
		expect(result.data.annotations[0].anchor).toEqual({ line: 10, column: 5 });
	});
});
