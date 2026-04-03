import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import { ensureProjectId } from "../../shared/project-id.js";
import { backfillProjectId, type DbBackfillResult } from "./db-backfill.js";
import {
	type GitignoreUpdateResult,
	updateGitignore,
} from "./gitignore-update.js";
import {
	findLegacyWorkDir,
	type LegacyWorkResult,
	moveLegacyWork,
} from "./legacy-work.js";

export interface MigrateResult {
	readonly projectRoot: string;
	readonly projectId: string;
	readonly projectIdCreated: boolean;
	readonly workDirCreated: boolean;
	readonly legacyWork: LegacyWorkResult | undefined;
	readonly gitignore: GitignoreUpdateResult;
	readonly dbBackfill: DbBackfillResult;
}

export const executeMigrate = async (
	cwd: string = process.cwd(),
): Promise<MigrateResult> => {
	const directories = resolveDirectorySet(cwd);
	if (E.isLeft(directories)) {
		throw new Error(
			"No .rp1/ directory found. Run 'rp1 init' to initialize a project first.",
		);
	}
	const projectRoot = directories.right.projectRoot;

	const projectIdExistedBefore = existsSync(
		path.join(projectRoot, ".rp1", "project_id"),
	);
	const projectId = await ensureProjectId(projectRoot);
	const projectIdCreated = !projectIdExistedBefore;

	const workDir = path.join(projectRoot, ".rp1", "work");
	const workDirExistedBefore = existsSync(workDir);
	if (!workDirExistedBefore) {
		mkdirSync(workDir, { recursive: true });
	}
	const workDirCreated = !workDirExistedBefore;

	let legacyWork: LegacyWorkResult | undefined;
	const legacyPath = findLegacyWorkDir(projectRoot);
	if (legacyPath) {
		legacyWork = moveLegacyWork(projectRoot, legacyPath);
	}

	const gitignore = updateGitignore(projectRoot);

	const dbBackfill = backfillProjectId(projectRoot, projectId);

	return {
		projectRoot,
		projectId,
		projectIdCreated,
		workDirCreated,
		legacyWork,
		gitignore,
		dbBackfill,
	};
};

export const formatMigrateSummary = (result: MigrateResult): string => {
	const lines: string[] = [];
	lines.push(`Migration complete for ${result.projectRoot}`);
	lines.push("");

	if (result.projectIdCreated) {
		lines.push(`  Created .rp1/project_id: ${result.projectId}`);
	} else {
		lines.push(`  Project ID: ${result.projectId} (already existed)`);
	}

	if (result.workDirCreated) {
		lines.push("  Created .rp1/work/");
	} else {
		lines.push("  .rp1/work/ already exists");
	}

	if (result.legacyWork) {
		if (result.legacyWork.filesMoved > 0) {
			lines.push(
				`  Moved ${result.legacyWork.filesMoved} file(s) from ${result.legacyWork.legacyPath}`,
			);
		}
		if (result.legacyWork.filesSkipped > 0) {
			lines.push(
				`  Skipped ${result.legacyWork.filesSkipped} file(s) (already exist or symlinks)`,
			);
		}
	} else {
		lines.push("  No legacy work directory found");
	}

	if (result.gitignore.updated) {
		lines.push(
			`  Updated .gitignore (added ${result.gitignore.rulesAdded.length} rule(s))`,
		);
	} else {
		lines.push("  .gitignore already up to date");
	}

	const totalDbUpdated =
		result.dbBackfill.runsUpdated +
		result.dbBackfill.artifactsUpdated +
		result.dbBackfill.tasksUpdated;
	if (totalDbUpdated > 0) {
		lines.push(
			`  Backfilled project_id in ${result.dbBackfill.runsUpdated} run(s), ${result.dbBackfill.artifactsUpdated} artifact(s), ${result.dbBackfill.tasksUpdated} task(s)`,
		);
	} else {
		lines.push("  No database records to backfill");
	}

	return lines.join("\n");
};
