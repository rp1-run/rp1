import { describe, expect, test } from "bun:test";
import {
	isDurableWorkspaceRoute,
	normalizeWorkspaceRoute,
} from "../../lib/workspace-routes";

describe("workspace route normalization", () => {
	test("classifies durable routes", () => {
		expect(normalizeWorkspaceRoute("/")).toEqual({
			type: "durable",
			durableRoute: "activity",
			rootPath: "/",
		});
		expect(normalizeWorkspaceRoute("/projects")).toEqual({
			type: "durable",
			durableRoute: "projects",
			rootPath: "/projects",
		});
		expect(isDurableWorkspaceRoute("/projects")).toBe(true);
	});

	test("classifies run workspaces across nested routes", () => {
		expect(
			normalizeWorkspaceRoute("/runs/run-42/step/build/artifact/doc-1"),
		).toEqual({
			type: "workspace",
			key: "run:run-42",
			kind: "run",
			rootPath: "/runs/run-42",
			title: "Run run-42",
			subtitle: null,
			projectId: null,
		});
		expect(
			normalizeWorkspaceRoute("/runs/run-42/artifacts/work/output.md"),
		).toEqual({
			type: "workspace",
			key: "run:run-42",
			kind: "run",
			rootPath: "/runs/run-42",
			title: "Run run-42",
			subtitle: null,
			projectId: null,
		});
	});

	test("distinguishes project overview and file browser workspaces", () => {
		expect(normalizeWorkspaceRoute("/projects/proj-1")).toEqual({
			type: "workspace",
			key: "project:proj-1",
			kind: "project",
			rootPath: "/projects/proj-1",
			title: "proj-1",
			subtitle: null,
			projectId: "proj-1",
		});
		expect(
			normalizeWorkspaceRoute("/projects/proj-1/files/work/docs/readme.md"),
		).toEqual({
			type: "workspace",
			key: "files:proj-1",
			kind: "files",
			rootPath: "/projects/proj-1/files",
			title: "proj-1 files",
			subtitle: null,
			projectId: "proj-1",
		});
	});

	test("returns unknown for non-workspace routes", () => {
		expect(normalizeWorkspaceRoute("/settings")).toEqual({ type: "unknown" });
	});
});
