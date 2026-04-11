import { execFileSync } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { copyFile, mkdir, rename, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { resolveDirectorySet } from "../../shared/directory-resolution.js";
import type { WorkflowRunPolicy } from "../../shared/events.js";
import {
	getArtifactByDocId,
	getArtifactsForRun,
	resolveArtifactPathForRun,
	type WorkflowRunDecision,
} from "../agent-tools/emit/database.js";

export interface DbBackfillResult {
	readonly runsUpdated: number;
	readonly artifactsUpdated: number;
	readonly tasksUpdated: number;
	readonly notificationsUpdated: number;
	readonly artifactFilesMoved: number;
}

interface RunBackfillRow {
	readonly id: string;
	readonly flow: string;
	readonly feature_id: string | null;
	readonly project_path: string;
	readonly rp1_project_root: string | null;
	readonly rp1_kb_root: string | null;
	readonly rp1_work_root: string | null;
	readonly project_id: string | null;
	readonly run_policy: WorkflowRunPolicy | null;
	readonly work_identity: string | null;
	readonly bootstrap_context: string | null;
}

interface TaskBackfillRow {
	readonly id: number;
	readonly project_path: string | null;
	readonly project_id: string | null;
}

interface HistoricalWorkflowBackfill {
	readonly runPolicy: WorkflowRunPolicy;
	readonly identityArgs: readonly string[];
}

interface RunBootstrapBackfill {
	readonly runPolicy: WorkflowRunPolicy;
	readonly workIdentity: string | null;
	readonly bootstrapContext: string;
}

const HISTORICAL_WORKFLOW_BACKFILLS: Readonly<
	Record<string, HistoricalWorkflowBackfill>
> = {
	build: {
		runPolicy: "resumable",
		identityArgs: ["FEATURE_ID"],
	},
	"build-fast": {
		runPolicy: "fresh",
		identityArgs: [],
	},
	blueprint: {
		runPolicy: "fresh",
		identityArgs: [],
	},
	"pr-review": {
		runPolicy: "fresh",
		identityArgs: [],
	},
	speedrun: {
		runPolicy: "fresh",
		identityArgs: [],
	},
	"knowledge-build": {
		runPolicy: "fresh",
		identityArgs: [],
	},
	"generate-user-docs": {
		runPolicy: "fresh",
		identityArgs: [],
	},
};

const GIT_ENV_VARS_TO_CLEAR = [
	"GIT_DIR",
	"GIT_WORK_TREE",
	"GIT_INDEX_FILE",
	"GIT_OBJECT_DIRECTORY",
	"GIT_ALTERNATE_OBJECT_DIRECTORIES",
	"GIT_COMMON_DIR",
] as const;

const defaultKbRoot = (projectRoot: string): string =>
	join(resolve(projectRoot), ".rp1", "context");

const defaultWorkRoot = (projectRoot: string): string =>
	join(resolve(projectRoot), ".rp1", "work");

const canonicalizePath = (targetPath: string): string => {
	const resolvedPath = resolve(targetPath);
	try {
		return realpathSync(resolvedPath);
	} catch {
		return resolvedPath;
	}
};

const getIsolatedGitEnv = (): NodeJS.ProcessEnv => {
	const env = { ...process.env };
	for (const key of GIT_ENV_VARS_TO_CLEAR) {
		delete env[key];
	}
	return env;
};

const expandPathAliases = (targetPath: string): readonly string[] => {
	const aliases = new Set([resolve(targetPath), canonicalizePath(targetPath)]);

	for (const value of Array.from(aliases)) {
		if (value.startsWith("/private/var/")) {
			aliases.add(value.replace(/^\/private\/var\//, "/var/"));
		}
		if (value.startsWith("/var/")) {
			aliases.add(value.replace(/^\/var\//, "/private/var/"));
		}
		if (value.startsWith("/private/tmp/")) {
			aliases.add(value.replace(/^\/private\/tmp\//, "/tmp/"));
		}
		if (value.startsWith("/tmp/")) {
			aliases.add(value.replace(/^\/tmp\//, "/private/tmp/"));
		}
	}

	return Array.from(aliases);
};

const listCandidateProjectPaths = (projectRoot: string): readonly string[] => {
	const resolvedProjectRoot = resolve(projectRoot);

	try {
		const output = execFileSync("git", ["worktree", "list", "--porcelain"], {
			cwd: resolvedProjectRoot,
			encoding: "utf-8",
			env: getIsolatedGitEnv(),
			stdio: ["ignore", "pipe", "pipe"],
		});

		const worktreePaths = output
			.split("\n")
			.filter((line) => line.startsWith("worktree "))
			.flatMap((line) => expandPathAliases(line.slice("worktree ".length)));

		return Array.from(
			new Set([...expandPathAliases(projectRoot), ...worktreePaths]),
		);
	} catch {
		return expandPathAliases(projectRoot);
	}
};

const buildProjectPathWhereClause = (
	columnName: string,
	projectPaths: readonly string[],
): { readonly clause: string; readonly params: readonly string[] } => {
	const conditions: string[] = [];
	const params: string[] = [];

	for (const projectPath of projectPaths) {
		conditions.push(`(${columnName} = ? OR ${columnName} LIKE ?)`);
		params.push(projectPath, `${projectPath}/%`);
	}

	return {
		clause: conditions.length > 0 ? conditions.join(" OR ") : "1 = 0",
		params,
	};
};

const belongsToProject = (
	recordPath: string | null,
	targetProjectRoot: string,
): boolean => {
	if (!recordPath) {
		return false;
	}

	const resolved = resolveDirectorySet(recordPath);
	if (E.isLeft(resolved)) {
		return false;
	}

	return (
		canonicalizePath(resolved.right.projectRoot) ===
		canonicalizePath(targetProjectRoot)
	);
};

const matchesCandidatePath = (
	recordPath: string | null,
	candidateProjectPaths: readonly string[],
): boolean => {
	if (!recordPath) {
		return false;
	}

	const resolved = resolve(recordPath);
	const canonical = canonicalizePath(recordPath);
	return candidateProjectPaths.some((candidatePath) => {
		const resolvedCandidate = resolve(candidatePath);
		const canonicalCandidate = canonicalizePath(candidatePath);
		return (
			resolved === resolvedCandidate ||
			canonical === canonicalCandidate ||
			resolved.startsWith(`${resolvedCandidate}/`) ||
			canonical.startsWith(`${canonicalCandidate}/`)
		);
	});
};

const asObject = (value: unknown): Readonly<Record<string, unknown>> | null =>
	typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;

const parseJsonSafe = (
	value: string | null,
): Readonly<Record<string, unknown>> | null => {
	if (!value) {
		return null;
	}

	try {
		return JSON.parse(value) as Record<string, unknown>;
	} catch {
		return null;
	}
};

const isWorkflowRunDecision = (value: unknown): value is WorkflowRunDecision =>
	value === "created_new_run" ||
	value === "matched_non_terminal_run" ||
	value === "legacy_backfill_resume";

const normalizeRunValue = (
	value: string | null | undefined,
): string | undefined => {
	if (typeof value !== "string") {
		return undefined;
	}

	const trimmed = value.trim();
	return trimmed.length > 0 && trimmed !== "unknown" ? trimmed : undefined;
};

const selectRequestedProjectRoot = (
	run: RunBackfillRow,
	canonicalProjectRoot: string,
	candidateProjectPaths: readonly string[],
	targetProjectRoot: string,
): string => {
	if (
		belongsToProject(run.project_path, canonicalProjectRoot) ||
		matchesCandidatePath(run.project_path, candidateProjectPaths)
	) {
		return resolve(run.project_path);
	}

	if (
		belongsToProject(run.rp1_project_root, canonicalProjectRoot) ||
		matchesCandidatePath(run.rp1_project_root, candidateProjectPaths)
	) {
		return resolve(run.rp1_project_root ?? targetProjectRoot);
	}

	return targetProjectRoot;
};

const deriveHistoricalIdentity = (
	run: RunBackfillRow,
	identityArgs: readonly string[],
): {
	readonly identityValues: Record<string, string | boolean>;
	readonly workIdentity?: string;
} | null => {
	const identityValues: Record<string, string | boolean> = {};

	for (const argName of identityArgs) {
		switch (argName) {
			case "FEATURE_ID": {
				const featureId = normalizeRunValue(run.feature_id);
				if (!featureId) {
					return null;
				}
				identityValues[argName] = featureId;
				break;
			}
			default:
				return null;
		}
	}

	return {
		identityValues,
		workIdentity:
			identityArgs.length > 0
				? identityArgs
						.map((argName) => `${argName}=${String(identityValues[argName])}`)
						.join("|")
				: undefined,
	};
};

const deriveInvocationDetails = (
	requestedProjectRoot: string,
	canonicalProjectRoot: string,
): { readonly isWorktree: boolean; readonly worktreeName?: string } => {
	const resolved = resolveDirectorySet(requestedProjectRoot);
	if (
		E.isLeft(resolved) ||
		canonicalizePath(resolved.right.projectRoot) !== canonicalProjectRoot
	) {
		return { isWorktree: false };
	}

	return {
		isWorktree: resolved.right.isWorktree,
		worktreeName: resolved.right.worktreeName,
	};
};

const buildHistoricalBootstrapContext = (params: {
	readonly workflowName: string;
	readonly workflow: HistoricalWorkflowBackfill;
	readonly targetDirectories: {
		readonly projectRoot: string;
		readonly kbRoot: string;
		readonly workRoot: string;
		readonly projectId: string;
	};
	readonly projectIdentity: string;
	readonly requestedProjectRoot: string;
	readonly invocation: {
		readonly isWorktree: boolean;
		readonly worktreeName?: string;
	};
	readonly decision: WorkflowRunDecision;
	readonly identityValues: Readonly<Record<string, string | boolean>>;
	readonly workIdentity: string | null;
}): string =>
	JSON.stringify({
		workflow: {
			name: params.workflowName,
			runPolicy: params.workflow.runPolicy,
			identityArgs: params.workflow.identityArgs,
		},
		directories: {
			projectRoot: params.targetDirectories.projectRoot,
			kbRoot: params.targetDirectories.kbRoot,
			workRoot: params.targetDirectories.workRoot,
		},
		trace: {
			projectIdentity: params.projectIdentity,
			workIdentity: params.workIdentity,
			identityValues: params.identityValues,
			requestedProjectRoot: params.requestedProjectRoot,
			canonicalProjectRoot: params.targetDirectories.projectRoot,
			isWorktree: params.invocation.isWorktree,
			...(params.invocation.worktreeName
				? { worktreeName: params.invocation.worktreeName }
				: {}),
		},
		run: {
			decision: params.decision,
		},
	});

const deriveRunBootstrapBackfill = (
	run: RunBackfillRow,
	params: {
		readonly canonicalProjectRoot: string;
		readonly candidateProjectPaths: readonly string[];
		readonly targetDirectories: {
			readonly projectRoot: string;
			readonly kbRoot: string;
			readonly workRoot: string;
			readonly projectId: string;
		};
	},
): RunBootstrapBackfill | null => {
	const workflow = HISTORICAL_WORKFLOW_BACKFILLS[run.flow];
	if (!workflow) {
		return null;
	}

	const identity = deriveHistoricalIdentity(run, workflow.identityArgs);
	if (identity === null) {
		return null;
	}

	const existingContext = parseJsonSafe(run.bootstrap_context);
	const existingTrace = asObject(existingContext?.trace);
	const existingRun = asObject(existingContext?.run);
	const existingRequestedProjectRoot = existingTrace?.requestedProjectRoot;
	const existingWorktreeName = existingTrace?.worktreeName;
	const requestedProjectRoot =
		typeof existingRequestedProjectRoot === "string" &&
		existingRequestedProjectRoot.length > 0
			? existingRequestedProjectRoot
			: selectRequestedProjectRoot(
					run,
					params.canonicalProjectRoot,
					params.candidateProjectPaths,
					params.targetDirectories.projectRoot,
				);
	const derivedInvocation = deriveInvocationDetails(
		requestedProjectRoot,
		params.canonicalProjectRoot,
	);
	const invocation = {
		isWorktree:
			derivedInvocation.isWorktree || existingTrace?.isWorktree === true,
		worktreeName:
			derivedInvocation.worktreeName ??
			(typeof existingWorktreeName === "string" &&
			existingWorktreeName.length > 0
				? existingWorktreeName
				: undefined),
	};
	const decision = isWorkflowRunDecision(existingRun?.decision)
		? existingRun.decision
		: "created_new_run";
	const workIdentity = identity.workIdentity ?? null;

	return {
		runPolicy: workflow.runPolicy,
		workIdentity,
		bootstrapContext: buildHistoricalBootstrapContext({
			workflowName: run.flow,
			workflow,
			targetDirectories: params.targetDirectories,
			projectIdentity: params.targetDirectories.projectId,
			requestedProjectRoot,
			invocation,
			decision,
			identityValues: identity.identityValues,
			workIdentity,
		}),
	};
};

const getStoredRunDirectories = (run: RunBackfillRow) => {
	const projectRoot = resolve(run.rp1_project_root ?? run.project_path);
	return {
		projectRoot,
		kbRoot: resolve(run.rp1_kb_root ?? defaultKbRoot(projectRoot)),
		workRoot: resolve(run.rp1_work_root ?? defaultWorkRoot(projectRoot)),
	};
};

const resolveArtifactAbsolutePath = (
	artifact: {
		readonly path: string;
		readonly storageRoot: "absolute" | "project" | "work_dir";
	},
	directories: {
		readonly projectRoot: string;
		readonly workRoot: string;
	},
): string => {
	if (artifact.storageRoot === "absolute" || isAbsolute(artifact.path)) {
		return resolve(artifact.path);
	}

	if (artifact.storageRoot === "project") {
		return resolve(directories.projectRoot, artifact.path);
	}

	return resolve(directories.workRoot, artifact.path);
};

const moveFile = async (
	sourcePath: string,
	targetPath: string,
): Promise<boolean> => {
	if (resolve(sourcePath) === resolve(targetPath)) {
		return false;
	}

	if (
		!(await Bun.file(sourcePath).exists()) ||
		(await Bun.file(targetPath).exists())
	) {
		return false;
	}

	await mkdir(dirname(targetPath), { recursive: true });

	try {
		await rename(sourcePath, targetPath);
	} catch (error) {
		const code = (error as NodeJS.ErrnoException).code;
		if (code !== "EXDEV") {
			throw error;
		}

		await copyFile(sourcePath, targetPath);
		await unlink(sourcePath);
	}

	return true;
};

const repairArtifactsForRun = async (
	db: import("bun:sqlite").Database,
	run: RunBackfillRow,
	artifacts: ReturnType<typeof getArtifactsForRun>,
	target: {
		readonly projectRoot: string;
		readonly kbRoot: string;
		readonly workRoot: string;
		readonly projectId: string;
	},
): Promise<{
	readonly artifactsUpdated: number;
	readonly artifactFilesMoved: number;
}> => {
	const storedDirectories = getStoredRunDirectories(run);
	let artifactsUpdated = 0;
	let artifactFilesMoved = 0;

	for (const artifact of artifacts) {
		const resolvedPath = await resolveArtifactPathForRun(
			db,
			{
				rp1ProjectRoot: storedDirectories.projectRoot,
				rp1WorkRoot: storedDirectories.workRoot,
			},
			artifact,
		);

		const refreshedArtifact =
			getArtifactByDocId(db, artifact.docId) ?? artifact;

		if (
			resolvedPath &&
			refreshedArtifact.storageRoot !== "absolute" &&
			(await moveFile(
				resolvedPath,
				resolveArtifactAbsolutePath(
					{
						path: refreshedArtifact.path,
						storageRoot: refreshedArtifact.storageRoot,
					},
					{
						projectRoot: target.projectRoot,
						workRoot: target.workRoot,
					},
				),
			))
		) {
			artifactFilesMoved++;
		}

		if (
			refreshedArtifact.projectPath === target.projectRoot &&
			refreshedArtifact.projectId === target.projectId
		) {
			continue;
		}

		db.prepare(
			`UPDATE artifacts
			 SET project_path = $projectPath,
			     project_id = $projectId
			 WHERE doc_id = $docId`,
		).run({
			$projectPath: target.projectRoot,
			$projectId: target.projectId,
			$docId: refreshedArtifact.docId,
		});
		artifactsUpdated++;
	}

	return { artifactsUpdated, artifactFilesMoved };
};

export const backfillProjectId = async (
	projectRoot: string,
	projectId: string,
): Promise<DbBackfillResult> => {
	const dbPath = process.env.RP1_DB ?? join(homedir(), ".rp1", "rp1.db");

	if (!existsSync(dbPath)) {
		return {
			runsUpdated: 0,
			artifactsUpdated: 0,
			tasksUpdated: 0,
			notificationsUpdated: 0,
			artifactFilesMoved: 0,
		};
	}

	const { Database } = require("bun:sqlite");
	const db = new Database(dbPath);
	db.exec("PRAGMA journal_mode = WAL");
	db.exec("PRAGMA busy_timeout = 5000");

	const canonicalProjectRoot = canonicalizePath(projectRoot);
	const targetDirectories = {
		projectRoot: resolve(projectRoot),
		kbRoot: defaultKbRoot(projectRoot),
		workRoot: defaultWorkRoot(projectRoot),
		projectId,
	};
	const candidateProjectPaths = listCandidateProjectPaths(projectRoot);
	const projectPathFilter = buildProjectPathWhereClause(
		"project_path",
		candidateProjectPaths,
	);

	try {
		const ensureColumn = (table: string, column: string) => {
			const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
				name: string;
			}[];
			if (!cols.some((c) => c.name === column)) {
				db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT DEFAULT NULL`);
			}
		};

		const hasTable = (table: string): boolean =>
			db
				.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
				.get(table) !== null;

		const renameColumnIfNeeded = (
			table: string,
			oldName: string,
			newName: string,
		) => {
			const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
				name: string;
			}[];
			const colNames = new Set(cols.map((c) => c.name));
			if (colNames.has(oldName) && !colNames.has(newName)) {
				db.exec(`ALTER TABLE ${table} RENAME COLUMN ${oldName} TO ${newName}`);
			}
		};

		// Ensure runs table has the columns this backfill needs (pre-v7 DBs
		// lack rp1_project_root; pre-v8 DBs use rp1_kb_dir / rp1_work_dir)
		ensureColumn("runs", "rp1_project_root");
		renameColumnIfNeeded("runs", "rp1_kb_dir", "rp1_kb_root");
		renameColumnIfNeeded("runs", "rp1_work_dir", "rp1_work_root");
		ensureColumn("runs", "rp1_kb_root");
		ensureColumn("runs", "rp1_work_root");

		ensureColumn("runs", "project_id");
		ensureColumn("artifacts", "project_id");
		ensureColumn("tasks", "project_id");

		const runColumns = db.prepare("PRAGMA table_info(runs)").all() as {
			name: string;
		}[];
		const runColumnNames = new Set(runColumns.map((column) => column.name));
		if (!runColumnNames.has("run_policy")) {
			db.exec(
				"ALTER TABLE runs ADD COLUMN run_policy TEXT DEFAULT NULL CHECK(run_policy IN ('fresh', 'resumable'))",
			);
		}
		if (!runColumnNames.has("work_identity")) {
			db.exec("ALTER TABLE runs ADD COLUMN work_identity TEXT DEFAULT NULL");
		}
		if (!runColumnNames.has("bootstrap_context")) {
			db.exec(
				"ALTER TABLE runs ADD COLUMN bootstrap_context TEXT DEFAULT NULL",
			);
		}

		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_runs_project_work_identity_status ON runs(project_id, flow, work_identity, status)",
		);
		db.exec(
			"CREATE INDEX IF NOT EXISTS idx_runs_root_work_identity_status ON runs(rp1_project_root, flow, work_identity, status)",
		);

		const rp1ProjectRootFilter = buildProjectPathWhereClause(
			"rp1_project_root",
			candidateProjectPaths,
		);

		const runRows = db
			.prepare(
				`SELECT id, flow, feature_id, project_path, rp1_project_root, rp1_kb_root, rp1_work_root, project_id, run_policy, work_identity, bootstrap_context
				 FROM runs
				 WHERE (${projectPathFilter.clause})
				    OR project_id = ?
				    OR rp1_project_root = ?
				    OR (${rp1ProjectRootFilter.clause})`,
			)
			.all(
				...projectPathFilter.params,
				projectId,
				targetDirectories.projectRoot,
				...rp1ProjectRootFilter.params,
			) as RunBackfillRow[];

		let runsUpdated = 0;
		let artifactsUpdated = 0;
		let tasksUpdated = 0;
		let notificationsUpdated = 0;
		let artifactFilesMoved = 0;

		for (const run of runRows) {
			if (
				!belongsToProject(run.project_path, canonicalProjectRoot) &&
				!belongsToProject(run.rp1_project_root, canonicalProjectRoot) &&
				!matchesCandidatePath(run.project_path, candidateProjectPaths) &&
				!matchesCandidatePath(run.rp1_project_root, candidateProjectPaths)
			) {
				continue;
			}

			const storedDirectories = getStoredRunDirectories(run);
			const runBootstrapBackfill = deriveRunBootstrapBackfill(run, {
				canonicalProjectRoot,
				candidateProjectPaths,
				targetDirectories,
			});
			const nextRunPolicy = runBootstrapBackfill?.runPolicy ?? run.run_policy;
			const nextWorkIdentity =
				runBootstrapBackfill?.workIdentity ?? run.work_identity;
			const nextBootstrapContext =
				runBootstrapBackfill?.bootstrapContext ?? run.bootstrap_context;
			const needsRunRepair =
				run.project_path !== targetDirectories.projectRoot ||
				canonicalizePath(storedDirectories.projectRoot) !==
					canonicalProjectRoot ||
				canonicalizePath(storedDirectories.kbRoot) !==
					canonicalizePath(targetDirectories.kbRoot) ||
				canonicalizePath(storedDirectories.workRoot) !==
					canonicalizePath(targetDirectories.workRoot) ||
				run.project_id !== projectId;
			const needsDeterministicBackfill =
				nextRunPolicy !== run.run_policy ||
				nextWorkIdentity !== run.work_identity ||
				nextBootstrapContext !== run.bootstrap_context;

			const runArtifacts = getArtifactsForRun(db, run.id);
			const needsArtifactRepair =
				needsRunRepair ||
				runArtifacts.some(
					(artifact) =>
						artifact.projectPath !== targetDirectories.projectRoot ||
						artifact.projectId !== projectId,
				);

			if (needsArtifactRepair) {
				const artifactRepair = await repairArtifactsForRun(
					db,
					run,
					runArtifacts,
					targetDirectories,
				);
				artifactsUpdated += artifactRepair.artifactsUpdated;
				artifactFilesMoved += artifactRepair.artifactFilesMoved;
			}

			if (needsRunRepair || needsDeterministicBackfill) {
				db.prepare(
					`UPDATE runs
					 SET project_path = $projectPath,
					     rp1_project_root = $rp1ProjectRoot,
					     rp1_kb_root = $rp1KbRoot,
					     rp1_work_root = $rp1WorkRoot,
					     project_id = $projectId,
					     run_policy = $runPolicy,
					     work_identity = $workIdentity,
					     bootstrap_context = $bootstrapContext
					 WHERE id = $id`,
				).run({
					$id: run.id,
					$projectPath: targetDirectories.projectRoot,
					$rp1ProjectRoot: targetDirectories.projectRoot,
					$rp1KbRoot: targetDirectories.kbRoot,
					$rp1WorkRoot: targetDirectories.workRoot,
					$projectId: projectId,
					$runPolicy: nextRunPolicy,
					$workIdentity: nextWorkIdentity,
					$bootstrapContext: nextBootstrapContext,
				});
				runsUpdated++;
			}

			if (hasTable("notifications")) {
				const notificationResult = db
					.prepare(
						`UPDATE notifications
						 SET project_id = $projectId
						 WHERE source_id = $runId
						   AND source_type IN ('run', 'agent')
						   AND COALESCE(project_id, '') <> $projectId`,
					)
					.run({
						$projectId: projectId,
						$runId: run.id,
					});
				notificationsUpdated += notificationResult.changes;
			}
		}

		const artifactRows = db
			.prepare(
				`SELECT doc_id, run_id, project_path, project_id
				 FROM artifacts
				 WHERE (${projectPathFilter.clause})
				    OR project_id = ?`,
			)
			.all(...projectPathFilter.params, projectId) as {
			doc_id: string;
			run_id: string | null;
			project_path: string;
			project_id: string | null;
		}[];

		for (const artifact of artifactRows) {
			if (artifact.run_id !== null) {
				continue;
			}

			if (
				!belongsToProject(artifact.project_path, canonicalProjectRoot) &&
				!matchesCandidatePath(artifact.project_path, candidateProjectPaths)
			) {
				continue;
			}

			if (
				artifact.project_path === targetDirectories.projectRoot &&
				artifact.project_id === projectId
			) {
				continue;
			}

			const result = db
				.prepare(
					`UPDATE artifacts
					 SET project_path = $projectPath,
					     project_id = $projectId
					 WHERE doc_id = $docId`,
				)
				.run({
					$projectPath: targetDirectories.projectRoot,
					$projectId: projectId,
					$docId: artifact.doc_id,
				});
			artifactsUpdated += result.changes;
		}

		const taskRows = db
			.prepare(
				`SELECT id, project_path, project_id
				 FROM tasks
				 WHERE (${projectPathFilter.clause})
				    OR project_id = ?`,
			)
			.all(...projectPathFilter.params, projectId) as TaskBackfillRow[];

		for (const task of taskRows) {
			if (
				!belongsToProject(task.project_path, canonicalProjectRoot) &&
				!matchesCandidatePath(task.project_path, candidateProjectPaths)
			) {
				continue;
			}

			if (
				task.project_path === targetDirectories.projectRoot &&
				task.project_id === projectId
			) {
				continue;
			}

			const result = db
				.prepare(
					`UPDATE tasks
					 SET project_path = $projectPath,
					     project_id = $projectId
					 WHERE id = $id`,
				)
				.run({
					$id: task.id,
					$projectPath: targetDirectories.projectRoot,
					$projectId: projectId,
				});
			tasksUpdated += result.changes;
		}

		return {
			runsUpdated,
			artifactsUpdated,
			tasksUpdated,
			notificationsUpdated,
			artifactFilesMoved,
		};
	} finally {
		db.close();
	}
};
