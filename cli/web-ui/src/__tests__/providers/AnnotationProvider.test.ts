import { describe, expect, test } from "bun:test";
import { buildAnnotationsUrl } from "../../providers/AnnotationProvider";

describe("buildAnnotationsUrl", () => {
	test("prefers docId and preserves run scoping", () => {
		expect(buildAnnotationsUrl({ docId: "doc-1", runId: "run-1" })).toBe(
			"/api/v2/annotations?docId=doc-1&runId=run-1",
		);
	});

	test("falls back to run scope when docId is unavailable", () => {
		expect(buildAnnotationsUrl({ runId: "run-2" })).toBe(
			"/api/v2/annotations?runId=run-2",
		);
	});

	test("uses the collection endpoint without scope when no identity is known", () => {
		expect(buildAnnotationsUrl({})).toBe("/api/v2/annotations");
	});
});
