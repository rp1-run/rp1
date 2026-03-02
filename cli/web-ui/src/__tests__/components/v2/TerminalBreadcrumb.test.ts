import { describe, expect, test } from "bun:test";
import { buildSegments } from "../../../components/v2/TerminalBreadcrumb";

describe("buildSegments", () => {
	test("returns empty array for root path", () => {
		expect(buildSegments("/")).toEqual([]);
	});

	test("returns single segment for one-level path", () => {
		expect(buildSegments("/runs")).toEqual([{ label: "runs", to: "/runs" }]);
	});

	test("returns segments with cumulative paths for multi-level path", () => {
		expect(buildSegments("/runs/abc")).toEqual([
			{ label: "runs", to: "/runs" },
			{ label: "abc", to: "/runs/abc" },
		]);
	});

	test("handles deep nested paths", () => {
		expect(buildSegments("/projects/my-project/files/src")).toEqual([
			{ label: "projects", to: "/projects" },
			{ label: "my-project", to: "/projects/my-project" },
			{ label: "files", to: "/projects/my-project/files" },
			{ label: "src", to: "/projects/my-project/files/src" },
		]);
	});

	test("handles trailing slash", () => {
		expect(buildSegments("/runs/")).toEqual([{ label: "runs", to: "/runs" }]);
	});

	test("handles path with encoded segments", () => {
		expect(buildSegments("/runs/abc-123/artifacts/README.md")).toEqual([
			{ label: "runs", to: "/runs" },
			{ label: "abc-123", to: "/runs/abc-123" },
			{ label: "artifacts", to: "/runs/abc-123/artifacts" },
			{ label: "README.md", to: "/runs/abc-123/artifacts/README.md" },
		]);
	});
});
