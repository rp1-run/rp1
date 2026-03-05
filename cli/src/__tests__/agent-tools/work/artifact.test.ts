/**
 * Unit tests for artifact registration in the work status database.
 * Tests insert, query, type classification, and edge cases.
 */

import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	test,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	closeDatabase,
	insertArtifact,
	queryArtifactsForFeature,
	resetDatabaseInstance,
} from "../../../agent-tools/work/database.js";
import type { ArtifactInput } from "../../../agent-tools/work/models.js";
import { expectTaskRight } from "../../helpers/index.js";

describe("artifact registration", () => {
	let tempDir: string;
	let testDbPath: string;

	beforeAll(async () => {
		tempDir = join(tmpdir(), `artifact-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		testDbPath = join(tempDir, "test-status.db");
	});

	afterEach(() => {
		closeDatabase();
		resetDatabaseInstance();
	});

	afterAll(async () => {
		closeDatabase();
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("insertArtifact", () => {
		test("returns auto-generated id and timestamp", async () => {
			const input: ArtifactInput = {
				projectPath: "/test/project",
				feature: "test-feature",
				path: ".rp1/work/research/report.md",
				type: "markdown",
			};

			const result = await expectTaskRight(insertArtifact(input, testDbPath));

			expect(result.id).toBeGreaterThan(0);
			expect(result.createdAt).toMatch(
				/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
			);
		});

		test("stores all provided fields including runId", async () => {
			const input: ArtifactInput = {
				projectPath: "/test/project",
				feature: "feature-a",
				runId: "550e8400-e29b-41d4-a716-446655440000",
				path: ".rp1/work/features/feature-a/requirements.md",
				type: "markdown",
			};

			await expectTaskRight(insertArtifact(input, testDbPath));

			const records = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/project",
					"feature-a",
					undefined,
					testDbPath,
				),
			);

			const record = records.find(
				(r) => r.path === ".rp1/work/features/feature-a/requirements.md",
			);
			expect(record).toBeDefined();
			expect(record?.projectPath).toBe("/test/project");
			expect(record?.feature).toBe("feature-a");
			expect(record?.runId).toBe("550e8400-e29b-41d4-a716-446655440000");
			expect(record?.type).toBe("markdown");
		});

		test("stores null runId when not provided", async () => {
			const input: ArtifactInput = {
				projectPath: "/test/project",
				feature: "no-run-id",
				path: ".rp1/work/quick-builds/output.md",
				type: "markdown",
			};

			await expectTaskRight(insertArtifact(input, testDbPath));

			const records = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/project",
					"no-run-id",
					undefined,
					testDbPath,
				),
			);

			expect(records.length).toBeGreaterThanOrEqual(1);
			const record = records.find(
				(r) => r.path === ".rp1/work/quick-builds/output.md",
			);
			expect(record?.runId).toBeNull();
		});

		test("accepts all valid artifact types", async () => {
			const types = [
				"markdown",
				"code",
				"diagram",
				"diff",
				"report",
				"other",
			] as const;

			for (const type of types) {
				const input: ArtifactInput = {
					projectPath: "/test/types",
					feature: `type-${type}`,
					path: `.rp1/work/test.${type}`,
					type,
				};

				const result = await expectTaskRight(insertArtifact(input, testDbPath));
				expect(result.id).toBeGreaterThan(0);
			}
		});

		test("allows multiple artifacts for the same feature", async () => {
			const base: Omit<ArtifactInput, "path"> = {
				projectPath: "/test/multi",
				feature: "multi-artifact",
				runId: "run-1",
				type: "markdown",
			};

			await expectTaskRight(
				insertArtifact(
					{
						...base,
						path: ".rp1/work/features/multi-artifact/requirements.md",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{ ...base, path: ".rp1/work/features/multi-artifact/design.md" },
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{ ...base, path: ".rp1/work/features/multi-artifact/tasks.md" },
					testDbPath,
				),
			);

			const records = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/multi",
					"multi-artifact",
					undefined,
					testDbPath,
				),
			);

			expect(records.length).toBe(3);
		});

		test("completes within 100ms under normal conditions", async () => {
			const input: ArtifactInput = {
				projectPath: "/test/latency",
				feature: "latency-test",
				path: ".rp1/work/test.md",
				type: "markdown",
			};

			const start = performance.now();
			await expectTaskRight(insertArtifact(input, testDbPath));
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
		});
	});

	describe("queryArtifactsForFeature", () => {
		test("returns only artifacts matching project and feature", async () => {
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/project-a",
						feature: "feat-1",
						path: "a.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/project-b",
						feature: "feat-1",
						path: "b.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/project-a",
						feature: "feat-2",
						path: "c.md",
						type: "markdown",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryArtifactsForFeature("/project-a", "feat-1", undefined, testDbPath),
			);

			expect(results.length).toBe(1);
			expect(results[0].path).toBe("a.md");
		});

		test("scopes results by runId when provided", async () => {
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/scope",
						feature: "scoped",
						runId: "run-a",
						path: "from-run-a.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/scope",
						feature: "scoped",
						runId: "run-b",
						path: "from-run-b.md",
						type: "markdown",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryArtifactsForFeature("/test/scope", "scoped", "run-a", testDbPath),
			);

			expect(results.length).toBe(1);
			expect(results[0].path).toBe("from-run-a.md");
			expect(results[0].runId).toBe("run-a");
		});

		test("returns all runs when runId not specified", async () => {
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/all-runs",
						feature: "unscoped",
						runId: "run-x",
						path: "x.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/all-runs",
						feature: "unscoped",
						runId: "run-y",
						path: "y.md",
						type: "markdown",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/all-runs",
					"unscoped",
					undefined,
					testDbPath,
				),
			);

			expect(results.length).toBe(2);
		});

		test("returns records ordered by created_at ascending", async () => {
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/order",
						feature: "ordered",
						path: "first.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await new Promise((resolve) => setTimeout(resolve, 10));
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/order",
						feature: "ordered",
						path: "second.md",
						type: "code",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/order",
					"ordered",
					undefined,
					testDbPath,
				),
			);

			expect(results[0].path).toBe("first.md");
			expect(results[1].path).toBe("second.md");
		});

		test("returns empty array for non-existent feature", async () => {
			const results = await expectTaskRight(
				queryArtifactsForFeature(
					"/non-existent",
					"no-feature",
					undefined,
					testDbPath,
				),
			);

			expect(results).toEqual([]);
		});

		test("returns correct type field for each artifact", async () => {
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/types-query",
						feature: "typed",
						path: "report.md",
						type: "markdown",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/types-query",
						feature: "typed",
						path: "chart.mmd",
						type: "diagram",
					},
					testDbPath,
				),
			);
			await expectTaskRight(
				insertArtifact(
					{
						projectPath: "/test/types-query",
						feature: "typed",
						path: "changes.diff",
						type: "diff",
					},
					testDbPath,
				),
			);

			const results = await expectTaskRight(
				queryArtifactsForFeature(
					"/test/types-query",
					"typed",
					undefined,
					testDbPath,
				),
			);

			expect(results.length).toBe(3);
			const byPath = new Map(results.map((r) => [r.path, r]));
			expect(byPath.get("report.md")?.type).toBe("markdown");
			expect(byPath.get("chart.mmd")?.type).toBe("diagram");
			expect(byPath.get("changes.diff")?.type).toBe("diff");
		});
	});
});
