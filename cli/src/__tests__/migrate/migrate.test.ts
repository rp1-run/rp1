import { Database } from "bun:sqlite";
import {
	afterEach,
	beforeEach,
	describe,
	expect,
	setDefaultTimeout,
	test,
} from "bun:test";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { normalizeProjectKey } from "../../../shared/directory-resolution.js";
import {
	closeDatabase,
	deriveRunStatus,
	findOrCreateWorkflowRun,
	getEmitDatabase,
	insertEvent,
	insertRun,
	resetInstance,
} from "../../agent-tools/emit/database.js";
import { updateGitignore } from "../../migrate/gitignore-update.js";
import { executeMigrate, formatMigrateSummary } from "../../migrate/index.js";
import {
	findLegacyWorkDir,
	moveLegacyWork,
} from "../../migrate/legacy-work.js";
import {
	createInitialCommit,
	createTestWorktree,
	expectTaskRight,
	initTestRepo,
} from "../helpers/index.js";

setDefaultTimeout(15000);

const createBackfillRun = async (
	dbPath: string,
	runId: string,
	projectRoot: string,
): Promise<void> => {
	const db = await expectTaskRight(getEmitDatabase(dbPath));
	insertRun(db, {
		id: runId,
		flow: "build",
		featureId: "migration-path-isolation",
		projectPath: projectRoot,
	});
	closeDatabase();
	resetInstance();
};

const readRunProjectId = (dbPath: string, runId: string): string | null => {
	const db = new Database(dbPath, { readonly: true, create: false });
	try {
		const row = db
			.prepare("SELECT project_id FROM runs WHERE id = ?")
			.get(runId) as { project_id: string | null };
		return row.project_id;
	} finally {
		db.close();
	}
};

describe("migrate", () => {
	let tempDir: string;
	let originalRp1Db: string | undefined;

	beforeEach(async () => {
		tempDir = join(tmpdir(), `rp1-migrate-test-${Date.now()}`);
		await mkdir(tempDir, { recursive: true });
		originalRp1Db = process.env.RP1_DB;
		process.env.RP1_DB = join(tempDir, "test-rp1.db");
	});

	afterEach(async () => {
		closeDatabase();
		resetInstance();
		if (originalRp1Db === undefined) {
			delete process.env.RP1_DB;
		} else {
			process.env.RP1_DB = originalRp1Db;
		}
		await rm(tempDir, { recursive: true, force: true });
	});

	describe("executeMigrate", () => {
		test("ignores default legacy global state when isolated migration paths are supplied", async () => {
			const projectRoot = join(tempDir, "isolated-project");
			const isolatedHome = join(tempDir, "isolated-home");
			const globalSettingsPath = join(
				isolatedHome,
				".config",
				"rp1",
				"settings.toml",
			);
			const isolatedGlobalDir = dirname(globalSettingsPath);
			const defaultGlobalDir = join(homedir(), ".config", "rp1");
			const projectKey = normalizeProjectKey(projectRoot);
			const isolatedLegacyDir = join(isolatedHome, ".rp1", "work", projectKey);
			const defaultLegacyDir = join(homedir(), ".rp1", "work", projectKey);
			const isolatedDbPath = join(isolatedHome, ".rp1", "rp1.db");
			const defaultDbPath = process.env.RP1_DB!;

			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await writeFile(join(projectRoot, ".rp1", "context", "index.md"), "# KB");
			await mkdir(join(isolatedLegacyDir, "features"), { recursive: true });
			await writeFile(
				join(isolatedLegacyDir, "features", "isolated.md"),
				"isolated",
			);
			await mkdir(join(defaultLegacyDir, "features"), { recursive: true });
			await writeFile(
				join(defaultLegacyDir, "features", "default.md"),
				"default",
			);
			await mkdir(isolatedGlobalDir, { recursive: true });
			await writeFile(
				globalSettingsPath,
				'[harnesses]\nenabled = ["claude-code"]\n',
			);
			await writeFile(
				join(isolatedGlobalDir, "settings.json"),
				JSON.stringify({ theme: "light" }),
			);
			await mkdir(defaultGlobalDir, { recursive: true });
			await writeFile(
				join(defaultGlobalDir, "settings.json"),
				JSON.stringify({ theme: "dark" }),
			);

			await createBackfillRun(
				isolatedDbPath,
				"isolated-migration-run",
				projectRoot,
			);
			await createBackfillRun(
				defaultDbPath,
				"default-migration-run",
				projectRoot,
			);

			try {
				const result = await executeMigrate(projectRoot, {
					toCentral: true,
					homeDir: isolatedHome,
					globalSettingsPath,
				});
				const centralWorkDir = join(
					isolatedHome,
					".rp1",
					"projects",
					result.projectId,
					"work",
				);

				expect(
					existsSync(join(centralWorkDir, "features", "isolated.md")),
				).toBe(true);
				expect(existsSync(join(centralWorkDir, "features", "default.md"))).toBe(
					false,
				);
				expect(
					existsSync(join(defaultLegacyDir, "features", "default.md")),
				).toBe(true);
				expect(
					existsSync(join(isolatedGlobalDir, "settings.json.migrated")),
				).toBe(true);
				expect(readFileSync(globalSettingsPath, "utf-8")).toContain(
					'theme = "light"',
				);
				expect(existsSync(join(defaultGlobalDir, "settings.json"))).toBe(true);
				expect(
					existsSync(join(defaultGlobalDir, "settings.json.migrated")),
				).toBe(false);
				expect(readRunProjectId(isolatedDbPath, "isolated-migration-run")).toBe(
					result.projectId,
				);
				expect(
					readRunProjectId(defaultDbPath, "default-migration-run"),
				).toBeNull();
				expect(existsSync(join(isolatedHome, ".claude", "CLAUDE.md"))).toBe(
					true,
				);
				expect(existsSync(join(homedir(), ".claude", "CLAUDE.md"))).toBe(false);

				const second = await executeMigrate(projectRoot, {
					toCentral: true,
					homeDir: isolatedHome,
					globalSettingsPath,
				});
				expect(second.legacyWork?.filesMoved ?? 0).toBe(0);
				expect(second.arcadeSettings.globalMigrated).toBe(false);
				expect(second.centralStore?.relocated.contextFiles).toBe(0);
				expect(second.centralStore?.relocated.workFiles).toBe(0);
			} finally {
				await rm(defaultLegacyDir, { recursive: true, force: true });
				await rm(defaultGlobalDir, { recursive: true, force: true });
			}
		});

		test("keeps isolated migration paths authoritative during dry-run", async () => {
			const projectRoot = join(tempDir, "isolated-dry-run-project");
			const isolatedHome = join(tempDir, "isolated-dry-run-home");
			const globalSettingsPath = join(
				isolatedHome,
				".config",
				"rp1",
				"settings.toml",
			);
			const isolatedGlobalDir = dirname(globalSettingsPath);
			const defaultGlobalDir = join(homedir(), ".config", "rp1");
			const projectKey = normalizeProjectKey(projectRoot);
			const isolatedLegacyDir = join(isolatedHome, ".rp1", "work", projectKey);
			const defaultLegacyDir = join(homedir(), ".rp1", "work", projectKey);
			const isolatedDbPath = join(isolatedHome, ".rp1", "rp1.db");

			await mkdir(join(projectRoot, ".rp1", "context"), { recursive: true });
			await mkdir(join(isolatedLegacyDir, "features"), { recursive: true });
			await writeFile(
				join(isolatedLegacyDir, "features", "isolated.md"),
				"isolated",
			);
			await mkdir(join(defaultLegacyDir, "features"), { recursive: true });
			await writeFile(
				join(defaultLegacyDir, "features", "default.md"),
				"default",
			);
			await mkdir(isolatedGlobalDir, { recursive: true });
			await writeFile(
				globalSettingsPath,
				'[harnesses]\nenabled = ["claude-code"]\n',
			);
			await writeFile(
				join(isolatedGlobalDir, "settings.json"),
				JSON.stringify({ theme: "light" }),
			);
			await mkdir(defaultGlobalDir, { recursive: true });
			await writeFile(
				join(defaultGlobalDir, "settings.json"),
				JSON.stringify({ theme: "dark" }),
			);
			await createBackfillRun(isolatedDbPath, "isolated-dry-run", projectRoot);

			try {
				const result = await executeMigrate(projectRoot, {
					dryRun: true,
					toCentral: true,
					homeDir: isolatedHome,
					globalSettingsPath,
				});

				expect(result.legacyWork?.legacyPath).toBe(isolatedLegacyDir);
				expect(result.arcadeSettings.globalJsonPath).toBe(
					join(isolatedGlobalDir, "settings.json"),
				);
				expect(result.dbBackfill.activitySearchRowsCreated).toBe(1);
				expect(result.centralStore?.globalStanza.paths.get("claude-code")).toBe(
					join(isolatedHome, ".claude", "CLAUDE.md"),
				);
				expect(
					existsSync(join(isolatedLegacyDir, "features", "isolated.md")),
				).toBe(true);
				expect(existsSync(join(isolatedGlobalDir, "settings.json"))).toBe(true);
				expect(
					existsSync(join(isolatedGlobalDir, "settings.json.migrated")),
				).toBe(false);
				expect(readRunProjectId(isolatedDbPath, "isolated-dry-run")).toBeNull();
				expect(existsSync(join(isolatedHome, ".rp1", "projects"))).toBe(false);
			} finally {
				await rm(defaultLegacyDir, { recursive: true, force: true });
				await rm(defaultGlobalDir, { recursive: true, force: true });
			}
		});

		test("preserves default migration paths when isolation inputs are omitted", async () => {
			const projectRoot = join(tempDir, "default-path-project");
			const defaultGlobalDir = join(homedir(), ".config", "rp1");
			const defaultLegacyDir = join(
				homedir(),
				".rp1",
				"work",
				normalizeProjectKey(projectRoot),
			);
			const defaultDbPath = process.env.RP1_DB!;

			await mkdir(join(projectRoot, ".rp1"), { recursive: true });
			await mkdir(join(defaultLegacyDir, "features"), { recursive: true });
			await writeFile(
				join(defaultLegacyDir, "features", "default.md"),
				"default",
			);
			await mkdir(defaultGlobalDir, { recursive: true });
			await writeFile(
				join(defaultGlobalDir, "settings.json"),
				JSON.stringify({ theme: "dark" }),
			);
			await createBackfillRun(defaultDbPath, "default-path-run", projectRoot);

			try {
				const result = await executeMigrate(projectRoot);

				expect(
					existsSync(
						join(projectRoot, ".rp1", "work", "features", "default.md"),
					),
				).toBe(true);
				expect(
					existsSync(join(defaultGlobalDir, "settings.json.migrated")),
				).toBe(true);
				expect(readRunProjectId(defaultDbPath, "default-path-run")).toBe(
					result.projectId,
				);
			} finally {
				await rm(defaultLegacyDir, { recursive: true, force: true });
				await rm(defaultGlobalDir, { recursive: true, force: true });
			}
		});

		test("creates .rp1/project_id when missing", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.projectIdCreated).toBe(true);
			expect(result.projectId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
			);
			expect(existsSync(join(tempDir, ".rp1", "project_id"))).toBe(true);
		});

		test("creates .rp1/work/ when missing", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.workDirCreated).toBe(true);
			expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(true);
		});

		test("is idempotent -- second run produces no changes", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const first = await executeMigrate(tempDir);
			const second = await executeMigrate(tempDir);

			expect(second.projectIdCreated).toBe(false);
			expect(second.projectId).toBe(first.projectId);
			expect(second.workDirCreated).toBe(false);
		});

		test("throws when no .rp1/ directory exists", async () => {
			const noRp1Dir = join(tmpdir(), `rp1-no-rp1-${Date.now()}`);
			await mkdir(noRp1Dir, { recursive: true });

			try {
				await expect(executeMigrate(noRp1Dir)).rejects.toThrow(
					"No .rp1/ directory found",
				);
			} finally {
				await rm(noRp1Dir, { recursive: true, force: true });
			}
		});

		test("updates .gitignore with required rules", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const result = await executeMigrate(tempDir);

			expect(result.gitignore.updated).toBe(true);
			const gitignore = readFileSync(join(tempDir, ".gitignore"), "utf-8");
			expect(gitignore).toContain("!.rp1/");
			expect(gitignore).toContain(".rp1/*");
			expect(gitignore).toContain("!.rp1/project_id");
		});

		test("uses the canonical git common-dir project root when run from a worktree", async () => {
			const repoDir = join(tempDir, "repo");
			const worktreeDir = join(tempDir, "repo-worktree");
			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			await createInitialCommit(repoDir);
			await mkdir(join(repoDir, ".rp1"), { recursive: true });
			await createTestWorktree(repoDir, worktreeDir, "feature/worktree");

			const result = await executeMigrate(worktreeDir);

			expect(result.projectRoot).toBe(realpathSync(repoDir));
			expect(existsSync(join(repoDir, ".rp1", "project_id"))).toBe(true);
			expect(existsSync(join(repoDir, ".rp1", "work"))).toBe(true);
			expect(existsSync(join(worktreeDir, ".rp1"))).toBe(false);
		});

		test("handles older DB schema without notifications table or renamed columns", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			// Create a DB with an older schema (pre-v8: rp1_kb_dir / rp1_work_dir
			// instead of rp1_kb_root / rp1_work_root, and no notifications table)
			const { Database } = require("bun:sqlite");
			const oldDb = new Database(process.env.RP1_DB!, { create: true });
			oldDb.exec("PRAGMA journal_mode = WAL");
			oldDb.exec(`
				CREATE TABLE schema_version (version INTEGER NOT NULL);
				INSERT INTO schema_version VALUES (7);

				CREATE TABLE runs (
					id TEXT PRIMARY KEY,
					flow TEXT NOT NULL DEFAULT '',
					feature_id TEXT,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT,
					rp1_kb_dir TEXT,
					rp1_work_dir TEXT,
					status TEXT NOT NULL DEFAULT 'running',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					name TEXT
				);

				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL,
					type TEXT NOT NULL,
					step TEXT,
					unit TEXT,
					data TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
				);

				CREATE TABLE artifacts (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					doc_id TEXT NOT NULL UNIQUE,
					run_id TEXT,
					path TEXT NOT NULL,
					type TEXT NOT NULL DEFAULT 'markdown',
					project_path TEXT NOT NULL DEFAULT '',
					feature TEXT,
					step TEXT,
					storage_root TEXT NOT NULL DEFAULT 'work_dir',
					created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
					FOREIGN KEY (run_id) REFERENCES runs(id) ON DELETE CASCADE
				);

				CREATE TABLE tasks (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					type TEXT NOT NULL DEFAULT '',
					description TEXT NOT NULL DEFAULT '',
					project_path TEXT
				);
			`);

			oldDb
				.prepare(
					`INSERT INTO runs (id, flow, project_path, rp1_project_root, rp1_kb_dir, rp1_work_dir)
				 VALUES ($id, $flow, $projectPath, $rp1ProjectRoot, $rp1KbDir, $rp1WorkDir)`,
				)
				.run({
					$id: "old-schema-run",
					$flow: "build",
					$projectPath: tempDir,
					$rp1ProjectRoot: tempDir,
					$rp1KbDir: join(tempDir, ".rp1", "context"),
					$rp1WorkDir: join(tempDir, ".rp1", "work"),
				});

			oldDb.close();

			// executeMigrate should not crash on this older schema
			const result = await executeMigrate(tempDir);

			expect(result.projectIdCreated).toBe(true);
			expect(result.dbBackfill.runsUpdated).toBeGreaterThanOrEqual(0);
		});

		test("rebuilds missing and stale Activity search rows", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));

			insertRun(db, {
				id: "search-backfill-run",
				flow: "build",
				featureId: "search-backfill",
				projectPath: tempDir,
				name: "Search Backfill Run",
				harness: "codex",
			});
			insertEvent(db, {
				runId: "search-backfill-run",
				type: "status_change",
				step: "building",
				data: JSON.stringify({ status: "completed" }),
				createdAt: "2026-04-10T01:00:00.000Z",
			});
			deriveRunStatus(db, "search-backfill-run");

			const first = await executeMigrate(tempDir);

			expect(first.dbBackfill.activitySearchRowsCreated).toBe(1);
			expect(first.dbBackfill.activitySearchRowsRefreshed).toBe(0);

			const createdRow = db
				.prepare(
					"SELECT project_id, project_root, search_text FROM activity_search_runs WHERE run_id = $runId",
				)
				.get({ $runId: "search-backfill-run" }) as {
				project_id: string;
				project_root: string;
				search_text: string;
			};
			expect(createdRow.project_id).toBe(first.projectId);
			expect(createdRow.project_root).toBe(first.projectRoot);
			expect(createdRow.search_text).toContain("search backfill run");

			db.prepare(
				"UPDATE runs SET feature_id = $featureId, name = $name, updated_at = $updatedAt WHERE id = $id",
			).run({
				$featureId: "refreshed-search-backfill",
				$name: "Refreshed Search Backfill",
				$updatedAt: "2026-04-10T02:00:00.000Z",
				$id: "search-backfill-run",
			});

			const second = await executeMigrate(tempDir);

			expect(second.dbBackfill.activitySearchRowsCreated).toBe(0);
			expect(second.dbBackfill.activitySearchRowsRefreshed).toBe(1);

			const refreshedRow = db
				.prepare(
					"SELECT search_text FROM activity_search_runs WHERE run_id = $runId",
				)
				.get({ $runId: "search-backfill-run" }) as {
				search_text: string;
			};
			expect(refreshedRow.search_text).toContain("refreshed search backfill");
		});

		test("dry-run reports planned Activity search rows without creating search state", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			const { Database } = require("bun:sqlite");
			const oldDb = new Database(process.env.RP1_DB!, { create: true });
			oldDb.exec(`
				CREATE TABLE runs (
					id TEXT PRIMARY KEY,
					flow TEXT NOT NULL DEFAULT '',
					feature_id TEXT,
					project_path TEXT NOT NULL,
					rp1_project_root TEXT,
					status TEXT NOT NULL DEFAULT 'running',
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL,
					name TEXT,
					harness TEXT
				);

				CREATE TABLE events (
					id INTEGER PRIMARY KEY AUTOINCREMENT,
					run_id TEXT NOT NULL,
					type TEXT NOT NULL,
					step TEXT,
					data TEXT NOT NULL DEFAULT '{}',
					created_at TEXT NOT NULL
				);
			`);
			oldDb
				.prepare(
					`INSERT INTO runs (
						id, flow, feature_id, project_path, rp1_project_root,
						status, created_at, updated_at, name, harness
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
				)
				.run(
					"dry-run-search",
					"build",
					"dry-run-search",
					tempDir,
					tempDir,
					"completed",
					"2026-04-10T01:00:00.000Z",
					"2026-04-10T01:00:00.000Z",
					"Dry Run Search",
					"codex",
				);
			oldDb
				.prepare(
					"INSERT INTO events (run_id, type, step, data, created_at) VALUES (?, ?, ?, ?, ?)",
				)
				.run(
					"dry-run-search",
					"status_change",
					"building",
					JSON.stringify({ status: "completed" }),
					"2026-04-10T01:00:00.000Z",
				);
			oldDb.close();

			const result = await executeMigrate(tempDir, { dryRun: true });

			expect(result.dryRun).toBe(true);
			expect(result.dbBackfill.activitySearchRowsCreated).toBe(1);
			expect(result.dbBackfill.activitySearchRowsRefreshed).toBe(0);
			expect(existsSync(join(tempDir, ".rp1", "project_id"))).toBe(false);
			expect(existsSync(join(tempDir, ".rp1", "work"))).toBe(false);

			const inspectDb = new Database(process.env.RP1_DB!, {
				readonly: true,
				create: false,
			});
			const tableRow = inspectDb
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'activity_search_runs'",
				)
				.get() as { name: string } | null;
			const runCount = inspectDb
				.prepare("SELECT COUNT(*) AS count FROM runs")
				.get() as { count: number };
			inspectDb.close();

			expect(tableRow).toBeNull();
			expect(runCount.count).toBe(1);
		});

		test("repairs contaminated Arcade metadata and moves misplaced work artifacts", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });
			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));
			const wrongRoot = join(tempDir, "wrong-home-root");
			const wrongArtifactPath = join(
				wrongRoot,
				".rp1",
				"work",
				"quick-builds",
				"repair.md",
			);

			await mkdir(join(wrongRoot, ".rp1", "work", "quick-builds"), {
				recursive: true,
			});
			await writeFile(wrongArtifactPath, "# Repair me\n");

			db.prepare(
				`INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, project_id
				) VALUES (
					$id, $flow, $featureId, $projectPath, $rp1ProjectRoot, $rp1KbRoot, $rp1WorkRoot, $projectId
				)`,
			).run({
				$id: "repair-run",
				$flow: "build",
				$featureId: "repair-feature",
				$projectPath: tempDir,
				$rp1ProjectRoot: wrongRoot,
				$rp1KbRoot: join(wrongRoot, ".rp1", "context"),
				$rp1WorkRoot: join(wrongRoot, ".rp1", "work"),
				$projectId: "wrong-project-id",
			});

			db.prepare(
				`INSERT INTO artifacts (
					doc_id, run_id, path, type, storage_root, project_path, project_id, feature, step
				) VALUES (
					$docId, $runId, $path, $type, $storageRoot, $projectPath, $projectId, $feature, $step
				)`,
			).run({
				$docId: "repair-doc",
				$runId: "repair-run",
				$path: "quick-builds/repair.md",
				$type: "markdown",
				$storageRoot: "work_dir",
				$projectPath: tempDir,
				$projectId: "wrong-project-id",
				$feature: "repair-feature",
				$step: "build",
			});

			db.prepare(
				"INSERT INTO tasks (type, description, project_path, project_id) VALUES ($type, $description, $projectPath, $projectId)",
			).run({
				$type: "repair",
				$description: "repair metadata",
				$projectPath: tempDir,
				$projectId: "wrong-project-id",
			});

			db.prepare(
				"INSERT INTO notifications (message, source_type, source_id, route, project_id) VALUES ($message, $sourceType, $sourceId, $route, $projectId)",
			).run({
				$message: "build completed",
				$sourceType: "run",
				$sourceId: "repair-run",
				$route: "/runs/repair-run",
				$projectId: "wrong-project-id",
			});

			const result = await executeMigrate(tempDir);

			expect(result.dbBackfill.runsUpdated).toBe(1);
			expect(result.dbBackfill.artifactsUpdated).toBe(1);
			expect(result.dbBackfill.tasksUpdated).toBe(1);
			expect(result.dbBackfill.notificationsUpdated).toBe(1);
			expect(result.dbBackfill.artifactFilesMoved).toBe(1);

			const runRow = db
				.prepare(
					"SELECT project_path, rp1_project_root, rp1_kb_root, rp1_work_root, project_id FROM runs WHERE id = $id",
				)
				.get({ $id: "repair-run" }) as {
				project_path: string;
				rp1_project_root: string;
				rp1_kb_root: string;
				rp1_work_root: string;
				project_id: string;
			};
			expect(runRow.project_path).toBe(tempDir);
			expect(runRow.rp1_project_root).toBe(tempDir);
			expect(runRow.rp1_kb_root).toBe(join(tempDir, ".rp1", "context"));
			expect(runRow.rp1_work_root).toBe(join(tempDir, ".rp1", "work"));
			expect(runRow.project_id).toBe(result.projectId);

			const artifactRow = db
				.prepare(
					"SELECT project_path, project_id FROM artifacts WHERE doc_id = $docId",
				)
				.get({ $docId: "repair-doc" }) as {
				project_path: string;
				project_id: string;
			};
			expect(artifactRow.project_path).toBe(tempDir);
			expect(artifactRow.project_id).toBe(result.projectId);

			const taskRow = db
				.prepare("SELECT project_path, project_id FROM tasks LIMIT 1")
				.get() as {
				project_path: string;
				project_id: string;
			};
			expect(taskRow.project_path).toBe(tempDir);
			expect(taskRow.project_id).toBe(result.projectId);

			const notificationRow = db
				.prepare(
					"SELECT project_id FROM notifications WHERE source_id = $sourceId",
				)
				.get({ $sourceId: "repair-run" }) as {
				project_id: string;
			};
			expect(notificationRow.project_id).toBe(result.projectId);

			expect(
				existsSync(join(tempDir, ".rp1", "work", "quick-builds", "repair.md")),
			).toBe(true);
			expect(existsSync(wrongArtifactPath)).toBe(false);
		});

		test("repairs worktree-scoped contaminated records back to the canonical repo root", async () => {
			const repoDir = join(tempDir, "repair-repo");
			const worktreeDir = join(tempDir, "repair-worktree");
			const wrongRoot = join(tempDir, "wrong-worktree-root");
			const wrongArtifactPath = join(
				wrongRoot,
				".rp1",
				"work",
				"features",
				"wt",
				"tasks.md",
			);

			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			await createInitialCommit(repoDir);
			await mkdir(join(repoDir, ".rp1"), { recursive: true });
			await createTestWorktree(repoDir, worktreeDir, "feature/worktree-repair");
			await mkdir(dirname(wrongArtifactPath), { recursive: true });
			await writeFile(wrongArtifactPath, "# Worktree repair\n");

			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));
			db.prepare(
				`INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, project_id
				) VALUES (
					$id, $flow, $featureId, $projectPath, $rp1ProjectRoot, $rp1KbRoot, $rp1WorkRoot, $projectId
				)`,
			).run({
				$id: "worktree-run",
				$flow: "build",
				$featureId: "wt-feature",
				$projectPath: worktreeDir,
				$rp1ProjectRoot: wrongRoot,
				$rp1KbRoot: join(wrongRoot, ".rp1", "context"),
				$rp1WorkRoot: join(wrongRoot, ".rp1", "work"),
				$projectId: "wrong-project-id",
			});

			db.prepare(
				`INSERT INTO artifacts (
					doc_id, run_id, path, type, storage_root, project_path, project_id, feature, step
				) VALUES (
					$docId, $runId, $path, $type, $storageRoot, $projectPath, $projectId, $feature, $step
				)`,
			).run({
				$docId: "worktree-doc",
				$runId: "worktree-run",
				$path: "features/wt/tasks.md",
				$type: "markdown",
				$storageRoot: "work_dir",
				$projectPath: worktreeDir,
				$projectId: "wrong-project-id",
				$feature: "wt-feature",
				$step: "build",
			});

			const result = await executeMigrate(worktreeDir);
			const canonicalRepoRoot = realpathSync(repoDir);

			expect(result.projectRoot).toBe(canonicalRepoRoot);
			expect(result.dbBackfill.runsUpdated).toBe(1);
			expect(result.dbBackfill.artifactsUpdated).toBe(1);
			expect(result.dbBackfill.artifactFilesMoved).toBe(1);

			const runRow = db
				.prepare(
					"SELECT project_path, rp1_project_root, project_id FROM runs WHERE id = $id",
				)
				.get({ $id: "worktree-run" }) as {
				project_path: string;
				rp1_project_root: string;
				project_id: string;
			};
			expect(runRow.project_path).toBe(canonicalRepoRoot);
			expect(runRow.rp1_project_root).toBe(canonicalRepoRoot);
			expect(runRow.project_id).toBe(result.projectId);

			const artifactRow = db
				.prepare(
					"SELECT project_path, project_id FROM artifacts WHERE doc_id = $docId",
				)
				.get({ $docId: "worktree-doc" }) as {
				project_path: string;
				project_id: string;
			};
			expect(artifactRow.project_path).toBe(canonicalRepoRoot);
			expect(artifactRow.project_id).toBe(result.projectId);
			expect(
				existsSync(
					join(canonicalRepoRoot, ".rp1", "work", "features", "wt", "tasks.md"),
				),
			).toBe(true);
			expect(existsSync(wrongArtifactPath)).toBe(false);
		});

		test("repairs fully contaminated rows where rp1_project_root matches a candidate path", async () => {
			const repoDir = join(tempDir, "full-contam-repo");
			const worktreeDir = join(tempDir, "full-contam-worktree");

			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			await createInitialCommit(repoDir);
			await mkdir(join(repoDir, ".rp1"), { recursive: true });
			await createTestWorktree(repoDir, worktreeDir, "feature/full-contam");

			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));

			// Insert a fully contaminated row: project_path and rp1_project_root
			// both point to the worktree, and project_id is wrong. The only way
			// to find this row is by matching rp1_project_root against worktree
			// candidate paths.
			db.prepare(
				`INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root,
					rp1_kb_root, rp1_work_root, project_id
				) VALUES (
					$id, $flow, $featureId, $projectPath, $rp1ProjectRoot,
					$rp1KbRoot, $rp1WorkRoot, $projectId
				)`,
			).run({
				$id: "full-contam-run",
				$flow: "build",
				$featureId: "contam-feature",
				$projectPath: worktreeDir,
				$rp1ProjectRoot: worktreeDir,
				$rp1KbRoot: join(worktreeDir, ".rp1", "context"),
				$rp1WorkRoot: join(worktreeDir, ".rp1", "work"),
				$projectId: "wrong-id",
			});

			const result = await executeMigrate(repoDir);

			expect(result.dbBackfill.runsUpdated).toBe(1);

			const runRow = db
				.prepare(
					"SELECT project_path, rp1_project_root, project_id FROM runs WHERE id = $id",
				)
				.get({ $id: "full-contam-run" }) as {
				project_path: string;
				rp1_project_root: string;
				project_id: string;
			};
			expect(runRow.project_path).toBe(result.projectRoot);
			expect(runRow.rp1_project_root).toBe(result.projectRoot);
			expect(runRow.project_id).toBe(result.projectId);
		});

		test("backfills deterministic bootstrap fields for previous tracked workflow runs when migration can derive them safely", async () => {
			const repoDir = join(tempDir, "legacy-build-repo");
			const worktreeDir = join(tempDir, "legacy-build-worktree");

			await mkdir(repoDir, { recursive: true });
			await initTestRepo(repoDir);
			await createInitialCommit(repoDir);
			await mkdir(join(repoDir, ".rp1"), { recursive: true });
			await createTestWorktree(repoDir, worktreeDir, "feature/legacy-build");

			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));
			db.prepare(
				`INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root,
					rp1_kb_root, rp1_work_root, project_id,
					run_policy, work_identity, bootstrap_context
				) VALUES (
					$id, $flow, $featureId, $projectPath, $rp1ProjectRoot,
					$rp1KbRoot, $rp1WorkRoot, $projectId,
					$runPolicy, $workIdentity, $bootstrapContext
				)`,
			).run({
				$id: "legacy-build-run",
				$flow: "build",
				$featureId: "legacy-feature",
				$projectPath: worktreeDir,
				$rp1ProjectRoot: worktreeDir,
				$rp1KbRoot: join(worktreeDir, ".rp1", "context"),
				$rp1WorkRoot: join(worktreeDir, ".rp1", "work"),
				$projectId: null,
				$runPolicy: null,
				$workIdentity: null,
				$bootstrapContext: null,
			});

			const result = await executeMigrate(worktreeDir);
			const canonicalRepoRoot = realpathSync(repoDir);

			const runRow = db
				.prepare(
					"SELECT project_path, rp1_project_root, project_id, run_policy, work_identity, bootstrap_context FROM runs WHERE id = $id",
				)
				.get({ $id: "legacy-build-run" }) as {
				project_path: string;
				rp1_project_root: string;
				project_id: string;
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
			};

			expect(runRow.project_path).toBe(canonicalRepoRoot);
			expect(runRow.rp1_project_root).toBe(canonicalRepoRoot);
			expect(runRow.project_id).toBe(result.projectId);
			expect(runRow.run_policy).toBe("resumable");
			expect(runRow.work_identity).toBe("FEATURE_ID=legacy-feature");

			const bootstrapContext = JSON.parse(runRow.bootstrap_context ?? "{}") as {
				workflow?: {
					name?: string;
					runPolicy?: string;
					identityArgs?: string[];
				};
				trace?: {
					projectIdentity?: string;
					workIdentity?: string | null;
					identityValues?: Record<string, string | boolean>;
					requestedProjectRoot?: string;
					canonicalProjectRoot?: string;
					isWorktree?: boolean;
				};
				run?: {
					decision?: string;
				};
			};

			expect(bootstrapContext.workflow?.name).toBe("build");
			expect(bootstrapContext.workflow?.runPolicy).toBe("resumable");
			expect(bootstrapContext.workflow?.identityArgs).toEqual(["FEATURE_ID"]);
			expect(bootstrapContext.trace?.projectIdentity).toBe(result.projectId);
			expect(bootstrapContext.trace?.workIdentity).toBe(
				"FEATURE_ID=legacy-feature",
			);
			expect(bootstrapContext.trace?.identityValues).toEqual({
				FEATURE_ID: "legacy-feature",
			});
			expect(bootstrapContext.trace?.requestedProjectRoot).toBe(worktreeDir);
			expect(bootstrapContext.trace?.canonicalProjectRoot).toBe(
				canonicalRepoRoot,
			);
			expect(bootstrapContext.trace?.isWorktree).toBe(true);
			expect(bootstrapContext.run?.decision).toBe("created_new_run");

			const resumableResult = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "legacy-feature",
				projectPath: canonicalRepoRoot,
				rp1ProjectRoot: canonicalRepoRoot,
				rp1KbRoot: join(canonicalRepoRoot, ".rp1", "context"),
				rp1WorkRoot: join(canonicalRepoRoot, ".rp1", "work"),
				projectId: result.projectId,
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=legacy-feature",
				bootstrapContext: runRow.bootstrap_context ?? "{}",
				harness: "codex",
			});

			expect(resumableResult.run.id).toBe("legacy-build-run");
			expect(resumableResult.resumed).toBe(true);
			expect(resumableResult.decision).toBe("matched_non_terminal_run");
		});

		test("keeps partially backfillable previous runs eligible for legacy resume compatibility after migration", async () => {
			await mkdir(join(tempDir, ".rp1"), { recursive: true });

			const db = await expectTaskRight(getEmitDatabase(process.env.RP1_DB!));
			db.prepare(
				`INSERT INTO runs (
					id, flow, feature_id, project_path, rp1_project_root,
					rp1_kb_root, rp1_work_root, project_id,
					run_policy, work_identity, bootstrap_context
				) VALUES (
					$id, $flow, $featureId, $projectPath, $rp1ProjectRoot,
					$rp1KbRoot, $rp1WorkRoot, $projectId,
					$runPolicy, $workIdentity, $bootstrapContext
				)`,
			).run({
				$id: "legacy-compat-run",
				$flow: "unknown",
				$featureId: "legacy-feature",
				$projectPath: tempDir,
				$rp1ProjectRoot: tempDir,
				$rp1KbRoot: join(tempDir, ".rp1", "context"),
				$rp1WorkRoot: join(tempDir, ".rp1", "work"),
				$projectId: null,
				$runPolicy: null,
				$workIdentity: null,
				$bootstrapContext: null,
			});

			const result = await executeMigrate(tempDir);

			const migratedRun = db
				.prepare(
					"SELECT project_id, run_policy, work_identity, bootstrap_context FROM runs WHERE id = $id",
				)
				.get({ $id: "legacy-compat-run" }) as {
				project_id: string | null;
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
			};

			expect(migratedRun.project_id).toBe(result.projectId);
			expect(migratedRun.run_policy).toBeNull();
			expect(migratedRun.work_identity).toBeNull();
			expect(migratedRun.bootstrap_context).toBeNull();

			const resumeResult = findOrCreateWorkflowRun(db, {
				flow: "build",
				featureId: "legacy-feature",
				projectPath: tempDir,
				rp1ProjectRoot: tempDir,
				rp1KbRoot: join(tempDir, ".rp1", "context"),
				rp1WorkRoot: join(tempDir, ".rp1", "work"),
				projectId: result.projectId,
				runPolicy: "resumable",
				workIdentity: "FEATURE_ID=legacy-feature",
				bootstrapContext: JSON.stringify({
					workflow: {
						name: "build",
						runPolicy: "resumable",
						identityArgs: ["FEATURE_ID"],
					},
					run: {
						decision: "legacy_backfill_resume",
					},
				}),
				harness: "codex",
			});

			expect(resumeResult.run.id).toBe("legacy-compat-run");
			expect(resumeResult.resumed).toBe(true);
			expect(resumeResult.decision).toBe("legacy_backfill_resume");

			const repairedRun = db
				.prepare(
					"SELECT flow, run_policy, work_identity, bootstrap_context FROM runs WHERE id = $id",
				)
				.get({ $id: "legacy-compat-run" }) as {
				flow: string;
				run_policy: string | null;
				work_identity: string | null;
				bootstrap_context: string | null;
			};

			expect(repairedRun.flow).toBe("build");
			expect(repairedRun.run_policy).toBe("resumable");
			expect(repairedRun.work_identity).toBe("FEATURE_ID=legacy-feature");
			expect(repairedRun.bootstrap_context).toContain("legacy_backfill_resume");
		});
	});

	describe("formatMigrateSummary", () => {
		test("formats a summary with all sections", () => {
			const summary = formatMigrateSummary({
				projectRoot: tempDir,
				projectId: "test-uuid",
				projectIdCreated: true,
				workDirCreated: true,
				legacyWork: { legacyPath: "/old/path", filesMoved: 3, filesSkipped: 1 },
				gitignore: { updated: true, rulesAdded: ["!.rp1/", ".rp1/*"] },
				dbBackfill: {
					runsUpdated: 2,
					artifactsUpdated: 1,
					tasksUpdated: 0,
					notificationsUpdated: 1,
					artifactFilesMoved: 2,
				},
				stanzaUpgrade: {
					filesUpgraded: [],
					filesAlreadyCurrent: [],
					filesScanned: 0,
					filesNotFound: [],
					errors: [],
				},
				arcadeSettings: {
					globalMigrated: false,
					projectMigrated: false,
				},
			});

			expect(summary).toContain("Created .rp1/project_id");
			expect(summary).toContain("Created .rp1/work/");
			expect(summary).toContain("Moved 3 file(s)");
			expect(summary).toContain("Updated .gitignore");
			expect(summary).toContain("Repaired Arcade metadata");
			expect(summary).toContain("Moved 2 misplaced artifact file(s)");
		});

		test("formats dry-run Activity search rebuild reporting", () => {
			const summary = formatMigrateSummary({
				dryRun: true,
				projectRoot: tempDir,
				projectId: "(generated on apply)",
				projectIdCreated: true,
				workDirCreated: true,
				legacyWork: undefined,
				gitignore: { updated: false, rulesAdded: [] },
				dbBackfill: {
					runsUpdated: 0,
					artifactsUpdated: 0,
					tasksUpdated: 0,
					notificationsUpdated: 0,
					artifactFilesMoved: 0,
					activitySearchRowsCreated: 2,
					activitySearchRowsRefreshed: 1,
				},
				stanzaUpgrade: {
					filesUpgraded: [],
					filesAlreadyCurrent: [],
					filesScanned: 0,
					filesNotFound: [],
					errors: [],
				},
				arcadeSettings: {
					globalMigrated: false,
					projectMigrated: false,
				},
			});

			expect(summary).toContain("Migration dry-run");
			expect(summary).toContain(
				"Would rebuild Activity search rows: 2 to create, 1 to refresh",
			);
			expect(summary).toContain(
				"Would leave database history and files unchanged",
			);
		});
	});

	describe("gitignore-update", () => {
		test("adds all required rules to empty .gitignore", () => {
			const result = updateGitignore(tempDir);

			expect(result.updated).toBe(true);
			expect(result.rulesAdded).toContain("!.rp1/");
			expect(result.rulesAdded).toContain(".rp1/*");
			expect(result.rulesAdded).toContain("!.rp1/project_id");
		});

		test("is idempotent when rules already present", () => {
			updateGitignore(tempDir);
			const second = updateGitignore(tempDir);

			expect(second.updated).toBe(false);
			expect(second.rulesAdded).toHaveLength(0);
		});

		test("creates .gitignore when none exists", () => {
			const result = updateGitignore(tempDir);

			expect(result.updated).toBe(true);
			expect(existsSync(join(tempDir, ".gitignore"))).toBe(true);
		});
	});

	describe("legacy-work", () => {
		test("findLegacyWorkDir returns undefined when no legacy work exists", () => {
			const result = findLegacyWorkDir(tempDir);
			expect(result).toBeUndefined();
		});

		test("moveLegacyWork moves files without overwriting existing ones", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			await writeFile(join(legacyDir, "new-file.md"), "new content");
			await writeFile(join(destDir, "existing.md"), "existing content");
			await writeFile(join(legacyDir, "existing.md"), "overwrite attempt");

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				expect(result.filesMoved).toBe(1);
				expect(result.filesSkipped).toBe(1);
				expect(readFileSync(join(destDir, "existing.md"), "utf-8")).toBe(
					"existing content",
				);
				expect(readFileSync(join(destDir, "new-file.md"), "utf-8")).toBe(
					"new content",
				);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});

		test("moveLegacyWork only moves known work artifact entries at top level", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-known-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			// Known work entries
			await mkdir(join(legacyDir, "features", "my-feat"), { recursive: true });
			await writeFile(
				join(legacyDir, "features", "my-feat", "design.md"),
				"design",
			);
			await writeFile(join(legacyDir, "pr-review-checkpoint.json"), "{}");

			// Unknown entry (e.g. a stray checkout)
			await mkdir(join(legacyDir, "some-random-dir"), { recursive: true });
			await writeFile(
				join(legacyDir, "some-random-dir", "big-file.bin"),
				"data",
			);

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				expect(result.filesMoved).toBe(2);
				expect(result.filesSkipped).toBe(1);
				expect(
					existsSync(join(destDir, "features", "my-feat", "design.md")),
				).toBe(true);
				expect(existsSync(join(destDir, "pr-review-checkpoint.json"))).toBe(
					true,
				);
				expect(existsSync(join(destDir, "some-random-dir"))).toBe(false);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});

		test("moveLegacyWork skips directories containing .git", async () => {
			const legacyDir = join(tmpdir(), `rp1-legacy-git-${Date.now()}`);
			const destDir = join(tempDir, ".rp1", "work");
			await mkdir(legacyDir, { recursive: true });
			await mkdir(destDir, { recursive: true });

			// pr-reviews with a worktree checkout nested inside
			await mkdir(join(legacyDir, "pr-reviews", "worktrees", "pr-123"), {
				recursive: true,
			});
			await writeFile(
				join(legacyDir, "pr-reviews", "worktrees", "pr-123", ".git"),
				"gitdir: /somewhere",
			);
			await writeFile(
				join(legacyDir, "pr-reviews", "worktrees", "pr-123", "big-file.bin"),
				"data",
			);
			await writeFile(
				join(legacyDir, "pr-reviews", "summary.md"),
				"review summary",
			);

			try {
				const result = moveLegacyWork(tempDir, legacyDir);

				// summary.md moved, pr-123 dir skipped (has .git)
				expect(result.filesMoved).toBe(1);
				expect(result.filesSkipped).toBe(1);
				expect(existsSync(join(destDir, "pr-reviews", "summary.md"))).toBe(
					true,
				);
				expect(
					existsSync(
						join(destDir, "pr-reviews", "worktrees", "pr-123", "big-file.bin"),
					),
				).toBe(false);
			} finally {
				await rm(legacyDir, { recursive: true, force: true });
			}
		});
	});
});
