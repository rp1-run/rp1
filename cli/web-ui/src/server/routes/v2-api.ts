/**
 * V2 API endpoints for runs and projects.
 * Integrates with status.db for real run data via database queries.
 *
 * Step derivation uses dynamic state machine loading from co-located
 * state.mmd files. Workflows without state.mmd fall back to step-based
 * grouping. Stale rows (expired via expires_at) are filtered on read.
 */

import { extname, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { formatError } from "../../../../shared/errors.js";
import {
	deriveOrderedSteps,
	listWorkflows,
	loadStateMachine,
} from "../../../../src/agent-tools/state-machine/index.js";
import type {
	OrderedStep,
	StateMachine,
} from "../../../../src/agent-tools/state-machine/models.js";
import {
	getProjectRunStats,
	queryAgentUpdatesForRun,
	queryAllLatestStatuses,
	queryAllStatusUpdatesForFeature,
	queryArtifactsForFeature,
	queryStatusUpdateById,
} from "../../../../src/agent-tools/work/database.js";
import type {
	StatusUpdateRecord,
	StatusValue,
} from "../../../../src/agent-tools/work/models.js";
import type { V2Project } from "../../types/projects";
import type {
	AgentTask,
	Artifact,
	ArtifactType,
	AttentionData,
	EventType,
	Run,
	RunEvent,
	RunStatus,
	Step,
	StepStatus,
} from "../../types/runs";
import {
	getAllProjects,
	getProject,
	isValidProject,
	loadRegistry,
	type ProjectEntry,
	registerProject,
	removeProject,
} from "../registry";
import {
	type ApiContext,
	buildFileTree,
	errorResponse,
	type FileContent,
	type FileNode,
	getMimeType,
	jsonResponse,
	parseFrontmatter,
	resolveWithArchiveFallback,
	validateFilePath,
} from "./content-utils";

/**
 * Map database StatusValue to frontend RunStatus.
 * started and in_progress both map to running since they represent active execution.
 */
function mapStatusValueToRunStatus(status: StatusValue): RunStatus {
	switch (status) {
		case "started":
		case "in_progress":
			return "running";
		case "waiting-input":
			return "waiting-input";
		case "needs-review":
			return "needs-review";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
	}
}

/**
 * Convert kebab-case feature ID to Title Case display name.
 * @example humanizeFeatureName("auth-refactor") => "Auth Refactor"
 */
function humanizeFeatureName(featureId: string): string {
	return featureId
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

/**
 * Extract command from workflow column or metadata JSON.
 * Prefers the persisted workflow column; falls back to metadata JSON parsing;
 * ultimately defaults to "/build".
 */
function extractCommand(
	metadata: string | null,
	workflow?: string | null,
): string {
	if (workflow) {
		return `/${workflow}`;
	}
	if (!metadata) {
		return "/build";
	}
	try {
		const parsed = JSON.parse(metadata) as Record<string, unknown>;
		if (typeof parsed.command === "string") {
			return parsed.command;
		}
	} catch {
		// Invalid JSON, use default
	}
	return "/build";
}

/**
 * Map a command string (e.g., "/build") to a workflow name (e.g., "build").
 * Returns null for commands that cannot map to a workflow name.
 */
export function commandToWorkflowName(command: string): string | null {
	if (!command || !command.startsWith("/")) return null;
	const name = command.slice(1);
	return name.length > 0 ? name : null;
}

/**
 * Filter out expired status update records (on-read pruning).
 * Records with NULL expires_at are never filtered (backward compat).
 * Records with expires_at in the past are considered stale.
 */
export function filterNonExpiredRecords(
	records: readonly StatusUpdateRecord[],
): readonly StatusUpdateRecord[] {
	const now = new Date().toISOString();
	return records.filter(
		(r) =>
			r.expiresAt === null ||
			r.expiresAt > now ||
			TERMINAL_STATUSES.has(r.status),
	);
}

/**
 * Parse the trailing numeric DB record ID from a composite run ID.
 * The run ID format is `{projectId}-{featureId}-{dbRecordId}`.
 * Since both projectId and featureId may contain hyphens, we extract only
 * the trailing numeric segment.
 *
 * @returns The numeric DB record ID, or null if the format is invalid.
 */
function parseDbRecordId(compositeRunId: string): number | null {
	const lastDash = compositeRunId.lastIndexOf("-");
	if (lastDash === -1) return null;

	const trailing = compositeRunId.slice(lastDash + 1);
	if (!/^\d+$/.test(trailing)) return null;

	return Number.parseInt(trailing, 10);
}

/**
 * Convert a StatusUpdateRecord from the database to a Run type for the frontend.
 * Fields not available in status.db are set to empty arrays or null.
 * Used for list views where full detail is not needed.
 */
function recordToRun(record: StatusUpdateRecord, project: ProjectEntry): Run {
	const status = mapStatusValueToRunStatus(record.status);
	return {
		id: `${project.id}-${record.feature}-${record.id}`,
		projectId: project.id,
		projectName: project.name,
		featureId: record.feature,
		featureName: humanizeFeatureName(record.feature),
		command: extractCommand(record.metadata, record.workflow),
		status,
		currentStep: null,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: record.createdAt,
		completedAt:
			status === "completed" || status === "failed" ? record.createdAt : null,
		error: status === "failed" ? record.message : null,
		agentSteps: null,
	};
}

/**
 * Terminal statuses that indicate a run has finished.
 */
const TERMINAL_STATUSES: ReadonlySet<StatusValue> = new Set([
	"completed",
	"failed",
]);

/**
 * Normalize an artifact path to always be relative to the project root.
 * - Bare filenames → resolve relative to feature's work directory
 * - Absolute paths → strip project prefix to make relative
 * - Already relative → pass through
 */
function normalizeArtifactPath(
	artifactPath: string,
	featureId: string,
	projectPath?: string,
): string {
	if (!artifactPath.includes("/")) {
		return `.rp1/work/features/${featureId}/${artifactPath}`;
	}
	// If it's an absolute path, make it relative to project root
	if (projectPath && artifactPath.startsWith("/")) {
		const prefix = projectPath.endsWith("/") ? projectPath : `${projectPath}/`;
		if (artifactPath.startsWith(prefix)) {
			return artifactPath.slice(prefix.length);
		}
	}
	return artifactPath;
}

/**
 * Discover artifact files from the feature directory on the filesystem.
 * Used as a fallback when no artifacts are registered in the database.
 */
async function discoverArtifactsFromFilesystem(
	projectPath: string,
	featureId: string,
): Promise<readonly Artifact[]> {
	const featureDir = resolve(projectPath, `.rp1/work/features/${featureId}`);
	const archiveDir = resolve(
		projectPath,
		`.rp1/work/archives/features/${featureId}`,
	);

	const { existsSync } = await import("node:fs");
	const dir = existsSync(featureDir)
		? featureDir
		: existsSync(archiveDir)
			? archiveDir
			: null;

	if (!dir) return [];

	const glob = new Bun.Glob("*.md");
	const artifacts: Artifact[] = [];
	const resolvedProjectPath = resolve(projectPath);
	for await (const entry of glob.scan({ cwd: dir })) {
		const relativePath = dir.startsWith(resolvedProjectPath)
			? `${dir.slice(resolvedProjectPath.length + 1)}/${entry}`
			: entry;
		artifacts.push({
			path: relativePath,
			absolutePath: resolve(dir, entry),
			type: "markdown",
			updatedDuringRun: true,
			isNew: false,
			step: null,
		});
	}

	return artifacts;
}

/**
 * Query registered artifacts for a feature from the database.
 * Falls back to filesystem discovery when no DB records exist.
 */
async function getRegisteredArtifacts(
	projectPath: string,
	featureId: string,
): Promise<readonly Artifact[]> {
	const result = await pipe(queryArtifactsForFeature(projectPath, featureId))();

	if (E.isLeft(result) || result.right.length === 0) {
		return discoverArtifactsFromFilesystem(projectPath, featureId);
	}

	return result.right.map((record) => {
		const relativePath = normalizeArtifactPath(
			record.path,
			featureId,
			projectPath,
		);
		return {
			path: relativePath,
			absolutePath: resolve(projectPath, relativePath),
			type: record.type as ArtifactType,
			updatedDuringRun: true,
			isNew: false,
			step: record.step ?? null,
			subflow: record.subflow,
		};
	});
}

/**
 * Read subflow diagram content from disk for subflow artifacts.
 * Returns a map of step ID to Mermaid diagram source.
 * Only reads .mmd files marked as subflow artifacts.
 */
async function getSubflowDiagrams(
	projectPath: string,
	artifacts: readonly Artifact[],
): Promise<Readonly<Record<string, string>>> {
	const subflows: Record<string, string> = {};

	for (const artifact of artifacts) {
		if (!artifact.subflow || !artifact.step) continue;
		if (!artifact.path.endsWith(".mmd")) continue;

		try {
			const filePath = resolve(projectPath, artifact.path);
			const file = Bun.file(filePath);
			if (await file.exists()) {
				subflows[artifact.step] = await file.text();
			}
		} catch {
			// Best-effort: skip unreadable subflow files
		}
	}

	return subflows;
}

/**
 * Map a StatusValue to an EventType for the event stream.
 */
function mapStatusToEventType(status: StatusValue): EventType {
	switch (status) {
		case "started":
			return "step-start";
		case "in_progress":
			return "step-start";
		case "completed":
			return "step-complete";
		case "failed":
			return "error";
		case "waiting-input":
			return "warning";
		case "needs-review":
			return "step-complete";
	}
}

/**
 * Derive RunEvent[] from the full timeline of StatusUpdateRecords.
 * Each status update becomes a RunEvent with appropriate type mapping.
 */
function deriveEvents(
	records: readonly StatusUpdateRecord[],
): readonly RunEvent[] {
	return records.map((record) => {
		const isAgent = record.agent !== null;
		const type: EventType = isAgent
			? "agent-update"
			: mapStatusToEventType(record.status);

		let message: string;
		if (record.message) {
			message = record.message;
		} else if (isAgent) {
			const agentLabel = humanizeFeatureName(record.agent ?? "");
			const taskSuffix = record.task ? ` (${record.task})` : "";
			message = `${agentLabel}${taskSuffix}: ${record.status}`;
		} else {
			message = `${record.step ? `[${record.step}] ` : ""}Status: ${record.status}`;
		}

		return {
			id: `evt-${record.id}`,
			type,
			message,
			timestamp: record.createdAt,
			stepId: record.step ?? null,
			metadata: record.metadata ? parseMetadataSafe(record.metadata) : null,
		};
	});
}

/**
 * Safely parse a JSON metadata string, returning null on failure.
 */
function parseMetadataSafe(
	metadata: string,
): Readonly<Record<string, unknown>> | null {
	try {
		return JSON.parse(metadata) as Record<string, unknown>;
	} catch {
		return null;
	}
}

/**
 * Map a StatusUpdateRecord's status to a StepStatus.
 */
function mapRecordStatusToStepStatus(status: StatusValue): StepStatus {
	switch (status) {
		case "started":
		case "in_progress":
		case "waiting-input":
		case "needs-review":
			return "running";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
	}
}

/**
 * Build a lookup of step-level records grouped by step ID.
 */
function buildStepRecordMap(
	records: readonly StatusUpdateRecord[],
): Map<string, StatusUpdateRecord[]> {
	const stepMap = new Map<string, StatusUpdateRecord[]>();
	for (const record of records) {
		if (!record.step) continue;
		const existing = stepMap.get(record.step);
		if (existing) {
			existing.push(record);
		} else {
			stepMap.set(record.step, [record]);
		}
	}
	return stepMap;
}

/**
 * Derive steps from a state machine definition by merging ordered steps
 * with database records. Steps with DB records get their actual status;
 * steps without records are marked pending.
 *
 * Edge cases:
 * - Stopped mid-workflow: last active step retains its DB status, remaining are pending.
 * - Feature-level "waiting-input"/"needs-review": the last active step reflects that
 *   status as "running" (StepStatus has no waiting/review variant).
 */
export function deriveWorkflowStepsFromMachine(
	records: readonly StatusUpdateRecord[],
	orderedSteps: readonly OrderedStep[],
): readonly Step[] {
	const stepMap = buildStepRecordMap(records);

	const featureLevelRecords = records.filter((r) => !r.step);
	const latestFeatureRecord =
		featureLevelRecords.length > 0
			? featureLevelRecords[featureLevelRecords.length - 1]
			: null;

	let lastActiveIndex = -1;
	for (let i = orderedSteps.length - 1; i >= 0; i--) {
		if (stepMap.has(orderedSteps[i].id)) {
			lastActiveIndex = i;
			break;
		}
	}

	return orderedSteps.map(({ id, label }, index) => {
		const stepRecords = stepMap.get(id);

		if (stepRecords && stepRecords.length > 0) {
			const firstRecord = stepRecords[0];
			const lastRecord = stepRecords[stepRecords.length - 1];

			let stepStatus = mapRecordStatusToStepStatus(lastRecord.status);

			if (
				index === lastActiveIndex &&
				latestFeatureRecord &&
				(latestFeatureRecord.status === "waiting-input" ||
					latestFeatureRecord.status === "needs-review") &&
				stepStatus === "completed"
			) {
				stepStatus = "running";
			}

			const completedAt = TERMINAL_STATUSES.has(lastRecord.status)
				? lastRecord.createdAt
				: null;

			return {
				id,
				name: humanizeFeatureName(label),
				status: stepStatus,
				startedAt: firstRecord.createdAt,
				completedAt,
				taskCount: null,
				completedTaskCount: null,
			};
		}

		return {
			id,
			name: humanizeFeatureName(label),
			status: "pending" as StepStatus,
			startedAt: null,
			completedAt: null,
			taskCount: null,
			completedTaskCount: null,
		};
	});
}

/**
 * Derive steps from records using step-based grouping.
 * Used as fallback when no state machine is available for a workflow.
 */
export function deriveTaskBasedSteps(
	records: readonly StatusUpdateRecord[],
): readonly Step[] {
	const stepMap = buildStepRecordMap(records);
	const steps: Step[] = [];

	for (const [stepId, stepRecords] of stepMap) {
		const firstRecord = stepRecords[0];
		const lastRecord = stepRecords[stepRecords.length - 1];
		const stepStatus = mapRecordStatusToStepStatus(lastRecord.status);
		const completedAt = TERMINAL_STATUSES.has(lastRecord.status)
			? lastRecord.createdAt
			: null;

		steps.push({
			id: stepId,
			name: humanizeFeatureName(stepId),
			status: stepStatus,
			startedAt: firstRecord.createdAt,
			completedAt,
			taskCount: null,
			completedTaskCount: null,
		});
	}

	return steps;
}

/**
 * Derive Step[] from the full timeline of StatusUpdateRecords.
 * Attempts to load a state machine for the command; if found, uses
 * dynamic step derivation from the machine. Otherwise falls back to
 * step-based grouping.
 */
async function deriveSteps(
	records: readonly StatusUpdateRecord[],
	command: string,
): Promise<readonly Step[]> {
	const workflowName = commandToWorkflowName(command);
	if (workflowName) {
		const machineResult = await loadStateMachine(workflowName)();
		if (E.isRight(machineResult)) {
			const machine = machineResult.right;
			const orderedSteps = deriveOrderedSteps(machine);
			return deriveWorkflowStepsFromMachine(records, orderedSteps);
		}
	}

	return deriveTaskBasedSteps(records);
}

/**
 * Derive the overall RunStatus for a workflow with a state machine.
 *
 * A workflow run is "completed" when:
 * - Any terminal state has a completed record, OR
 * - A feature-level "completed" record (no step) exists.
 *
 * A workflow run is "failed" if any record reports failure.
 *
 * Edge cases:
 * - "waiting-input"/"needs-review" feature-level records propagate directly.
 * - Stopped mid-workflow: no completed/failed terminal -> "running".
 */
export function deriveWorkflowRunStatus(
	allRecords: readonly StatusUpdateRecord[],
	machine: StateMachine,
): RunStatus {
	const stepRecordMap = buildStepRecordMap(allRecords);
	const featureLevelRecords = allRecords.filter((r) => !r.step);
	const latestFeatureRecord =
		featureLevelRecords.length > 0
			? featureLevelRecords[featureLevelRecords.length - 1]
			: null;

	const hasFailed = allRecords.some((r) => r.status === "failed");
	if (hasFailed) {
		return "failed";
	}

	if (latestFeatureRecord) {
		if (latestFeatureRecord.status === "waiting-input") {
			return "waiting-input";
		}
		if (latestFeatureRecord.status === "needs-review") {
			return "needs-review";
		}
		if (latestFeatureRecord.status === "completed") {
			return "completed";
		}
	}

	for (const terminalStateId of machine.terminalStates) {
		const terminalRecords = stepRecordMap.get(terminalStateId);
		if (terminalRecords && terminalRecords.length > 0) {
			const lastRecord = terminalRecords[terminalRecords.length - 1];
			if (lastRecord.status === "completed") {
				return "completed";
			}
		}
	}

	return "running";
}

/**
 * Derive the overall RunStatus for a run, dynamically loading the
 * state machine when available. Falls back to latest record status.
 */
async function deriveRunStatus(
	allRecords: readonly StatusUpdateRecord[],
	command: string,
): Promise<RunStatus> {
	const workflowName = commandToWorkflowName(command);
	if (workflowName) {
		const machineResult = await loadStateMachine(workflowName)();
		if (E.isRight(machineResult)) {
			return deriveWorkflowRunStatus(allRecords, machineResult.right);
		}
	}

	// Fallback: use latest record's status
	const latestRecord =
		allRecords.length > 0 ? allRecords[allRecords.length - 1] : null;
	return latestRecord
		? mapStatusValueToRunStatus(latestRecord.status)
		: "running";
}

/**
 * Derive agent steps grouped by step then by task from agent-level records.
 * Returns null when no agent records exist. Steps without agent updates
 * have no entry (no empty arrays).
 */
function deriveAgentSteps(
	agentRecords: readonly StatusUpdateRecord[],
): Readonly<Record<string, readonly AgentTask[]>> | null {
	if (agentRecords.length === 0) return null;

	const stepMap = new Map<string, Map<string, AgentTask>>();

	for (const record of agentRecords) {
		const stepId = record.step;
		if (!stepId) continue;

		let taskMap = stepMap.get(stepId);
		if (!taskMap) {
			taskMap = new Map<string, AgentTask>();
			stepMap.set(stepId, taskMap);
		}

		const taskId = record.task ?? record.agent ?? `agent-${record.id}`;
		const taskName = record.task
			? humanizeFeatureName(record.task)
			: humanizeFeatureName(record.agent ?? "unknown");

		taskMap.set(taskId, {
			id: taskId,
			name: taskName,
			status: record.status,
			agent: record.agent ?? "unknown",
		});
	}

	if (stepMap.size === 0) return null;

	const result: Record<string, readonly AgentTask[]> = {};
	for (const [stepId, taskMap] of stepMap) {
		result[stepId] = Array.from(taskMap.values());
	}

	return result;
}

/**
 * Build a fully-populated Run object for the detail view.
 * Uses the full timeline of status records to derive events, steps,
 * and proper duration timestamps.
 *
 * For workflows with state machines, the overall status is derived from
 * workflow completion rather than the latest DB record's status.
 *
 * All records (skill-level and agent-level) are included in the event
 * stream. Agent events are tagged with type "agent-update" for distinct
 * rendering in the UI.
 */
async function buildDetailedRun(
	record: StatusUpdateRecord,
	allRecords: readonly StatusUpdateRecord[],
	project: ProjectEntry,
	artifacts: readonly Artifact[],
	agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null,
	subflows?: Readonly<Record<string, string>>,
): Promise<Run> {
	const command = extractCommand(record.metadata, record.workflow);

	const skillRecords = allRecords.filter((r) => r.agent === null);

	const events = deriveEvents(allRecords);
	const steps = await deriveSteps(skillRecords, command);
	const status = await deriveRunStatus(skillRecords, command);

	const startedAt =
		skillRecords.length > 0 ? skillRecords[0].createdAt : record.createdAt;

	let completedAt: string | null = null;
	if (status === "completed" || status === "failed") {
		for (let i = skillRecords.length - 1; i >= 0; i--) {
			if (TERMINAL_STATUSES.has(skillRecords[i].status)) {
				completedAt = skillRecords[i].createdAt;
				break;
			}
		}
	}

	let currentStep: string | null = null;
	for (let i = skillRecords.length - 1; i >= 0; i--) {
		if (
			skillRecords[i].step &&
			!TERMINAL_STATUSES.has(skillRecords[i].status)
		) {
			currentStep = skillRecords[i].step;
			break;
		}
	}

	let error: string | null = null;
	if (status === "failed") {
		for (let i = skillRecords.length - 1; i >= 0; i--) {
			if (skillRecords[i].status === "failed" && skillRecords[i].message) {
				error = skillRecords[i].message;
				break;
			}
		}
	}

	return {
		id: `${project.id}-${record.feature}-${record.id}`,
		projectId: project.id,
		projectName: project.name,
		featureId: record.feature,
		featureName: humanizeFeatureName(record.feature),
		command,
		status,
		currentStep,
		steps,
		artifacts,
		events,
		startedAt,
		completedAt,
		error,
		agentSteps,
		subflows:
			subflows && Object.keys(subflows).length > 0 ? subflows : undefined,
	};
}

/**
 * Map RunStatus filter to StatusValue for database query.
 * "running" maps to multiple database states (started, in_progress).
 */
function mapRunStatusToStatusValue(
	runStatus: RunStatus,
): StatusValue | undefined {
	switch (runStatus) {
		case "running":
			// Database query handles started/in_progress via multiple OR conditions
			return undefined;
		case "queued":
			// No direct mapping - queued is not in status.db
			return undefined;
		case "waiting-input":
			return "waiting-input";
		case "needs-review":
			return "needs-review";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
	}
}

/**
 * GET /api/v2/runs - paginated list with filters.
 * Queries status.db for real run data.
 * Filters out stale records (expired via expires_at) before returning.
 */
export async function handleV2RunsListRequest(req: Request): Promise<Response> {
	const url = new URL(req.url);
	const params = url.searchParams;

	const statusFilter = params.get("status") as RunStatus | "all" | null;
	const projectIdFilter = params.get("projectId");
	const limit = Number.parseInt(params.get("limit") ?? "50", 10);
	const offset = Number.parseInt(params.get("offset") ?? "0", 10);
	const dateRange = params.get("dateRange") ?? "all";

	try {
		const projects = await getAllProjects();
		const projectByPath = new Map(projects.map((p) => [p.path, p]));
		const projectById = new Map(projects.map((p) => [p.id, p]));

		let projectPathFilter: string | undefined;
		if (projectIdFilter) {
			const project = projectById.get(projectIdFilter);
			if (project) {
				projectPathFilter = project.path;
			} else {
				return jsonResponse({ runs: [], total: 0 });
			}
		}

		let dbStatusFilter: StatusValue | undefined;
		if (statusFilter && statusFilter !== "all") {
			dbStatusFilter = mapRunStatusToStatusValue(statusFilter);
			// For "running" status, we query without status filter and post-filter
			// For "queued" status, return empty (not in status.db)
			if (statusFilter === "queued") {
				return jsonResponse({ runs: [], total: 0 });
			}
		}

		const result = await pipe(
			queryAllLatestStatuses({
				status: dbStatusFilter,
				projectPath: projectPathFilter,
				// For "running" filter, we need to fetch more and post-filter
				limit: statusFilter === "running" ? undefined : limit,
				offset: statusFilter === "running" ? undefined : offset,
			}),
		)();

		if (E.isLeft(result)) {
			return errorResponse(
				`Database query failed: ${formatError(result.left, false)}`,
			);
		}

		const { records: rawRecords, total: dbTotal } = result.right;

		// Filter out stale records (on-read pruning for expires_at)
		const nonExpiredRecords = filterNonExpiredRecords(rawRecords);

		let runs: Run[] = [];
		for (const record of nonExpiredRecords) {
			const project = projectByPath.get(record.projectPath);
			if (project) {
				runs.push(recordToRun(record, project));
			}
		}

		let total = dbTotal - (rawRecords.length - nonExpiredRecords.length);

		// Post-filter for "running" status (includes both started and in_progress)
		if (statusFilter === "running") {
			runs = runs.filter((r) => r.status === "running");
			total = runs.length;
			runs = runs.slice(offset, offset + limit);
		}

		if (dateRange !== "all") {
			const now = Date.now();
			const ranges: Record<string, number> = {
				today: 24 * 60 * 60 * 1000,
				week: 7 * 24 * 60 * 60 * 1000,
				month: 30 * 24 * 60 * 60 * 1000,
			};
			const range = ranges[dateRange];
			if (range) {
				runs = runs.filter(
					(r) => now - new Date(r.startedAt).getTime() <= range,
				);
				total = runs.length;
			}
		}

		return jsonResponse({ runs, total });
	} catch (error) {
		return errorResponse(`Failed to fetch runs: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/attention - grouped by attention state.
 * Queries status.db for real run data and groups by status category.
 * Filters out stale records (expired via expires_at) before grouping.
 */
export async function handleV2RunsAttentionRequest(): Promise<Response> {
	try {
		const projects = await getAllProjects();
		const projectByPath = new Map(projects.map((p) => [p.path, p]));

		const result = await pipe(queryAllLatestStatuses({}))();

		if (E.isLeft(result)) {
			return errorResponse(
				`Database query failed: ${formatError(result.left, false)}`,
			);
		}

		const { records: rawRecords } = result.right;

		// Filter out stale records (on-read pruning for expires_at)
		const nonExpiredRecords = filterNonExpiredRecords(rawRecords);

		const allRuns: Run[] = [];
		for (const record of nonExpiredRecords) {
			const project = projectByPath.get(record.projectPath);
			if (project) {
				allRuns.push(recordToRun(record, project));
			}
		}

		const attention: AttentionData = {
			waiting: allRuns.filter((r) => r.status === "waiting-input"),
			needsReview: allRuns.filter((r) => r.status === "needs-review"),
			failed: allRuns.filter((r) => r.status === "failed"),
			running: allRuns.filter((r) => r.status === "running"),
		};

		return jsonResponse(attention);
	} catch (error) {
		return errorResponse(`Failed to fetch attention data: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/:id - single run with steps, artifacts, events.
 * Parses the composite run ID to extract the DB record ID,
 * queries the database for the full feature timeline,
 * and returns a fully-populated run with events, steps, artifacts, and duration.
 * Stale records (expired via expires_at) are filtered from the timeline.
 */
export async function handleV2RunDetailRequest(
	runId: string,
): Promise<Response> {
	try {
		const dbRecordId = parseDbRecordId(runId);
		if (dbRecordId === null) {
			return errorResponse(`Invalid run ID format: ${runId}`, 400);
		}

		const result = await pipe(queryStatusUpdateById(dbRecordId))();

		if (E.isLeft(result)) {
			return errorResponse(
				`Database query failed: ${formatError(result.left, false)}`,
			);
		}

		const record = result.right;
		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === record.projectPath);
		if (!project) {
			return errorResponse(`Project not found for run: ${runId}`, 404);
		}

		const timelineResult = await pipe(
			queryAllStatusUpdatesForFeature(record.projectPath, record.feature),
		)();

		const rawRecords = E.isRight(timelineResult)
			? timelineResult.right
			: [record];

		// Filter out stale records (on-read pruning for expires_at)
		const allRecords = filterNonExpiredRecords(rawRecords);

		const artifacts = await getRegisteredArtifacts(
			record.projectPath,
			record.feature,
		);

		let agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null =
			null;
		if (record.runId) {
			const agentResult = await pipe(
				queryAgentUpdatesForRun(
					record.projectPath,
					record.feature,
					record.runId,
				),
			)();
			if (E.isRight(agentResult)) {
				agentSteps = deriveAgentSteps(agentResult.right);
			}
		}

		const subflows = await getSubflowDiagrams(record.projectPath, artifacts);

		const run = await buildDetailedRun(
			record,
			allRecords,
			project,
			artifacts,
			agentSteps,
			subflows,
		);
		return jsonResponse(run);
	} catch (error) {
		return errorResponse(`Failed to fetch run: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/:runId/artifacts/:path - fetch artifact content.
 * Reads the actual file from disk using the project path and artifact path.
 */
export async function handleV2ArtifactContentRequest(
	runId: string,
	artifactPath: string,
): Promise<Response> {
	try {
		const dbRecordId = parseDbRecordId(runId);
		if (dbRecordId === null) {
			return errorResponse(`Invalid run ID format: ${runId}`, 400);
		}

		const result = await pipe(queryStatusUpdateById(dbRecordId))();

		if (E.isLeft(result)) {
			return errorResponse(
				`Database query failed: ${formatError(result.left, false)}`,
			);
		}

		const record = result.right;
		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === record.projectPath);
		if (!project) {
			return errorResponse(`Project not found for run: ${runId}`, 404);
		}

		if (artifactPath.includes("..")) {
			return errorResponse("Invalid artifact path", 400);
		}

		const projectRoot = resolve(project.path);

		// Build candidate paths to try in order
		const candidates: string[] = [];

		// 1. Exact path as given
		candidates.push(resolve(projectRoot, artifactPath));

		// 2. Archive fallback: features/ -> archives/features/, prds/ -> archives/prds/
		const archivablePrefixes = [".rp1/work/features/", ".rp1/work/prds/"];
		for (const prefix of archivablePrefixes) {
			if (artifactPath.startsWith(prefix)) {
				candidates.push(
					resolve(
						projectRoot,
						artifactPath.replace(
							prefix,
							`.rp1/work/archives/${prefix.slice(".rp1/work/".length)}`,
						),
					),
				);
			}
		}

		// 3. Bare filename: resolve relative to feature's work and archive dirs
		if (!artifactPath.includes("/")) {
			const featureId = record.feature;
			candidates.push(
				resolve(projectRoot, `.rp1/work/features/${featureId}/${artifactPath}`),
				resolve(
					projectRoot,
					`.rp1/work/archives/features/${featureId}/${artifactPath}`,
				),
			);
		}

		for (const candidate of candidates) {
			if (!candidate.startsWith(`${projectRoot}/`)) continue;
			if (await Bun.file(candidate).exists()) {
				const content = await Bun.file(candidate).text();
				return jsonResponse({ content });
			}
		}

		return errorResponse(
			`Artifact not found: ${artifactPath}. The file may have been deleted.`,
			404,
		);
	} catch (error) {
		return errorResponse(`Failed to fetch artifact: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects - list registered projects enriched with run statistics.
 * Merges registry data with aggregated run stats from status.db.
 */
export async function handleV2ProjectsListRequest(): Promise<Response> {
	try {
		const projects = await getAllProjects();
		const projectPaths = projects.map((p) => p.path);

		const statsResult = await pipe(getProjectRunStats(projectPaths))();

		const statsMap = E.isRight(statsResult)
			? statsResult.right
			: new Map<string, { runCount: number; lastActivityAt: string | null }>();

		const v2Projects: V2Project[] = projects.map((p) => {
			const stats = statsMap.get(p.path);
			return {
				id: p.id,
				name: p.name,
				path: p.path,
				available: p.available,
				runCount: stats?.runCount ?? 0,
				lastActivityAt: stats?.lastActivityAt ?? null,
			};
		});

		return jsonResponse({ projects: v2Projects });
	} catch (error) {
		return errorResponse(`Failed to load projects: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects/:id - single project enriched with run statistics.
 */
export async function handleV2ProjectDetailRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const statsResult = await pipe(getProjectRunStats([project.path]))();
		const statsMap = E.isRight(statsResult)
			? statsResult.right
			: new Map<string, { runCount: number; lastActivityAt: string | null }>();
		const stats = statsMap.get(project.path);

		const v2Project: V2Project = {
			id: project.id,
			name: project.name,
			path: project.path,
			available: project.available,
			runCount: stats?.runCount ?? 0,
			lastActivityAt: stats?.lastActivityAt ?? null,
		};

		return jsonResponse(v2Project);
	} catch (error) {
		return errorResponse(`Failed to get project: ${String(error)}`);
	}
}

/**
 * GET /api/v2/workflows - list all state-machine-enabled workflows.
 * Returns name, state count, and description for each workflow that
 * has a co-located state.mmd file. Workflows without state.mmd are excluded.
 */
export async function handleV2WorkflowsListRequest(): Promise<Response> {
	try {
		const namesResult = await listWorkflows()();
		if (E.isLeft(namesResult)) {
			return errorResponse(
				`Failed to list workflows: ${formatError(namesResult.left, false)}`,
			);
		}

		const workflowNames = namesResult.right;
		const workflows: {
			name: string;
			stateCount: number;
			description: string | null;
		}[] = [];

		for (const name of workflowNames) {
			const machineResult = await loadStateMachine(name)();
			if (E.isRight(machineResult)) {
				const machine = machineResult.right;
				workflows.push({
					name: machine.id,
					stateCount: machine.states.size,
					description: null,
				});
			}
		}

		return jsonResponse({ workflows });
	} catch (error) {
		return errorResponse(`Failed to list workflows: ${String(error)}`);
	}
}

/**
 * GET /api/v2/workflows/:name - full state machine definition as JSON.
 * Returns states, transitions, and ordered steps for the specified workflow.
 * Returns 404 when no state.mmd exists for the requested workflow.
 */
export async function handleV2WorkflowDetailRequest(
	workflowName: string,
): Promise<Response> {
	try {
		const machineResult = await loadStateMachine(workflowName)();
		if (E.isLeft(machineResult)) {
			return errorResponse(`Workflow not found: ${workflowName}`, 404);
		}

		const machine = machineResult.right;
		const orderedSteps = deriveOrderedSteps(machine);

		const states = Array.from(machine.states.values()).map((s) => ({
			id: s.id,
			label: s.label,
			isInitial: s.isInitial,
			isTerminal: s.isTerminal,
		}));

		const transitions = machine.transitions.map((t) => ({
			sourceId: t.sourceId,
			targetId: t.targetId,
			label: t.label,
		}));

		const steps = orderedSteps.map((s) => ({
			id: s.id,
			label: s.label,
			index: s.index,
		}));

		return jsonResponse({
			name: machine.id,
			states,
			transitions,
			orderedSteps: steps,
		});
	} catch (error) {
		return errorResponse(`Failed to get workflow: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects/:id/files - get file tree for a project.
 * Returns FileNode[] for the project's .rp1/ work and context directories.
 */
export async function handleV2ProjectFilesRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const available = await isValidProject(project.path);
		if (!available) {
			return errorResponse(`Project unavailable: ${projectId}`, 410);
		}

		const rp1Path = join(project.path, ".rp1");
		const sections: FileNode[] = [];

		const workPath = join(rp1Path, "work");
		const workTree = await buildFileTree(workPath, "work");
		if (workTree) {
			sections.push(workTree);
		}

		const contextPath = join(rp1Path, "context");
		const contextTree = await buildFileTree(contextPath, "context");
		if (contextTree) {
			sections.push(contextTree);
		}

		return jsonResponse(sections);
	} catch (error) {
		return errorResponse(`Failed to read file tree: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects/:id/content/* - get file content for a project.
 * Returns FileContent with path, content, mimeType, and optional frontmatter.
 * Uses validateFilePath for security and resolveWithArchiveFallback for archive lookup.
 */
export async function handleV2ProjectContentRequest(
	projectId: string,
	filePath: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const available = await isValidProject(project.path);
		if (!available) {
			return errorResponse(`Project unavailable: ${projectId}`, 410);
		}

		const validationError = validateFilePath(filePath);
		if (validationError) {
			const status = validationError.includes("Access denied") ? 403 : 400;
			return errorResponse(validationError, status);
		}

		const rp1Path = resolve(project.path, ".rp1");

		const resolvedPath = await resolveWithArchiveFallback(rp1Path, filePath);
		if (!resolvedPath) {
			return errorResponse("File not found", 404);
		}

		const content = await Bun.file(resolvedPath).text();
		const mimeType = getMimeType(filePath);

		let frontmatter: Record<string, unknown> | undefined;
		if (extname(filePath) === ".md") {
			const parsed = parseFrontmatter(content);
			frontmatter = parsed.frontmatter;
		}

		const response: FileContent = {
			path: filePath,
			content,
			mimeType,
			frontmatter,
		};

		return jsonResponse(response);
	} catch (error) {
		return errorResponse(`Failed to read file: ${String(error)}`);
	}
}

/**
 * GET /api/v2/health - daemon health check.
 */
export async function handleV2HealthRequest(
	ctx: ApiContext,
): Promise<Response> {
	if (ctx.webUIDir) {
		const indexPath = join(ctx.webUIDir, "client", "index.html");
		const file = Bun.file(indexPath);
		if (!(await file.exists())) {
			return jsonResponse(
				{ status: "starting", reason: "assets not ready" },
				503,
			);
		}
	}

	const registry = await loadRegistry();
	const projectCount = Object.keys(registry.projects).length;
	const uptime = Math.floor((Date.now() - ctx.startTime) / 1000);

	return jsonResponse({
		status: "ok",
		uptime,
		port: ctx.port,
		projectCount,
		...(ctx.version && { version: ctx.version }),
	});
}

/**
 * POST /api/v2/shutdown - graceful daemon shutdown.
 */
export async function handleV2ShutdownRequest(
	ctx: ApiContext,
): Promise<Response> {
	if (ctx.shutdownCallback) {
		setTimeout(() => ctx.shutdownCallback?.(), 100);
	}
	return jsonResponse({ status: "shutting_down" });
}

/**
 * POST /api/v2/status/notify - notify WebSocket clients of a status change.
 * Called by CLI after writing status update to trigger immediate broadcast.
 */
export async function handleV2StatusNotifyRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const body = (await req.json()) as {
			type?: string;
			projectPath?: string;
			feature?: string;
			status?: string;
			workflow?: string;
			runId?: string;
			previousState?: string | null;
			newState?: string;
			stepStatus?: string;
			artifact?: {
				path: string;
				type: string;
				step: string | null;
				runId: string | null;
			};
		};

		if (body.type === "artifact") {
			if (!body.projectPath || !body.feature || !body.artifact) {
				return errorResponse(
					"Missing required fields: projectPath, feature, artifact",
					400,
				);
			}

			const projects = await getAllProjects();
			const project = projects.find((p) => p.path === body.projectPath);

			if (!project) {
				return jsonResponse({
					notified: false,
					reason: "project_not_registered",
				});
			}

			ctx.websocketHub?.broadcastArtifact(
				project.id,
				body.feature,
				body.artifact,
			);

			return jsonResponse({ notified: true, projectId: project.id });
		}

		if (!body.projectPath || !body.feature || !body.status) {
			return errorResponse(
				"Missing required fields: projectPath, feature, status",
				400,
			);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === body.projectPath);

		if (!project) {
			return jsonResponse({
				notified: false,
				reason: "project_not_registered",
			});
		}

		const step = body.newState ?? undefined;
		const runStatus =
			body.workflow && body.status
				? mapNotifyStatusToRunStatus(body.status)
				: undefined;
		const stepStatus = body.stepStatus ?? undefined;

		ctx.websocketHub?.broadcastStatusChange(
			project.id,
			body.feature,
			body.status,
			step,
			runStatus,
			stepStatus,
		);

		return jsonResponse({ notified: true, projectId: project.id });
	} catch (error) {
		return errorResponse(`Failed to process notification: ${String(error)}`);
	}
}

/**
 * Map raw status string to frontend RunStatus for optimistic WebSocket updates.
 */
function mapNotifyStatusToRunStatus(status: string): string {
	switch (status) {
		case "started":
		case "in_progress":
			return "running";
		case "waiting-input":
			return "waiting-input";
		case "needs-review":
			return "needs-review";
		case "completed":
			return "completed";
		case "failed":
			return "failed";
		default:
			return "running";
	}
}

/**
 * POST /api/v2/projects - register a new project.
 */
export async function handleV2ProjectRegisterRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const body = (await req.json()) as { path?: string };

		if (!body.path || typeof body.path !== "string") {
			return errorResponse("Missing required field: path", 400);
		}

		const projectPath = body.path;

		const valid = await isValidProject(projectPath);
		if (!valid) {
			return errorResponse(
				`Invalid project: ${projectPath} does not contain .rp1/ directory`,
				400,
			);
		}

		const project = await registerProject(projectPath);
		ctx.websocketHub?.broadcastProjectsChanged();

		const url = `http://127.0.0.1:${ctx.port}/projects/${project.id}`;

		return jsonResponse({ project, url });
	} catch (error) {
		return errorResponse(`Failed to register project: ${String(error)}`);
	}
}

/**
 * DELETE /api/v2/projects/:id - remove project from registry.
 */
export async function handleV2ProjectDeleteRequest(
	projectId: string,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const removed = await removeProject(projectId);

		if (!removed) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		ctx.websocketHub?.broadcastProjectsChanged();

		return jsonResponse({ removed: true });
	} catch (error) {
		return errorResponse(`Failed to remove project: ${String(error)}`);
	}
}
