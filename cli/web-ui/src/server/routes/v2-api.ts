/**
 * V2 API endpoints for runs and projects.
 * Queries rp1.db (runs, events, artifacts, annotations) via the emit database module.
 *
 * Step derivation uses dynamic state machine loading from co-located
 * state.mmd files. Workflows without state.mmd fall back to step-based
 * grouping from status_change events.
 */

import type { Database } from "bun:sqlite";
import { extname, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import type {
	EventRecord,
	RunRecord,
	Status,
} from "../../../../shared/events.js";
import {
	getLogicalStepDisplayId,
	getLogicalStepKey,
	isNamespacedLifecycleStep,
} from "../../../../shared/index.js";
import type {
	ArtifactRecord,
	StepStatusEntry,
} from "../../../../src/agent-tools/emit/database.js";
import {
	getArtifactsForRun,
	getEmitDatabase,
	getProjectRunStats as getEmitProjectRunStats,
	getEventsForRun,
	getRunById,
	getRunsByAttentionStatus,
	getStepStatuses,
	listRuns,
	resolveArtifactPathForRun,
} from "../../../../src/agent-tools/emit/database.js";
import {
	deriveOrderedSteps,
	listWorkflows,
	loadStateMachine,
} from "../../../../src/agent-tools/state-machine/index.js";
import type { OrderedStep } from "../../../../src/agent-tools/state-machine/models.js";
import type { V2Project } from "../../types/projects";
import type {
	AgentTask,
	Artifact,
	ArtifactType,
	AttentionData,
	Run,
	RunEvent,
	RunStatus,
	Step,
	StepStatus,
} from "../../types/runs";
import {
	getRunDirectories,
	listProjectSectionRoots,
	matchesArtifactDisplayPath,
	type ProjectDirectories,
	resolveArtifactAbsolutePath,
	resolveProjectDirectories,
	resolveProjectSectionFilePath,
	toArtifactDisplayPath,
	toArtifactDisplayPathFromAbsolute,
} from "../project-paths";
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
	validateFilePath,
} from "./content-utils";

/**
 * Acquire the emit database connection.
 * Uses the singleton pattern from getEmitDatabase.
 */
async function getDb(): Promise<Database> {
	const result = await getEmitDatabase()();
	if (E.isLeft(result)) {
		throw new Error(`Database unavailable: ${formatError(result.left, false)}`);
	}
	return result.right;
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
 * Map a command string (e.g., "/build") to a workflow name (e.g., "build").
 * Returns null for commands that cannot map to a workflow name.
 */
export function commandToWorkflowName(command: string): string | null {
	if (!command || !command.startsWith("/")) return null;
	const name = command.slice(1);
	return name.length > 0 ? name : null;
}

/**
 * Safely parse a JSON string, returning null on failure.
 */
function parseJsonSafe(
	json: string | null,
): Readonly<Record<string, unknown>> | null {
	if (!json) return null;
	try {
		return JSON.parse(json) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function getEffectiveLogicalStepEvents(
	events: readonly EventRecord[],
): readonly { logicalStepId: string; event: EventRecord }[] {
	const effectiveEvents: { logicalStepId: string; event: EventRecord }[] = [];
	let activeWorkflowStep: string | null = null;

	for (const event of events) {
		if (event.type !== "status_change" || !event.step) continue;

		const data = parseJsonSafe(event.data);
		const status = data?.status as Status | undefined;
		const logicalStepId =
			isNamespacedLifecycleStep(event.step) && activeWorkflowStep
				? activeWorkflowStep
				: getLogicalStepKey(event.step, event.unit);

		effectiveEvents.push({ logicalStepId, event });

		if (isNamespacedLifecycleStep(event.step) || status == null) {
			continue;
		}

		if (
			status === "running" ||
			status === "waiting" ||
			status === "not_started"
		) {
			activeWorkflowStep = event.step;
		} else if (activeWorkflowStep === event.step) {
			activeWorkflowStep = null;
		}
	}

	return effectiveEvents;
}

/**
 * Normalize an artifact path to always be relative to the project root.
 * - Bare filenames -> resolve relative to feature's work directory
 * - Absolute paths -> strip project prefix to make relative
 * - Already relative -> pass through
 */
function artifactRecordToArtifact(
	record: ArtifactRecord,
	directories: ProjectDirectories,
): Artifact {
	const relativePath = toArtifactDisplayPath(directories, record);
	return {
		docId: record.docId,
		path: relativePath,
		absolutePath: resolveArtifactAbsolutePath(directories, record),
		type: record.type as ArtifactType,
		updatedDuringRun: true,
		isNew: false,
		step: record.step ?? null,
		subflow: record.subflow || undefined,
	};
}

/**
 * Discover artifact files from the feature directory on the filesystem.
 * Used as a fallback when no artifacts are registered in the database.
 */
async function discoverArtifactsFromFilesystem(
	workRoot: string,
	featureId: string,
): Promise<readonly Artifact[]> {
	const featureDir = resolve(workRoot, `features/${featureId}`);
	const archiveDir = resolve(workRoot, `archives/features/${featureId}`);

	const { existsSync } = await import("node:fs");
	const dir = existsSync(featureDir)
		? featureDir
		: existsSync(archiveDir)
			? archiveDir
			: null;

	if (!dir) return [];

	const glob = new Bun.Glob("*.md");
	const artifacts: Artifact[] = [];
	for await (const entry of glob.scan({ cwd: dir })) {
		const relativePath = `work/${dir === featureDir ? `features/${featureId}` : `archives/features/${featureId}`}/${entry}`;
		artifacts.push({
			docId: `fs:${relativePath}`,
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
 * Read subflow diagram content from disk for subflow artifacts.
 * Returns a map of step ID to Mermaid diagram source.
 * Only reads .mmd files marked as subflow artifacts.
 */
async function getSubflowDiagrams(
	artifacts: readonly Artifact[],
	events: readonly EventRecord[],
	directories: ProjectDirectories,
): Promise<Readonly<Record<string, string>>> {
	const subflows: Record<string, string> = {};

	// Source 1: artifact-based subflow diagrams (requires subflow flag on artifact)
	for (const artifact of artifacts) {
		if (!artifact.subflow || !artifact.step) continue;
		if (!artifact.path.endsWith(".mmd")) continue;

		try {
			const file = Bun.file(artifact.absolutePath);
			if (await file.exists()) {
				subflows[artifact.step] = await file.text();
			}
		} catch {
			// Best-effort: skip unreadable subflow files
		}
	}

	// Source 2: derive from subflow_registered events (primary path)
	for (const event of events) {
		if (event.type !== "subflow_registered" || !event.step) continue;
		if (subflows[event.step]) continue; // artifact source takes priority

		const data = parseJsonSafe(event.data);
		const diagram = data?.diagram as string | undefined;
		const path = data?.path as string | undefined;

		if (diagram) {
			subflows[event.step] = diagram;
		} else if (path) {
			try {
				const filePath =
					(await resolveProjectSectionFilePath(directories, path)) ?? path;
				const file = Bun.file(filePath);
				if (await file.exists()) {
					subflows[event.step] = await file.text();
				}
			} catch {
				// Best-effort: skip unreadable files
			}
		}
	}

	return subflows;
}

/**
 * Convert an EventRecord from the emit database to a frontend RunEvent.
 */
function eventRecordToRunEvent(record: EventRecord): RunEvent {
	const data = parseJsonSafe(record.data);
	const message = data?.message as string | undefined;

	let displayMessage: string;
	if (message) {
		displayMessage = message;
	} else if (record.type === "status_change") {
		const status = data?.status as string | undefined;
		const stepLabel = record.step ? humanizeFeatureName(record.step) : "";
		const statusLabel = status
			? status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
			: "Unknown";
		displayMessage = stepLabel
			? `${stepLabel}: ${statusLabel}`
			: `Status: ${statusLabel}`;
	} else if (record.type === "artifact_registered") {
		const path = data?.path as string | undefined;
		displayMessage = `Artifact registered: ${path ?? "unknown"}`;
	} else {
		displayMessage = `Event: ${record.type}`;
	}

	return {
		id: `evt-${record.id}`,
		type: record.type,
		message: displayMessage,
		timestamp: record.createdAt,
		stepId: record.step ?? null,
		metadata: data,
	};
}

/**
 * Derive agent tasks from status_change events that have a unit field.
 * Groups by logical parent step first, then by unit (agent task).
 */
export function deriveAgentSteps(
	events: readonly EventRecord[],
): Readonly<Record<string, readonly AgentTask[]>> | null {
	const effectiveEvents = getEffectiveLogicalStepEvents(events);
	const agentEvents = effectiveEvents.filter(({ event }) => event.unit != null);
	if (agentEvents.length === 0) return null;

	const stepMap = new Map<string, Map<string, AgentTask>>();

	for (const { logicalStepId, event } of agentEvents) {
		const stepId = event.step;
		if (!stepId) continue;
		const logicalParentStepId =
			isNamespacedLifecycleStep(stepId) &&
			logicalStepId !== getLogicalStepKey(stepId, event.unit)
				? logicalStepId
				: getLogicalStepDisplayId(stepId);

		let taskMap = stepMap.get(logicalParentStepId);
		if (!taskMap) {
			taskMap = new Map<string, AgentTask>();
			stepMap.set(logicalParentStepId, taskMap);
		}

		const data = parseJsonSafe(event.data);
		const taskId = event.unit ?? `agent-${event.id}`;
		const status = (data?.status as string) ?? "running";

		taskMap.set(taskId, {
			id: taskId,
			name: humanizeFeatureName(taskId),
			status,
			agent: event.unit ?? "unknown",
		});
	}

	if (stepMap.size === 0) return null;

	const result: Record<string, readonly AgentTask[]> = {};
	for (const [stepId, taskMap] of stepMap) {
		result[stepId] = Array.from(taskMap.values());
	}

	return result;
}

function getLogicalParentStepId(
	logicalStepId: string,
	concreteStep: string | undefined,
): string {
	if (concreteStep) {
		return getLogicalStepDisplayId(concreteStep);
	}

	const logicalUnitSeparator = logicalStepId.indexOf("::");
	return logicalUnitSeparator === -1
		? logicalStepId
		: logicalStepId.slice(0, logicalUnitSeparator);
}

function getLogicalStepName(
	logicalStepId: string,
	concreteStep: string,
): string {
	const displayId = getLogicalStepDisplayId(concreteStep);
	const logicalUnitSeparator = logicalStepId.indexOf("::");
	if (logicalUnitSeparator === -1) {
		return humanizeFeatureName(displayId);
	}

	const unit = logicalStepId.slice(logicalUnitSeparator + 2);
	return `${humanizeFeatureName(displayId)} ${unit}`;
}

function groupEventsByLogicalStep(
	events: readonly EventRecord[],
): Map<string, EventRecord[]> {
	const stepEvents = new Map<string, EventRecord[]>();
	for (const { logicalStepId, event } of getEffectiveLogicalStepEvents(
		events,
	)) {
		const existing = stepEvents.get(logicalStepId);
		if (existing) {
			existing.push(event);
		} else {
			stepEvents.set(logicalStepId, [event]);
		}
	}

	return stepEvents;
}

function toStep(
	stepId: string,
	status: StepStatus,
	events: readonly EventRecord[],
): Step {
	const startedAt = events.length > 0 ? events[0].createdAt : null;
	const completedAt =
		status === "completed" || status === "failed" || status === "skipped"
			? events.length > 0
				? events[events.length - 1].createdAt
				: null
			: null;
	const concreteStep = events[events.length - 1]?.step ?? stepId;

	return {
		id: stepId,
		name: getLogicalStepName(stepId, concreteStep),
		status,
		startedAt,
		completedAt,
		taskCount: null,
		completedTaskCount: null,
	};
}

/**
 * Derive steps from a state machine definition merged with step status data.
 * Steps with status_change events get their actual status;
 * steps without events are marked not_started.
 */
export function deriveStepsFromMachine(
	stepStatuses: readonly StepStatusEntry[],
	orderedSteps: readonly OrderedStep[],
	events: readonly EventRecord[],
): readonly Step[] {
	const statusMap = new Map(stepStatuses.map((s) => [s.step, s.status]));
	const stepEvents = groupEventsByLogicalStep(events);
	const orderedStepIds = new Set(orderedSteps.map((step) => step.id));
	const machineSteps = orderedSteps.map(({ id, label }) => {
		const status: StepStatus = statusMap.get(id) ?? "not_started";
		const evts = stepEvents.get(id) ?? [];
		const derivedStep = toStep(id, status, evts);

		return {
			...derivedStep,
			name: humanizeFeatureName(label),
		};
	});
	const machineParentStepIds = new Set(
		orderedSteps.map(({ id }) => getLogicalParentStepId(id, id)),
	);
	const syntheticSteps = Array.from(stepEvents.entries())
		.filter(([stepId, evts]) => {
			const concreteStep = evts[evts.length - 1]?.step;
			if (!concreteStep || !isNamespacedLifecycleStep(concreteStep)) {
				return false;
			}

			if (orderedStepIds.has(stepId)) return false;

			const parentStepId = getLogicalParentStepId(stepId, concreteStep);
			return !machineParentStepIds.has(parentStepId);
		})
		.sort(([, leftEvents], [, rightEvents]) =>
			leftEvents[0].createdAt.localeCompare(rightEvents[0].createdAt),
		)
		.map(([stepId, evts]) =>
			toStep(stepId, statusMap.get(stepId) ?? "not_started", evts),
		);

	return [...machineSteps, ...syntheticSteps];
}

/**
 * Derive steps from events using step-based grouping.
 * Used as fallback when no state machine is available.
 */
export function deriveStepsFromEvents(
	stepStatuses: readonly StepStatusEntry[],
	events: readonly EventRecord[],
): readonly Step[] {
	const stepEvents = groupEventsByLogicalStep(events);
	const statusMap = new Map(stepStatuses.map((s) => [s.step, s.status]));

	return Array.from(stepEvents.entries()).map(([stepId, evts]) =>
		toStep(stepId, statusMap.get(stepId) ?? "not_started", evts),
	);
}

/**
 * Derive steps by attempting to load a state machine for the workflow,
 * falling back to event-based grouping.
 */
async function deriveSteps(
	stepStatuses: readonly StepStatusEntry[],
	events: readonly EventRecord[],
	command: string,
): Promise<readonly Step[]> {
	const workflowName = commandToWorkflowName(command);
	if (workflowName) {
		const machineResult = await loadStateMachine(workflowName)();
		if (E.isRight(machineResult)) {
			const orderedSteps = deriveOrderedSteps(machineResult.right);
			return deriveStepsFromMachine(stepStatuses, orderedSteps, events);
		}
	}

	return deriveStepsFromEvents(stepStatuses, events);
}

/**
 * Convert a RunRecord to a lightweight Run for list views.
 */
function runRecordToListRun(record: RunRecord, project: ProjectEntry): Run {
	return {
		id: record.id,
		projectId: project.id,
		projectName: project.name,
		featureId: record.featureId,
		featureName: humanizeFeatureName(record.featureId),
		name: record.name ?? null,
		command: `/${record.flow}`,
		status: record.status,
		harness: record.harness,
		currentStep: null,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: record.createdAt,
		completedAt:
			record.status === "completed" || record.status === "failed"
				? record.updatedAt
				: null,
		error: null,
		agentSteps: null,
	};
}

/**
 * Build a fully-populated Run object for the detail view.
 * Derives steps from status_change events, includes artifacts with docId,
 * events from the events table, and annotations from the annotations table.
 */
async function buildDetailedRun(
	db: Database,
	record: RunRecord,
	project: ProjectEntry,
): Promise<Run> {
	const command = `/${record.flow}`;
	const directories = getRunDirectories(record);

	const stepStatuses = getStepStatuses(db, record.id);
	const events = getEventsForRun(db, record.id);
	const artifactRecords = getArtifactsForRun(db, record.id);

	let artifacts: readonly Artifact[];
	if (artifactRecords.length > 0) {
		const deduped = new Map<string, ArtifactRecord>();
		for (const ar of artifactRecords) {
			deduped.set(toArtifactDisplayPath(directories, ar), ar);
		}
		artifacts = [...deduped.values()].map((ar) =>
			artifactRecordToArtifact(ar, directories),
		);
	} else {
		artifacts = await discoverArtifactsFromFilesystem(
			directories.workRoot,
			record.featureId,
		);
	}

	const steps = await deriveSteps(stepStatuses, events, command);
	const runEvents = events.map(eventRecordToRunEvent);
	const agentSteps = deriveAgentSteps(events);
	const subflows = await getSubflowDiagrams(artifacts, events, directories);

	let currentStep: string | null = null;
	for (const step of [...steps].reverse()) {
		if (
			step.status === "running" ||
			step.status === "waiting" ||
			step.status === "not_started"
		) {
			if (step.status !== "not_started") {
				currentStep = step.id;
				break;
			}
		}
	}
	if (!currentStep) {
		for (const step of [...steps].reverse()) {
			if (step.status !== "not_started") {
				currentStep = step.id;
				break;
			}
		}
	}

	let error: string | null = null;
	if (record.status === "failed") {
		for (const event of [...events].reverse()) {
			if (event.type === "status_change") {
				const data = parseJsonSafe(event.data);
				if (data?.status === "failed" && typeof data?.message === "string") {
					error = data.message;
					break;
				}
			}
		}
	}

	return {
		id: record.id,
		projectId: project.id,
		projectName: project.name,
		featureId: record.featureId,
		featureName: humanizeFeatureName(record.featureId),
		name: record.name ?? null,
		command,
		status: record.status,
		harness: record.harness,
		currentStep,
		steps,
		artifacts,
		events: runEvents,
		startedAt: record.createdAt,
		completedAt:
			record.status === "completed" || record.status === "failed"
				? record.updatedAt
				: null,
		error,
		agentSteps,
		subflows:
			subflows && Object.keys(subflows).length > 0 ? subflows : undefined,
	};
}

/**
 * GET /api/v2/runs - paginated list with filters.
 * Queries the runs table in rp1.db for canonical status values.
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
		const db = await getDb();
		const projects = await getAllProjects();
		const projectById = new Map(projects.map((p) => [p.id, p]));
		const projectByPath = new Map(projects.map((p) => [p.path, p]));

		let projectPathFilter: string | undefined;
		if (projectIdFilter) {
			const project = projectById.get(projectIdFilter);
			if (project) {
				projectPathFilter = project.path;
			} else {
				return jsonResponse({ runs: [], total: 0 });
			}
		}

		const dbStatus: Status | undefined =
			statusFilter && statusFilter !== "all"
				? (statusFilter as Status)
				: undefined;

		const knownProjectPaths = [...projectByPath.keys()];

		const result = listRuns(db, {
			projectPath: projectPathFilter,
			projectPaths: projectPathFilter ? undefined : knownProjectPaths,
			status: dbStatus,
			limit,
			offset,
		});

		let runs: Run[] = [];
		for (const record of result.records) {
			const project = projectByPath.get(record.projectPath);
			if (project) {
				runs.push(runRecordToListRun(record, project));
			}
		}

		let total = result.total;

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
 * Queries the runs table grouped by waiting/failed/running canonical statuses.
 */
export async function handleV2RunsAttentionRequest(): Promise<Response> {
	try {
		const db = await getDb();
		const projects = await getAllProjects();
		const projectByPath = new Map(projects.map((p) => [p.path, p]));

		const attentionRuns = getRunsByAttentionStatus(db);

		const toRuns = (records: readonly RunRecord[]): Run[] => {
			const runs: Run[] = [];
			for (const record of records) {
				const project = projectByPath.get(record.projectPath);
				if (project) {
					runs.push(runRecordToListRun(record, project));
				}
			}
			return runs;
		};

		const attention: AttentionData = {
			waiting: toRuns(attentionRuns.waiting),
			failed: toRuns(attentionRuns.failed),
			running: toRuns(attentionRuns.running),
		};

		return jsonResponse(attention);
	} catch (error) {
		return errorResponse(`Failed to fetch attention data: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/:id - single run with steps, artifacts, events.
 * Run ID is a native UUID from the runs table.
 */
export async function handleV2RunDetailRequest(
	runId: string,
): Promise<Response> {
	try {
		const db = await getDb();
		const record = getRunById(db, runId);

		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === record.projectPath);
		if (!project) {
			return errorResponse(`Project not found for run: ${runId}`, 404);
		}

		const run = await buildDetailedRun(db, record, project);
		return jsonResponse(run);
	} catch (error) {
		return errorResponse(`Failed to fetch run: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/:runId/artifacts/:path - fetch artifact content.
 * Reads the actual file from disk using the run's project path.
 */
export async function handleV2ArtifactContentRequest(
	runId: string,
	artifactPath: string,
	apiContext?: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const record = getRunById(db, runId);

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

		const directories = getRunDirectories(record);
		const artifactRecords = getArtifactsForRun(db, runId);
		const artifactRecord = artifactRecords.find((candidate) =>
			matchesArtifactDisplayPath(directories, candidate, artifactPath),
		);

		if (artifactRecord) {
			const resolvedPath = await resolveArtifactPathForRun(
				db,
				record,
				artifactRecord,
			);
			if (resolvedPath) {
				const reconciledPath = toArtifactDisplayPathFromAbsolute(
					directories,
					resolvedPath,
				);
				if (reconciledPath !== artifactPath && apiContext?.websocketHub) {
					const { broadcastPathReconciliation } = await import(
						"./artifacts-api"
					);
					broadcastPathReconciliation(
						apiContext.websocketHub,
						project.id,
						runId,
						record.featureId,
						artifactRecord.docId,
						reconciledPath,
					);
				}

				const content = await Bun.file(resolvedPath).text();
				return jsonResponse({ content });
			}
		}

		const scopedPath = await resolveProjectSectionFilePath(
			directories,
			artifactPath,
		);
		if (scopedPath) {
			const content = await Bun.file(scopedPath).text();
			return jsonResponse({ content });
		}

		if (!artifactPath.includes("/")) {
			const fallbackCandidates = [
				Bun.resolveSync(
					directories.workRoot,
					`features/${record.featureId}/${artifactPath}`,
				),
				Bun.resolveSync(
					directories.workRoot,
					`archives/features/${record.featureId}/${artifactPath}`,
				),
			];
			for (const candidate of fallbackCandidates) {
				if (await Bun.file(candidate).exists()) {
					const content = await Bun.file(candidate).text();
					return jsonResponse({ content });
				}
			}
		}

		// Fallback: doc_id-based reconciliation via artifact DB lookup
		const { resolveArtifactPath, broadcastPathReconciliation } = await import(
			"./artifacts-api"
		);
		const artifactRow = db
			.prepare(
				"SELECT doc_id FROM artifacts WHERE run_id = $runId AND path = $path LIMIT 1",
			)
			.get({ $runId: runId, $path: artifactPath }) as {
			doc_id: string;
		} | null;

		if (artifactRow) {
			const resolvedPath = await resolveArtifactPath(db, directories, {
				docId: artifactRow.doc_id,
				path: artifactPath,
				storageRoot: "work_dir",
			});
			if (resolvedPath) {
				const newRelPath = toArtifactDisplayPathFromAbsolute(
					directories,
					resolvedPath,
				);
				if (newRelPath !== artifactPath) {
					broadcastPathReconciliation(
						apiContext?.websocketHub,
						project.id,
						runId,
						record.featureId,
						artifactRow.doc_id,
						newRelPath,
					);
				}
				const content = await Bun.file(resolvedPath).text();
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
 * Merges registry data with aggregated run stats from rp1.db.
 */
export async function handleV2ProjectsListRequest(): Promise<Response> {
	try {
		const db = await getDb();
		const projects = await getAllProjects();
		const projectPaths = projects.map((p) => p.path);

		const statsMap = getEmitProjectRunStats(db, projectPaths);

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

		const db = await getDb();
		const statsMap = getEmitProjectRunStats(db, [project.path]);
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

		const directories = resolveProjectDirectories(project.path);
		const sections: FileNode[] = [];

		for (const root of listProjectSectionRoots(directories)) {
			const tree = await buildFileTree(root.absolutePath, root.section);
			if (tree) {
				sections.push(tree);
			}
		}

		return jsonResponse(sections);
	} catch (error) {
		return errorResponse(`Failed to read file tree: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects/:id/content/* - get file content for a project.
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

		const directories = resolveProjectDirectories(project.path);
		const resolvedPath = await resolveProjectSectionFilePath(
			directories,
			filePath,
		);
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
 * PUT /api/v2/projects/:projectId/content/:path - save file content to disk.
 * Validates that the path stays within the project's .rp1/ directory.
 */
export async function handleV2ProjectContentSaveRequest(
	projectId: string,
	filePath: string,
	req: Request,
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

		const body = (await req.json()) as { content?: string };

		if (typeof body.content !== "string") {
			return errorResponse(
				"Invalid request body: content is a required string",
				400,
			);
		}

		const directories = resolveProjectDirectories(project.path);
		const resolvedPath = await resolveProjectSectionFilePath(
			directories,
			filePath,
		);

		if (!resolvedPath) {
			return errorResponse("File not found", 404);
		}

		await Bun.write(resolvedPath, body.content);

		return jsonResponse({ saved: true, path: resolvedPath });
	} catch (error) {
		return errorResponse(`Failed to save file: ${String(error)}`);
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
 * POST /api/v2/status/notify - notify WebSocket clients of an event.
 * Accepts only the event envelope format (type: "event") and broadcasts
 * via event:notification. Legacy status_changed and artifact formats
 * are no longer supported.
 */
export async function handleV2StatusNotifyRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			console.warn(
				"[notify] Malformed JSON in status notify request, discarding",
			);
			return errorResponse("Malformed JSON body", 400);
		}

		if (!body || typeof body !== "object") {
			console.warn(
				"[notify] Invalid body in status notify request, discarding",
			);
			return errorResponse("Invalid request body", 400);
		}

		if (body.type !== "event") {
			return errorResponse(
				`Unsupported notification format: expected type "event", received "${String(body.type ?? "none")}". Legacy status_changed and artifact formats are no longer supported; use the event envelope format.`,
				400,
			);
		}

		const eventType = body.eventType as string | undefined;
		const eventId = body.eventId as number | undefined;
		const runId = body.runId as string | undefined;
		const projectPath = body.projectPath as string | undefined;
		const featureId = body.featureId as string | undefined;
		const step = (body.step as string | null) ?? null;
		const data = (body.data as Record<string, unknown> | null) ?? null;
		const createdAt = (body.createdAt as string) ?? new Date().toISOString();

		if (!projectPath || !featureId || !eventType || eventId == null || !runId) {
			console.warn(
				"[notify] Malformed event notification, missing required fields, discarding",
			);
			return errorResponse(
				"Missing required fields for event notification: projectPath, featureId, eventType, eventId, runId",
				400,
			);
		}

		const projects = await getAllProjects();
		const project = projects.find((p) => p.path === projectPath);

		if (!project) {
			return jsonResponse({
				notified: false,
				reason: "project_not_registered",
			});
		}

		ctx.websocketHub?.broadcastEvent(
			project.id,
			eventId,
			eventType,
			runId,
			featureId,
			step,
			data,
			createdAt,
		);

		return jsonResponse({ notified: true, projectId: project.id, eventId });
	} catch (error) {
		console.warn(
			`[notify] Failed to process notification: ${String(error)}, discarding`,
		);
		return errorResponse(`Failed to process notification: ${String(error)}`);
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
