/**
 * Unit tests for the teach-me lesson schema and parseLesson contract.
 *
 * Covers the load-bearing data-model guarantees (REQ-001, REQ-002, REQ-003):
 * - a complete valid lesson parses to Right(LessonModel)
 * - a missing required top-level field yields Left whose message names the field
 * - an off-allowlist block.type yields Left naming the unknown type
 * - a mismatched schemaVersion/libraryVersion yields a version-mismatch Left
 */

import { describe, expect, test } from "bun:test";
import {
	BLOCK_TYPES,
	type LessonModel,
	LIBRARY_VERSION,
	parseLesson,
	SCHEMA_VERSION,
} from "../../teach-me/schema/index.js";
import { expectLeft, expectRight, getErrorMessage } from "../helpers/index.js";

/**
 * A complete, structurally valid lesson that exercises every allowlisted
 * block type. Doubles as the discriminated-union completeness guard: if a
 * block type is missing from the union, building this object fails to parse.
 */
function validLesson(): unknown {
	return {
		schemaVersion: SCHEMA_VERSION,
		meta: {
			title: "How persistence works in this repo",
			topicType: "repo",
			learnerPromise: "Trace and safely modify persistence code",
			coreMentalModel:
				"Requests flow through a repository layer that brackets all DB access",
			primarySpine: "code-path-explorer",
			learner: {
				familiarity: "intermediate",
				desiredDepth: "implementation",
				targetOutcome: "Modify the save path safely",
				constraints: [],
			},
			theme: "auto",
			libraryVersion: LIBRARY_VERSION,
		},
		sections: [
			{
				id: "lifecycle",
				heading: "Write lifecycle",
				intent: "sequence",
				blocks: [
					{ type: "prose", md: "The write path begins at the handler." },
					{
						type: "callout",
						variant: "warn",
						title: "Heads up",
						md: "Bracket all DB access.",
					},
					{
						type: "code",
						lang: "ts",
						code: "export const save = () => {};",
						filename: "src/db/repo.ts",
					},
					{
						type: "table",
						headers: ["Layer", "Responsibility"],
						rows: [["repo", "brackets DB access"]],
						caption: "Layers",
					},
					{ type: "key-insight", md: "Everything funnels through repo." },
					{
						type: "glossary",
						terms: [{ term: "bracket", def: "wrap begin/commit" }],
					},
					{
						type: "diagram",
						source: "flowchart TD; A-->B",
						alt: "A points to B",
						title: "Flow",
					},
					{
						type: "timeline",
						data: {
							controls: "step",
							actors: ["History (server)", "Worker"],
							steps: [
								{
									title: "client.start(orderWorkflow)",
									desc: "Workflow is initiated.",
									state: { Worker: "idle" },
									annotations: ["WorkflowExecutionStarted"],
								},
							],
						},
					},
					{
						type: "decision-tree",
						data: {
							root: {
								question: "Does it need to survive crashes?",
								branches: [
									{
										label: "No",
										terminal: {
											verdict: "no",
											text: "Use a simple job queue.",
										},
									},
									{
										label: "Yes",
										node: {
											question: "Does it run for minutes?",
											branches: [
												{
													label: "Yes",
													terminal: {
														verdict: "yes",
														text: "Use a durable workflow.",
													},
												},
											],
										},
									},
								],
							},
						},
					},
					{
						type: "stepper",
						data: {
							steps: [{ title: "Step 1", md: "Do the first thing." }],
						},
					},
					{
						type: "state-explorer",
						data: {
							initial: "idle",
							states: [
								{ id: "idle", label: "Idle" },
								{ id: "running", label: "Running", description: "Working" },
							],
							transitions: [{ from: "idle", to: "running", label: "start" }],
						},
					},
					{
						type: "layer-explorer",
						data: {
							layers: [
								{
									id: "repo",
									name: "Repository",
									responsibilities: ["brackets DB access"],
								},
							],
						},
					},
					{
						type: "compare-cards",
						data: {
							cards: [{ title: "Strong", points: ["linearizable"] }],
						},
					},
					{
						type: "code-walkthrough",
						data: {
							lang: "ts",
							code: "const x = 1;\nconst y = 2;",
							steps: [{ lines: "1", md: "Declare x." }],
						},
					},
					{
						type: "quiz",
						data: {
							questions: [
								{
									q: "Where does DB access happen?",
									choices: ["Handler", "Repository"],
									answer: 1,
									explanation: "The repository brackets DB access.",
								},
							],
						},
					},
				],
			},
		],
		checks: [
			{
				q: "What brackets DB access?",
				choices: ["The handler", "The repository"],
				answer: 1,
				explanation: "The repository layer brackets all DB access.",
			},
			{
				q: "Where do transactions begin?",
				choices: ["In the handler", "In the repository layer"],
				answer: 1,
				explanation: "The repository layer starts and commits transactions.",
			},
			{
				q: "What does the save function do?",
				choices: ["Deletes data", "Persists data"],
				answer: 1,
				explanation: "The save function persists data through the repository.",
			},
		],
		glossary: [{ term: "repository", def: "layer bracketing DB access" }],
		misconceptions: ["DB access is scattered across handlers."],
		next: ["Read the transaction module."],
		references: [
			{
				kind: "repo",
				path: "src/db/repo.ts",
				symbol: "save()",
				lines: "40-72",
				why: "Primary save path",
			},
			{
				kind: "web",
				title: "ACID",
				org: "Wikipedia",
				url: "https://example.com/acid",
				usedFor: "background",
			},
		],
	};
}

describe("parseLesson", () => {
	test("accepts a complete valid lesson exercising every block type", () => {
		const result = parseLesson(validLesson());
		const lesson: LessonModel = expectRight(result);

		expect(lesson.schemaVersion).toBe(SCHEMA_VERSION);
		expect(lesson.meta.libraryVersion).toBe(LIBRARY_VERSION);

		const renderedTypes = lesson.sections[0]?.blocks.map((b) => b.type) ?? [];
		// Every allowlisted block type is admitted by the discriminated union.
		for (const type of BLOCK_TYPES) {
			expect(renderedTypes).toContain(type);
		}
	});

	test("rejects a missing required top-level field, naming the field", () => {
		const lesson = validLesson() as Record<string, unknown>;
		delete lesson.meta;

		const error = expectLeft(parseLesson(lesson));
		expect(error._tag).toBe("ValidationError");
		expect(getErrorMessage(error)).toContain("meta");
	});

	test("rejects an off-allowlist block.type, naming the unknown type", () => {
		const lesson = validLesson() as {
			sections: Array<{ blocks: Array<{ type: string }> }>;
		};
		lesson.sections[0]!.blocks = [{ type: "wizard" }];

		const error = expectLeft(parseLesson(lesson));
		expect(error._tag).toBe("ValidationError");
		expect(getErrorMessage(error)).toContain("wizard");
	});

	test("rejects an unknown schemaVersion with a version-mismatch error", () => {
		const lesson = validLesson() as { schemaVersion: string };
		lesson.schemaVersion = "9.9";

		const error = expectLeft(parseLesson(lesson));
		expect(error._tag).toBe("ValidationError");
		const message = getErrorMessage(error);
		expect(message).toContain("schemaVersion");
		expect(message).toContain(SCHEMA_VERSION);
	});

	test("rejects an unknown libraryVersion with a version-mismatch error", () => {
		const lesson = validLesson() as { meta: { libraryVersion: string } };
		lesson.meta.libraryVersion = "9.9";

		const error = expectLeft(parseLesson(lesson));
		expect(error._tag).toBe("ValidationError");
		const message = getErrorMessage(error);
		expect(message).toContain("libraryVersion");
		expect(message).toContain(LIBRARY_VERSION);
	});

	test("rejects a quiz answer index outside the choices range", () => {
		const lesson = validLesson() as {
			checks: Array<{ choices: string[]; answer: number }>;
		};
		lesson.checks[0]!.answer = 5;

		const error = expectLeft(parseLesson(lesson));
		expect(error._tag).toBe("ValidationError");
	});

	test("exposes the 15 MVP block types in the allowlist", () => {
		expect(BLOCK_TYPES).toHaveLength(15);
		expect([...BLOCK_TYPES]).toEqual(
			expect.arrayContaining([
				"prose",
				"callout",
				"code",
				"table",
				"key-insight",
				"timeline",
				"decision-tree",
				"stepper",
				"state-explorer",
				"layer-explorer",
				"compare-cards",
				"code-walkthrough",
				"quiz",
				"glossary",
				"diagram",
			]),
		);
	});
});
