import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export interface DbBackfillResult {
	readonly runsUpdated: number;
	readonly artifactsUpdated: number;
	readonly tasksUpdated: number;
}

export const backfillProjectId = (
	projectRoot: string,
	projectId: string,
): DbBackfillResult => {
	const dbPath = process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

	if (!existsSync(dbPath)) {
		return { runsUpdated: 0, artifactsUpdated: 0, tasksUpdated: 0 };
	}

	// Use dynamic import-style require for bun:sqlite to avoid issues
	// in non-database contexts. Open a separate connection for migration.
	const { Database } = require("bun:sqlite");
	const db = new Database(dbPath);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA busy_timeout = 5000");

	const resolvedRoot = resolve(projectRoot);

	try {
		const runsResult = db
			.prepare(
				`UPDATE runs SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND rp1_project_root = $projectRoot`,
			)
			.run({
				$projectId: projectId,
				$projectRoot: resolvedRoot,
			});

		const artifactsResult = db
			.prepare(
				`UPDATE artifacts SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND project_path = $projectPath`,
			)
			.run({
				$projectId: projectId,
				$projectPath: resolvedRoot,
			});

		const tasksResult = db
			.prepare(
				`UPDATE tasks SET project_id = $projectId
			 WHERE project_id IS NULL
			   AND project_path = $projectPath`,
			)
			.run({
				$projectId: projectId,
				$projectPath: resolvedRoot,
			});

		return {
			runsUpdated: runsResult.changes,
			artifactsUpdated: artifactsResult.changes,
			tasksUpdated: tasksResult.changes,
		};
	} finally {
		db.close();
	}
};
