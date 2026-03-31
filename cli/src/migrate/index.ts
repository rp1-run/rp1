import { existsSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";
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

const isDirectory = (targetPath: string): boolean => {
	try {
		return statSync(targetPath).isDirectory();
	} catch {
		return false;
	}
};

const walkUpForRp1Dir = (startPath: string): string | undefined => {
	let current = path.resolve(startPath);

	while (true) {
		if (isDirectory(path.join(current, ".rp1"))) {
			return current;
		}

		const parent = path.dirname(current);
		if (parent === current) break;
		current = parent;
	}

	return undefined;
};

const tryGitRoot = (startPath: string): string | undefined => {
	try {
		const { execFileSync } = require("node:child_process");
		const topLevel = execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: startPath,
			encoding: "utf-8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return topLevel;
	} catch {
		return undefined;
	}
};

export const executeMigrate = async (
	cwd: string = process.cwd(),
): Promise<MigrateResult> => {
	let projectRoot = walkUpForRp1Dir(cwd);

	if (!projectRoot) {
		const gitRoot = tryGitRoot(cwd);
		if (gitRoot && isDirectory(path.join(gitRoot, ".rp1"))) {
			projectRoot = gitRoot;
		}
	}

	if (!projectRoot) {
		throw new Error(
			"No .rp1/ directory found. Run 'rp1 init' to initialize a project first.",
		);
	}

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
