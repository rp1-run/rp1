import { describe, expect, test } from "bun:test";
import {
	buildProjectLookup,
	findProjectByIdentity,
} from "../../server/project-lookup";
import type { ProjectEntry } from "../../server/registry";

const projects: readonly ProjectEntry[] = [
	{
		id: "project-uuid-1",
		projectId: "project-uuid-1",
		path: "/repo/main",
		name: "main",
		addedAt: "2026-04-01T00:00:00.000Z",
		lastAccessedAt: "2026-04-01T00:00:00.000Z",
		available: true,
	},
	{
		id: "legacy-project",
		projectId: undefined,
		path: "/repo/legacy",
		name: "legacy",
		addedAt: "2026-04-01T00:00:00.000Z",
		lastAccessedAt: "2026-04-01T00:00:00.000Z",
		available: true,
	},
];

describe("project-lookup", () => {
	test("prefers stable projectId when available", () => {
		const lookup = buildProjectLookup(projects);

		const project = findProjectByIdentity(lookup, {
			projectId: "project-uuid-1",
			projectPath: "/repo/worktree",
		});

		expect(project?.path).toBe("/repo/main");
	});

	test("falls back to canonical rp1 project root", () => {
		const lookup = buildProjectLookup(projects);

		const project = findProjectByIdentity(lookup, {
			rp1ProjectRoot: "/repo/main",
			projectPath: "/repo/worktree",
		});

		expect(project?.id).toBe("project-uuid-1");
	});

	test("falls back to raw project path for legacy projects", () => {
		const lookup = buildProjectLookup(projects);

		const project = findProjectByIdentity(lookup, {
			projectPath: "/repo/legacy",
		});

		expect(project?.id).toBe("legacy-project");
	});
});
