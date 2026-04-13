/**
 * Unit tests for the DB-backed project registry.
 * Tests CRUD operations, hydration from projects.json, re-keying,
 * availability refresh, stale project pruning, and lastInvoked round-trips.
 */

import { Database } from "bun:sqlite";
import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

let mockConfigDir: string;

mock.module("../../daemon/config-dir", () => ({
	getConfigDir: () => mockConfigDir,
	ensureConfigDir: async () => {
		await mkdir(mockConfigDir, { recursive: true });
		return mockConfigDir;
	},
}));

let resolveOverride:
	| ((startPath: string) => { _tag: string; right?: unknown; left?: unknown })
	| null = null;

mock.module("../../../../shared/directory-resolution.js", () => ({
	resolveDirectorySet: (
		startPath: string = process.cwd(),
		_options?: unknown,
	) => {
		if (resolveOverride) return resolveOverride(startPath);
		return {
			_tag: "Right",
			right: {
				projectRoot: startPath,
				projectId: undefined,
				kbRoot: `${startPath}/.rp1/context`,
				workRoot: `${startPath}/.rp1/work`,
				isWorktree: false,
			},
		};
	},
	normalizeProjectKey: (key: string) => key,
}));

import {
	_resetHydrated,
	ensureHydrated,
	getAllProjects,
	getLastInvokedProjectId,
	getProject,
	getProjectCount,
	pruneStaleProjects,
	refreshProjectAvailability,
	registerProject,
	removeProject,
	setLastInvoked,
} from "../../server/registry.js";

const REGISTRY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS projects (
    id TEXT NOT NULL UNIQUE,
    project_id TEXT,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    added_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    available INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_path ON projects(path);
CREATE INDEX IF NOT EXISTS idx_projects_project_id ON projects(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_last_accessed ON projects(last_accessed_at);

CREATE TABLE IF NOT EXISTS project_registry_meta (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT
);
`;

function createDb(): Database {
	const db = new Database(":memory:");
	db.exec(REGISTRY_SCHEMA_SQL);
	return db;
}

function insertProject(
	db: Database,
	fields: {
		id: string;
		projectId?: string;
		path: string;
		name: string;
		addedAt?: string;
		lastAccessedAt?: string;
		available?: number;
	},
): void {
	db.prepare(
		"INSERT INTO projects (id, project_id, path, name, added_at, last_accessed_at, available) VALUES (?, ?, ?, ?, ?, ?, ?)",
	).run(
		fields.id,
		fields.projectId ?? null,
		fields.path,
		fields.name,
		fields.addedAt ?? "2026-01-01T00:00:00.000Z",
		fields.lastAccessedAt ?? "2026-01-01T00:00:00.000Z",
		fields.available ?? 1,
	);
}

describe("registry (DB-backed)", () => {
	let tempRoot: string;
	let db: Database;

	beforeAll(async () => {
		tempRoot = join(tmpdir(), `registry-test-${Date.now()}`);
		await mkdir(tempRoot, { recursive: true });
		mockConfigDir = join(tempRoot, "config");
		await mkdir(mockConfigDir, { recursive: true });
	});

	beforeEach(() => {
		db = createDb();
		_resetHydrated();
	});

	afterEach(() => {
		resolveOverride = null;
		db.close();
	});

	afterAll(async () => {
		await rm(tempRoot, { recursive: true, force: true });
	});

	describe("schema", () => {
		test("projects table has correct columns", () => {
			const columns = db.prepare("PRAGMA table_info(projects)").all() as {
				name: string;
				type: string;
			}[];

			const colNames = columns.map((c) => c.name);
			expect(colNames).toContain("id");
			expect(colNames).toContain("project_id");
			expect(colNames).toContain("path");
			expect(colNames).toContain("name");
			expect(colNames).toContain("added_at");
			expect(colNames).toContain("last_accessed_at");
			expect(colNames).toContain("available");
			expect(columns).toHaveLength(7);
		});

		test("projects table has unique index on path", () => {
			const indexes = db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='projects'",
				)
				.all() as { name: string }[];

			const indexNames = indexes.map((i) => i.name);
			expect(indexNames).toContain("idx_projects_path");
			expect(indexNames).toContain("idx_projects_project_id");
			expect(indexNames).toContain("idx_projects_last_accessed");
		});

		test("project_registry_meta table has correct columns", () => {
			const columns = db
				.prepare("PRAGMA table_info(project_registry_meta)")
				.all() as { name: string; type: string }[];

			const colNames = columns.map((c) => c.name);
			expect(colNames).toContain("key");
			expect(colNames).toContain("value");
			expect(columns).toHaveLength(2);
		});
	});

	describe("registerProject", () => {
		test("inserts new entry with correct fields and sets lastInvoked", async () => {
			const projDir = join(tempRoot, "register-new");
			mkdirSync(join(projDir, ".rp1"), { recursive: true });

			const entry = await registerProject(db, projDir);

			expect(entry.path).toBe(projDir);
			expect(entry.name).toBe("register-new");
			expect(entry.available).toBe(true);
			expect(entry.addedAt).toBeTruthy();
			expect(entry.lastAccessedAt).toBeTruthy();
			expect(entry.id).toBeTruthy();

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBe(entry.id);
		});

		test("updates existing entry preserving addedAt", async () => {
			const projDir = join(tempRoot, "register-update");
			mkdirSync(join(projDir, ".rp1"), { recursive: true });

			const first = await registerProject(db, projDir);
			const firstAddedAt = first.addedAt;

			await new Promise((resolve) => setTimeout(resolve, 10));

			const second = await registerProject(db, projDir);

			expect(second.addedAt).toBe(firstAddedAt);
			expect(second.path).toBe(first.path);
			expect(second.id).toBe(first.id);
		});

		test("re-keys id when project acquires UUID", async () => {
			const projDir = join(tempRoot, "register-rekey");
			mkdirSync(join(projDir, ".rp1"), { recursive: true });

			const first = await registerProject(db, projDir);
			const slugId = first.id;
			expect(slugId).not.toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);

			const uuid = "a1b2c3d4-e5f6-7890-abcd-ef1234567890";
			writeFileSync(join(projDir, ".rp1", "project_id"), uuid);

			const second = await registerProject(db, projDir);
			expect(second.id).toBe(uuid);
			expect(second.projectId).toBe(uuid);

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBe(uuid);

			const allProjects = await getAllProjects(db);
			expect(allProjects).toHaveLength(1);
		});

		test("marks project unavailable when .rp1/ is missing", async () => {
			const projDir = join(tempRoot, "register-unavailable");
			mkdirSync(projDir, { recursive: true });

			const entry = await registerProject(db, projDir);
			expect(entry.available).toBe(false);
		});

		test("assigns unique ids when two paths share the same project_id", async () => {
			const uuid = "shared-uuid-1234-5678-abcd-ef1234567890";

			const projA = join(tempRoot, "dup-id-a");
			mkdirSync(join(projA, ".rp1"), { recursive: true });
			writeFileSync(join(projA, ".rp1", "project_id"), uuid);

			const projB = join(tempRoot, "dup-id-b");
			mkdirSync(join(projB, ".rp1"), { recursive: true });
			writeFileSync(join(projB, ".rp1", "project_id"), uuid);

			const entryA = await registerProject(db, projA);
			const entryB = await registerProject(db, projB);

			expect(entryA.id).not.toBe(entryB.id);
			expect(entryA.path).toBe(projA);
			expect(entryB.path).toBe(projB);

			const allProjects = await getAllProjects(db);
			expect(allProjects).toHaveLength(2);
		});
	});

	describe("removeProject", () => {
		test("deletes project row from DB", async () => {
			insertProject(db, {
				id: "proj-remove",
				path: "/test/remove",
				name: "remove",
			});

			const removed = await removeProject(db, "proj-remove");
			expect(removed).toBe(true);

			const entry = await getProject(db, "proj-remove");
			expect(entry).toBeNull();
		});

		test("returns false for non-existent project", async () => {
			const removed = await removeProject(db, "non-existent");
			expect(removed).toBe(false);
		});

		test("clears lastInvoked when removed project was last invoked", async () => {
			insertProject(db, {
				id: "proj-last",
				path: "/test/last",
				name: "last",
			});
			db.prepare(
				"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', 'proj-last')",
			).run();

			await removeProject(db, "proj-last");

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBeNull();
		});

		test("preserves lastInvoked when removed project was not last invoked", async () => {
			insertProject(db, {
				id: "proj-a",
				path: "/test/a",
				name: "a",
			});
			insertProject(db, {
				id: "proj-b",
				path: "/test/b",
				name: "b",
			});
			db.prepare(
				"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', 'proj-a')",
			).run();

			await removeProject(db, "proj-b");

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBe("proj-a");
		});
	});

	describe("getProject", () => {
		test("returns correct entry for existing project", async () => {
			insertProject(db, {
				id: "proj-get",
				projectId: "uuid-get",
				path: "/test/get",
				name: "get-project",
				addedAt: "2026-03-01T00:00:00.000Z",
				lastAccessedAt: "2026-03-15T00:00:00.000Z",
				available: 1,
			});

			const entry = await getProject(db, "proj-get");

			expect(entry).not.toBeNull();
			expect(entry!.id).toBe("proj-get");
			expect(entry!.projectId).toBe("uuid-get");
			expect(entry!.path).toBe("/test/get");
			expect(entry!.name).toBe("get-project");
			expect(entry!.addedAt).toBe("2026-03-01T00:00:00.000Z");
			expect(entry!.lastAccessedAt).toBe("2026-03-15T00:00:00.000Z");
			expect(entry!.available).toBe(true);
		});

		test("returns null for non-existent id", async () => {
			const entry = await getProject(db, "does-not-exist");
			expect(entry).toBeNull();
		});

		test("maps available=0 to false", async () => {
			insertProject(db, {
				id: "proj-unavail",
				path: "/test/unavail",
				name: "unavail",
				available: 0,
			});

			const entry = await getProject(db, "proj-unavail");
			expect(entry!.available).toBe(false);
		});

		test("maps null project_id to undefined", async () => {
			insertProject(db, {
				id: "proj-no-uuid",
				path: "/test/no-uuid",
				name: "no-uuid",
			});

			const entry = await getProject(db, "proj-no-uuid");
			expect(entry!.projectId).toBeUndefined();
		});
	});

	describe("getAllProjects", () => {
		test("returns empty array when no projects exist", async () => {
			const projects = await getAllProjects(db);
			expect(projects).toEqual([]);
		});

		test("returns all rows as ProjectEntry array", async () => {
			insertProject(db, {
				id: "proj-1",
				path: "/test/one",
				name: "one",
			});
			insertProject(db, {
				id: "proj-2",
				path: "/test/two",
				name: "two",
			});
			insertProject(db, {
				id: "proj-3",
				path: "/test/three",
				name: "three",
			});

			const projects = await getAllProjects(db);
			expect(projects).toHaveLength(3);

			const ids = projects.map((p) => p.id).sort();
			expect(ids).toEqual(["proj-1", "proj-2", "proj-3"]);
		});
	});

	describe("setLastInvoked + getLastInvokedProjectId", () => {
		test("round-trips correctly", async () => {
			insertProject(db, {
				id: "proj-invoke",
				path: "/test/invoke",
				name: "invoke",
			});

			await setLastInvoked(db, "proj-invoke");
			const lastInvoked = await getLastInvokedProjectId(db);

			expect(lastInvoked).toBe("proj-invoke");
		});

		test("returns null when no lastInvoked set", async () => {
			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBeNull();
		});

		test("setLastInvoked updates last_accessed_at on the project row", async () => {
			const oldTimestamp = "2020-01-01T00:00:00.000Z";
			insertProject(db, {
				id: "proj-ts",
				path: "/test/ts",
				name: "ts",
				lastAccessedAt: oldTimestamp,
			});

			await setLastInvoked(db, "proj-ts");

			const entry = await getProject(db, "proj-ts");
			expect(entry!.lastAccessedAt).not.toBe(oldTimestamp);
		});

		test("setLastInvoked throws for non-existent project", async () => {
			expect(setLastInvoked(db, "non-existent")).rejects.toThrow(
				"Project non-existent not found in registry",
			);
		});
	});

	describe("getProjectCount", () => {
		test("returns 0 for empty table", async () => {
			expect(await getProjectCount(db)).toBe(0);
		});

		test("returns correct count", async () => {
			insertProject(db, { id: "p1", path: "/a", name: "a" });
			insertProject(db, { id: "p2", path: "/b", name: "b" });

			expect(await getProjectCount(db)).toBe(2);
		});
	});

	describe("refreshProjectAvailability", () => {
		test("updates available flag for changed projects", async () => {
			const validDir = join(tempRoot, "refresh-valid");
			const invalidDir = join(tempRoot, "refresh-invalid");
			mkdirSync(join(validDir, ".rp1"), { recursive: true });
			mkdirSync(invalidDir, { recursive: true });

			insertProject(db, {
				id: "valid-proj",
				path: validDir,
				name: "valid",
				available: 0,
			});
			insertProject(db, {
				id: "invalid-proj",
				path: invalidDir,
				name: "invalid",
				available: 1,
			});

			await refreshProjectAvailability(db);

			const valid = await getProject(db, "valid-proj");
			const invalid = await getProject(db, "invalid-proj");

			expect(valid!.available).toBe(true);
			expect(invalid!.available).toBe(false);
		});
	});

	describe("pruneStaleProjects", () => {
		test("removes projects with invalid paths", async () => {
			const validDir = join(tempRoot, "prune-valid");
			mkdirSync(join(validDir, ".rp1"), { recursive: true });

			insertProject(db, {
				id: "keep-proj",
				path: validDir,
				name: "keep",
			});
			insertProject(db, {
				id: "stale-proj",
				path: "/nonexistent/path/does/not/exist",
				name: "stale",
			});

			const pruned = await pruneStaleProjects(db);

			expect(pruned).toBe(1);

			const remaining = await getAllProjects(db);
			expect(remaining).toHaveLength(1);
			expect(remaining[0].id).toBe("keep-proj");
		});

		test("clears lastInvoked when pruned project was last invoked", async () => {
			const validDir = join(tempRoot, "prune-lastinvoked");
			mkdirSync(join(validDir, ".rp1"), { recursive: true });

			insertProject(db, {
				id: "valid-proj-2",
				path: validDir,
				name: "valid",
			});
			insertProject(db, {
				id: "stale-proj-2",
				path: "/nonexistent/stale/project",
				name: "stale",
			});
			db.prepare(
				"INSERT OR REPLACE INTO project_registry_meta (key, value) VALUES ('last_invoked_project_id', 'stale-proj-2')",
			).run();

			await pruneStaleProjects(db);

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBeNull();
		});

		test("returns 0 when no projects are stale", async () => {
			const validDir = join(tempRoot, "prune-none-stale");
			mkdirSync(join(validDir, ".rp1"), { recursive: true });

			insertProject(db, {
				id: "all-good",
				path: validDir,
				name: "good",
			});

			const pruned = await pruneStaleProjects(db);
			expect(pruned).toBe(0);
		});
	});

	describe("ensureHydrated", () => {
		test("reads and inserts from valid projects.json", async () => {
			const registryData = {
				version: 1,
				lastInvoked: "hydrated-proj",
				projects: {
					"hydrated-proj": {
						id: "hydrated-proj",
						projectId: "uuid-hydrated",
						path: "/test/hydrated",
						name: "hydrated",
						addedAt: "2026-02-01T00:00:00.000Z",
						lastAccessedAt: "2026-02-15T00:00:00.000Z",
						available: true,
					},
					"hydrated-proj-2": {
						id: "hydrated-proj-2",
						path: "/test/hydrated-2",
						name: "hydrated-2",
						addedAt: "2026-02-01T00:00:00.000Z",
						lastAccessedAt: "2026-02-10T00:00:00.000Z",
						available: false,
					},
				},
			};

			const jsonPath = join(mockConfigDir, "projects.json");
			await writeFile(jsonPath, JSON.stringify(registryData));

			await ensureHydrated(db);

			const projects = db.prepare("SELECT * FROM projects").all() as {
				id: string;
				path: string;
				available: number;
			}[];
			expect(projects).toHaveLength(2);

			const proj1 = projects.find((p) => p.id === "hydrated-proj");
			expect(proj1).toBeTruthy();
			expect(proj1!.path).toBe("/test/hydrated");

			const proj2 = projects.find((p) => p.id === "hydrated-proj-2");
			expect(proj2).toBeTruthy();
			expect(proj2!.available).toBe(0);

			const meta = db
				.prepare(
					"SELECT value FROM project_registry_meta WHERE key = 'last_invoked_project_id'",
				)
				.get() as { value: string } | null;
			expect(meta?.value).toBe("hydrated-proj");
		});

		test("skips hydration when table already has rows", async () => {
			insertProject(db, {
				id: "existing",
				path: "/test/existing",
				name: "existing",
			});

			const jsonPath = join(mockConfigDir, "projects.json");
			await writeFile(
				jsonPath,
				JSON.stringify({
					projects: {
						"should-not-appear": {
							id: "should-not-appear",
							path: "/test/ghost",
							name: "ghost",
							addedAt: "2026-01-01T00:00:00.000Z",
							lastAccessedAt: "2026-01-01T00:00:00.000Z",
						},
					},
				}),
			);

			await ensureHydrated(db);

			const projects = db.prepare("SELECT * FROM projects").all() as {
				id: string;
			}[];
			expect(projects).toHaveLength(1);
			expect(projects[0].id).toBe("existing");

			try {
				const { unlink } = await import("node:fs/promises");
				await unlink(jsonPath);
			} catch {}
		});

		test("handles missing projects.json gracefully", async () => {
			const jsonPath = join(mockConfigDir, "projects.json");
			if (existsSync(jsonPath)) {
				const { unlink } = await import("node:fs/promises");
				await unlink(jsonPath);
			}

			await ensureHydrated(db);

			const projects = db.prepare("SELECT * FROM projects").all() as {
				id: string;
			}[];
			expect(projects).toHaveLength(0);
		});

		test("handles corrupt projects.json gracefully", async () => {
			const jsonPath = join(mockConfigDir, "projects.json");
			await writeFile(jsonPath, "not valid json {{{");

			await ensureHydrated(db);

			const projects = db.prepare("SELECT * FROM projects").all() as {
				id: string;
			}[];
			expect(projects).toHaveLength(0);
		});

		test("deletes projects.json after successful insertion", async () => {
			const jsonPath = join(mockConfigDir, "projects.json");
			await writeFile(
				jsonPath,
				JSON.stringify({
					projects: {
						"del-proj": {
							id: "del-proj",
							path: "/test/delete-after",
							name: "delete-after",
							addedAt: "2026-01-01T00:00:00.000Z",
							lastAccessedAt: "2026-01-01T00:00:00.000Z",
						},
					},
				}),
			);

			await ensureHydrated(db);

			expect(existsSync(jsonPath)).toBe(false);
		});

		test("concurrent callers await the same hydration run", async () => {
			const jsonPath = join(mockConfigDir, "projects.json");
			await writeFile(
				jsonPath,
				JSON.stringify({
					projects: {
						"concurrent-proj": {
							id: "concurrent-proj",
							path: "/test/concurrent",
							name: "concurrent",
							addedAt: "2026-01-01T00:00:00.000Z",
							lastAccessedAt: "2026-01-01T00:00:00.000Z",
						},
					},
				}),
			);

			await Promise.all([
				ensureHydrated(db),
				ensureHydrated(db),
				ensureHydrated(db),
			]);

			const projects = db.prepare("SELECT * FROM projects").all() as {
				id: string;
			}[];
			expect(projects).toHaveLength(1);
			expect(projects[0].id).toBe("concurrent-proj");
		});
	});

	describe("worktree path resolution", () => {
		test("stores main work tree root when called with linked worktree path", async () => {
			const mainRepoDir = join(tempRoot, "wt-main-1");
			const worktreeDir = join(tempRoot, "wt-linked-1");
			mkdirSync(join(mainRepoDir, ".rp1"), { recursive: true });
			mkdirSync(worktreeDir, { recursive: true });

			resolveOverride = (startPath: string) => {
				if (startPath === worktreeDir) {
					return {
						_tag: "Right",
						right: {
							projectRoot: mainRepoDir,
							projectId: undefined,
							kbRoot: `${mainRepoDir}/.rp1/context`,
							workRoot: `${mainRepoDir}/.rp1/work`,
							isWorktree: true,
							worktreeName: "feature-branch",
						},
					};
				}
				return {
					_tag: "Right",
					right: {
						projectRoot: startPath,
						projectId: undefined,
						kbRoot: `${startPath}/.rp1/context`,
						workRoot: `${startPath}/.rp1/work`,
						isWorktree: false,
					},
				};
			};

			const entry = await registerProject(db, worktreeDir);

			expect(entry.path).toBe(mainRepoDir);
			expect(entry.name).toBe("wt-main-1");

			const row = db
				.prepare("SELECT path FROM projects WHERE id = ?")
				.get(entry.id) as { path: string };
			expect(row.path).toBe(mainRepoDir);
		});

		test("resolves subdirectory within worktree to main work tree root", async () => {
			const mainRepoDir = join(tempRoot, "wt-main-2");
			const subDir = join(tempRoot, "wt-linked-2", "src", "components");
			mkdirSync(join(mainRepoDir, ".rp1"), { recursive: true });
			mkdirSync(subDir, { recursive: true });

			resolveOverride = (startPath: string) => {
				if (startPath === subDir) {
					return {
						_tag: "Right",
						right: {
							projectRoot: mainRepoDir,
							projectId: undefined,
							kbRoot: `${mainRepoDir}/.rp1/context`,
							workRoot: `${mainRepoDir}/.rp1/work`,
							isWorktree: true,
							worktreeName: "feature-branch",
						},
					};
				}
				return {
					_tag: "Right",
					right: {
						projectRoot: startPath,
						projectId: undefined,
						kbRoot: `${startPath}/.rp1/context`,
						workRoot: `${startPath}/.rp1/work`,
						isWorktree: false,
					},
				};
			};

			const entry = await registerProject(db, subDir);

			expect(entry.path).toBe(mainRepoDir);
			expect(entry.name).toBe("wt-main-2");

			const allProjects = await getAllProjects(db);
			expect(allProjects).toHaveLength(1);
			expect(allProjects[0].path).toBe(mainRepoDir);
		});

		test("deduplicates registration from worktree and main repo", async () => {
			const mainRepoDir = join(tempRoot, "wt-main-3");
			const worktreeDir = join(tempRoot, "wt-linked-3");
			mkdirSync(join(mainRepoDir, ".rp1"), { recursive: true });
			mkdirSync(worktreeDir, { recursive: true });

			resolveOverride = (startPath: string) => {
				if (startPath === worktreeDir) {
					return {
						_tag: "Right",
						right: {
							projectRoot: mainRepoDir,
							projectId: undefined,
							kbRoot: `${mainRepoDir}/.rp1/context`,
							workRoot: `${mainRepoDir}/.rp1/work`,
							isWorktree: true,
							worktreeName: "feature-branch",
						},
					};
				}
				return {
					_tag: "Right",
					right: {
						projectRoot: startPath,
						projectId: undefined,
						kbRoot: `${startPath}/.rp1/context`,
						workRoot: `${startPath}/.rp1/work`,
						isWorktree: false,
					},
				};
			};

			const firstEntry = await registerProject(db, mainRepoDir);
			const secondEntry = await registerProject(db, worktreeDir);

			expect(firstEntry.path).toBe(mainRepoDir);
			expect(secondEntry.path).toBe(mainRepoDir);
			expect(secondEntry.id).toBe(firstEntry.id);

			const allProjects = await getAllProjects(db);
			expect(allProjects).toHaveLength(1);
		});
	});

	describe("fresh startup with empty state", () => {
		test("all operations work with empty registry", async () => {
			const projects = await getAllProjects(db);
			expect(projects).toEqual([]);

			const lastInvoked = await getLastInvokedProjectId(db);
			expect(lastInvoked).toBeNull();

			expect(await getProjectCount(db)).toBe(0);

			const removed = await removeProject(db, "nonexistent");
			expect(removed).toBe(false);

			const found = await getProject(db, "nonexistent");
			expect(found).toBeNull();
		});
	});
});
