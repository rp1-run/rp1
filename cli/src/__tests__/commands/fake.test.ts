/**
 * Unit tests for the fake command's pure utility functions.
 * Covers command string parsing, feature ID generation, and run ID generation.
 */

import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	generateFeatureId,
	generateRunId,
	parseWorkflowName,
	resolveArtifactPaths,
} from "../../commands/fake.js";

describe("parseWorkflowName", () => {
	test("extracts workflow name from slash-prefixed command with quoted argument", () => {
		expect(parseWorkflowName("/build 'test'")).toBe("build");
	});

	test("extracts workflow name from bare command string", () => {
		expect(parseWorkflowName("build")).toBe("build");
	});

	test("extracts hyphenated workflow name from slash-prefixed command", () => {
		expect(parseWorkflowName("/knowledge-build")).toBe("knowledge-build");
	});

	test("strips multiple leading slashes", () => {
		expect(parseWorkflowName("///build 'test'")).toBe("build");
	});

	test("trims leading whitespace", () => {
		expect(parseWorkflowName("  /build 'test'")).toBe("build");
	});

	test("trims trailing whitespace", () => {
		expect(parseWorkflowName("/build  ")).toBe("build");
	});

	test("handles command with double-quoted argument", () => {
		expect(parseWorkflowName('/build "an oauth system"')).toBe("build");
	});

	test("handles tab-separated arguments", () => {
		expect(parseWorkflowName("/build\ttest")).toBe("build");
	});

	test("extracts only first token when multiple spaces separate arguments", () => {
		expect(parseWorkflowName("build   some   feature   name")).toBe("build");
	});
});

describe("generateFeatureId", () => {
	test("returns provided feature option when given", () => {
		expect(generateFeatureId("my-feature")).toBe("my-feature");
	});

	test("auto-generates fake-prefixed ID with timestamp when no option given", () => {
		const id = generateFeatureId();
		expect(id).toMatch(/^fake-\d+$/);
	});

	test("auto-generates fake-prefixed ID when option is undefined", () => {
		const id = generateFeatureId(undefined);
		expect(id).toMatch(/^fake-\d+$/);
	});

	test("auto-generated timestamp is recent", () => {
		const before = Date.now();
		const id = generateFeatureId();
		const after = Date.now();
		const timestamp = Number.parseInt(id.replace("fake-", ""), 10);
		expect(timestamp).toBeGreaterThanOrEqual(before);
		expect(timestamp).toBeLessThanOrEqual(after);
	});
});

describe("generateRunId", () => {
	test("produces a fake-prefixed UUID", () => {
		const id = generateRunId();
		expect(id).toMatch(
			/^fake-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	test("generates unique IDs on successive calls", () => {
		const ids = new Set(Array.from({ length: 10 }, () => generateRunId()));
		expect(ids.size).toBe(10);
	});
});

describe("resolveArtifactPaths", () => {
	test("builds work-dir-relative artifact registration paths", () => {
		const workDir = "/tmp/rp1-work";
		const result = resolveArtifactPaths(
			workDir,
			"feature-123",
			"verify-report.md",
		);

		expect(result.artifactPath).toBe(
			join("features", "feature-123", "verify-report.md"),
		);
		expect(result.fullDir).toBe(join(workDir, "features", "feature-123"));
		expect(result.artifactPath.startsWith(workDir)).toBe(false);
	});
});
