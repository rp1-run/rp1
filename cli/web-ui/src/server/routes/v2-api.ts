/**
 * V2 API endpoints for runs and projects.
 * Queries rp1.db (runs, events, artifacts, annotations) via the emit database module.
 *
 * Step derivation uses dynamic state machine loading from co-located
 * state.mmd files. Workflows without state.mmd fall back to step-based
 * grouping from status_change events.
 */

import type { Database } from "bun:sqlite";
import { basename, extname, join, resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { formatError } from "../../../../shared/errors.js";
import type {
	EventRecord,
	RunRecord,
	Status,
} from "../../../../shared/events.js";
import {
	isTerminalRunStatus,
	isValidStatus,
} from "../../../../shared/events.js";
import {
	getLogicalStepDisplayId,
	getLogicalStepKey,
	isNamespacedLifecycleStep,
} from "../../../../shared/index.js";
import type {
	ArtifactRecord,
	NotificationRecord,
	RunRecordWithLastEvent,
	StepStatusEntry,
} from "../../../../src/agent-tools/emit/database.js";
import {
	endRun,
	getArtifactsForRun,
	getEffectiveStepStatuses,
	getEmitDatabase,
	getProjectRunStats as getEmitProjectRunStats,
	getEventsForRun,
	getRunById,
	getRunsByAttentionStatus,
	getRunWithLastEventById,
	listRuns,
	resolveArtifactPathForRun,
} from "../../../../src/agent-tools/emit/database.js";
import {
	dismissNotification,
	listNotifications,
} from "../../../../src/agent-tools/emit/notification-database.js";
import { maybeGenerateNotification } from "../../../../src/agent-tools/emit/notification-generator.js";
import {
	deriveOrderedSteps,
	listWorkflows,
	loadStateMachine,
} from "../../../../src/agent-tools/state-machine/index.js";
import type { OrderedStep } from "../../../../src/agent-tools/state-machine/models.js";
import {
	buildRuntimeSkillMetadataLookup,
	type InstalledSkillDiscoveryMetadata,
} from "../../../../src/install/verifier.js";
import { logDaemonEvent } from "../../daemon/diagnostics";
import { normalizeActivitySearchTokens } from "../../lib/activity-search-fields";
import {
	getSocraticDuelEventLabel,
	getSocraticDuelOutcomeLabel,
	isSocraticDuelDisplayLabel,
	isSocraticDuelFlow,
} from "../../lib/socratic-duel-status";
import type { V2Project } from "../../types/projects";
import type {
	AgentTask,
	Artifact,
	ArtifactType,
	AttentionData,
	Run,
	RunEvent,
	RunInvocationContext,
	RunStatus,
	Step,
	StepStatus,
} from "../../types/runs";
import {
	type ActivitySearchDateRange,
	searchActivityFeedRuns,
} from "../activity-search";
import {
	detectOrphanedAnnotations,
	getAnnotation as getAnnotationById,
} from "../annotation-service";
import { reclassifyInactiveRunsWithBroadcast } from "../inactive-runs";
import { buildProjectLookup, findProjectByIdentity } from "../project-lookup";
import {
	findArtifactByRequestedPath,
	getRunDirectories,
	listProjectSectionRoots,
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
	getProjectCount,
	isValidProject,
	type ProjectEntry,
	registerProject,
	removeProject,
} from "../registry";
import type { WebSocketHub } from "../websocket";
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
 * Broadcast annotation updates for IDs whose orphaned flag was flipped
 * during orphan detection on the artifact-read path.
 */
function broadcastOrphanFlips(
	db: Database,
	websocketHub: WebSocketHub | undefined,
	flippedIds: string[],
): void {
	if (!websocketHub || flippedIds.length === 0) {
		return;
	}
	for (const id of flippedIds) {
		const annotation = getAnnotationById(db, id);
		if (annotation) {
			websocketHub.broadcastAnnotationUpdated(annotation);
		}
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

let runtimeSkillMetadataLookupPromise: Promise<
	ReadonlyMap<string, InstalledSkillDiscoveryMetadata>
> | null = null;

async function getRuntimeSkillMetadataLookup(): Promise<
	ReadonlyMap<string, InstalledSkillDiscoveryMetadata>
> {
	if (!runtimeSkillMetadataLookupPromise) {
		runtimeSkillMetadataLookupPromise = buildRuntimeSkillMetadataLookup().catch(
			() => {
				runtimeSkillMetadataLookupPromise = null;
				return new Map<string, InstalledSkillDiscoveryMetadata>();
			},
		);
	}

	return runtimeSkillMetadataLookupPromise;
}

export function isActivityTrackedFlow(
	flow: string,
	skillMetadataLookup: ReadonlyMap<
		string,
		Pick<InstalledSkillDiscoveryMetadata, "arcade_tracked">
	>,
): boolean {
	const matchingMetadata = [...skillMetadataLookup.entries()]
		.filter(([canonicalName]) => canonicalName.split(":").at(-1) === flow)
		.map(([, metadata]) => metadata);

	if (matchingMetadata.length === 0) {
		return true;
	}

	return matchingMetadata.some((metadata) => metadata.arcade_tracked !== false);
}

/**
 * Build a fallback ProjectEntry from a RunRecord when the project registry
 * lookup fails. This ensures runs are never silently dropped from the UI.
 */
function fallbackProjectFromRun(record: {
	readonly projectId: string | null;
	readonly rp1ProjectRoot: string;
	readonly projectPath: string;
}): ProjectEntry {
	const path = record.rp1ProjectRoot || record.projectPath;
	return {
		id: record.projectId ?? path,
		projectId: record.projectId ?? undefined,
		path,
		name: basename(path),
		addedAt: new Date().toISOString(),
		lastAccessedAt: new Date().toISOString(),
		available: false,
	};
}

/**
 * Check if a run record originated from an eval workspace.
 * Eval runs use temporary directories and should not appear in the Activity UI.
 */
function isEvalRunRecord(record: {
	readonly rp1ProjectRoot: string;
	readonly projectPath: string;
}): boolean {
	const effectivePath = record.rp1ProjectRoot || record.projectPath;
	return (
		effectivePath.startsWith("/tmp/rp1-evals/") ||
		effectivePath.startsWith("/private/tmp/rp1-evals/")
	);
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

function getRunLevelStatusMessage(
	events: readonly EventRecord[],
	status: Status,
	flow?: string,
): string | null {
	if (flow && isSocraticDuelFlow(flow)) {
		const socraticLabel = getSocraticDuelStatusMessage(events, flow);
		if (socraticLabel) return socraticLabel;
	}

	for (const event of [...events].reverse()) {
		if (event.type !== "status_change" || event.step != null) continue;
		const data = parseJsonSafe(event.data);
		if (data?.status !== status || typeof data?.message !== "string") {
			continue;
		}
		return data.message;
	}

	return null;
}

function getSocraticDuelStatusMessage(
	events: readonly EventRecord[],
	flow: string,
): string | null {
	for (const event of [...events].reverse()) {
		if (event.type !== "status_change") continue;
		const data = parseJsonSafe(event.data);
		const outcomeLabel = getSocraticDuelOutcomeLabel(
			data?.outcome ?? data?.terminal_outcome,
		);
		if (outcomeLabel) return outcomeLabel;
	}

	for (const event of [...events].reverse()) {
		if (event.type !== "status_change") continue;
		const label = getSocraticDuelEventLabel(
			flow,
			event.step,
			parseJsonSafe(event.data),
		);
		if (label) return label;
	}

	return null;
}

function getListRunStatusMessage(
	db: Database,
	record: RunRecord,
): string | null {
	if (!isSocraticDuelFlow(record.flow)) return null;

	const label = getSocraticDuelStatusMessage(
		getEventsForRun(db, record.id),
		record.flow,
	);
	return isSocraticDuelDisplayLabel(label) ? label : null;
}

function getCurrentStepFromStepStatuses(
	stepStatuses: readonly StepStatusEntry[],
): string | null {
	for (const step of [...stepStatuses].reverse()) {
		if (step.status === "running" || step.status === "waiting") {
			return step.step;
		}
	}

	for (const step of [...stepStatuses].reverse()) {
		if (step.status !== "not_started") {
			return step.step;
		}
	}

	return null;
}

function getListRunCurrentStep(db: Database, record: RunRecord): string | null {
	return getCurrentStepFromStepStatuses(
		getEffectiveStepStatuses(db, record.id),
	);
}

function asObject(value: unknown): Readonly<Record<string, unknown>> | null {
	return typeof value === "object" && value !== null && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function isRunInvocationPolicy(
	value: unknown,
): value is RunInvocationContext["runPolicy"] {
	return value === "fresh" || value === "resumable";
}

function isRunInvocationDecision(
	value: unknown,
): value is RunInvocationContext["decision"] {
	return (
		value === "created_new_run" ||
		value === "matched_non_terminal_run" ||
		value === "legacy_backfill_resume"
	);
}

function isSensitiveInvocationKey(key: string): boolean {
	const normalized = key.toLowerCase();
	return (
		normalized.includes("token") ||
		normalized.includes("secret") ||
		normalized.includes("password") ||
		normalized.includes("passwd") ||
		normalized.includes("credential") ||
		normalized.includes("auth") ||
		normalized.includes("cookie") ||
		normalized.includes("session") ||
		normalized.includes("api_key") ||
		normalized.includes("api-key")
	);
}

function sanitizeInvocationIdentityValues(
	identityArgs: readonly string[],
	rawIdentityValues: unknown,
): Readonly<Record<string, string | boolean>> | undefined {
	const identityValues = asObject(rawIdentityValues);
	if (!identityValues) return undefined;

	const sanitized = Object.fromEntries(
		identityArgs.flatMap((argName) => {
			const value = identityValues[argName];
			if (typeof value !== "string" && typeof value !== "boolean") {
				return [];
			}

			return [
				[
					argName,
					typeof value === "string" && isSensitiveInvocationKey(argName)
						? "[redacted]"
						: value,
				],
			];
		}),
	) as Record<string, string | boolean>;

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function sanitizeInvocationArguments(
	rawArguments: unknown,
): Readonly<Record<string, string | boolean>> | undefined {
	const args = asObject(rawArguments);
	if (!args) return undefined;

	const sanitized = Object.fromEntries(
		Object.entries(args).flatMap(([key, value]) => {
			if (typeof value !== "string" && typeof value !== "boolean") {
				return [];
			}

			return [
				[
					key,
					typeof value === "string" && isSensitiveInvocationKey(key)
						? "[redacted]"
						: value,
				],
			];
		}),
	) as Record<string, string | boolean>;

	return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

function buildDisplayWorkIdentity(
	identityArgs: readonly string[],
	identityValues: Readonly<Record<string, string | boolean>> | undefined,
	rawWorkIdentity: unknown,
): string | undefined {
	if (identityArgs.length === 0) return undefined;

	if (
		identityValues &&
		identityArgs.every((argName) => identityValues[argName] !== undefined)
	) {
		return identityArgs
			.map((argName) => `${argName}=${String(identityValues[argName])}`)
			.join("|");
	}

	return typeof rawWorkIdentity === "string" &&
		rawWorkIdentity.length > 0 &&
		identityArgs.every((argName) => !isSensitiveInvocationKey(argName))
		? rawWorkIdentity
		: undefined;
}

function parseRunInvocationContext(
	record: RunRecord,
): RunInvocationContext | undefined {
	const bootstrapContext = parseJsonSafe(record.bootstrapContext);
	if (!bootstrapContext) return undefined;

	const workflow = asObject(bootstrapContext.workflow);
	const directories = asObject(bootstrapContext.directories);
	const trace = asObject(bootstrapContext.trace);
	const run = asObject(bootstrapContext.run);

	if (!workflow || !trace || !run) {
		return undefined;
	}

	const workflowName =
		typeof workflow.name === "string" && workflow.name.length > 0
			? workflow.name
			: null;
	const runPolicy = workflow.runPolicy;
	const decision = run.decision;
	const identityArgs =
		Array.isArray(workflow.identityArgs) &&
		workflow.identityArgs.every((value) => typeof value === "string")
			? workflow.identityArgs
			: [];

	if (
		!workflowName ||
		!isRunInvocationPolicy(runPolicy) ||
		!isRunInvocationDecision(decision)
	) {
		return undefined;
	}

	const canonicalProjectRoot =
		typeof trace.canonicalProjectRoot === "string" &&
		trace.canonicalProjectRoot.length > 0
			? trace.canonicalProjectRoot
			: typeof directories?.projectRoot === "string" &&
					directories.projectRoot.length > 0
				? directories.projectRoot
				: record.rp1ProjectRoot;

	const requestedProjectRoot =
		typeof trace.requestedProjectRoot === "string" &&
		trace.requestedProjectRoot.length > 0
			? trace.requestedProjectRoot
			: canonicalProjectRoot;

	const identityValues = sanitizeInvocationIdentityValues(
		identityArgs,
		trace.identityValues,
	);
	const workIdentity = buildDisplayWorkIdentity(
		identityArgs,
		identityValues,
		trace.workIdentity,
	);
	const worktreeName =
		typeof trace.worktreeName === "string" && trace.worktreeName.length > 0
			? trace.worktreeName
			: undefined;
	const harness =
		typeof trace.harness === "string" && trace.harness.length > 0
			? trace.harness
			: record.harness;
	const sanitizedArguments = sanitizeInvocationArguments(
		bootstrapContext.arguments,
	);

	return {
		workflowName,
		runPolicy,
		decision,
		projectIdentity:
			typeof trace.projectIdentity === "string" &&
			trace.projectIdentity.length > 0
				? trace.projectIdentity
				: (record.projectId ?? record.rp1ProjectRoot),
		canonicalProjectRoot,
		requestedProjectRoot,
		isWorktree: trace.isWorktree === true,
		...(worktreeName ? { worktreeName } : {}),
		...(workIdentity ? { workIdentity } : {}),
		...(identityValues ? { identityValues } : {}),
		...(harness ? { harness } : {}),
		...(sanitizedArguments ? { arguments: sanitizedArguments } : {}),
	};
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
		const relativePath = `.rp1/work/${dir === featureDir ? `features/${featureId}` : `archives/features/${featureId}`}/${entry}`;
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
 * Extract the best Mermaid fenced code block from markdown content.
 * Prefers blocks under "Task Subflow" or "Execution Flow" headings
 * (case-insensitive, within 3 lines above the opening fence).
 * Falls back to the first Mermaid block if no heading match is found.
 * Returns null when no Mermaid blocks exist.
 */
export function extractMermaidFromMarkdown(content: string): string | null {
	if (!content) return null;

	const lines = content.split("\n");
	const blocks: { content: string; headingMatch: boolean }[] = [];

	let inFence = false;
	let fenceStart = -1;
	let blockLines: string[] = [];

	for (let i = 0; i < lines.length; i++) {
		const trimmed = lines[i].trimStart();

		if (!inFence) {
			if (trimmed.startsWith("```mermaid")) {
				inFence = true;
				fenceStart = i;
				blockLines = [];
			}
		} else {
			if (trimmed.startsWith("```")) {
				const blockContent = blockLines.join("\n").trim();
				if (blockContent.length > 0) {
					const headingMatch = hasMatchingHeading(lines, fenceStart);
					blocks.push({ content: blockContent, headingMatch });
				}
				inFence = false;
				blockLines = [];
			} else {
				blockLines.push(lines[i]);
			}
		}
	}

	if (blocks.length === 0) return null;

	const preferred = blocks.find((b) => b.headingMatch);
	return preferred ? preferred.content : blocks[0].content;
}

function hasMatchingHeading(lines: string[], fenceIndex: number): boolean {
	const headingPattern = /task\s+subflow|execution\s+flow/i;
	const searchStart = Math.max(0, fenceIndex - 3);
	for (let i = searchStart; i < fenceIndex; i++) {
		const trimmed = lines[i].trimStart();
		if (trimmed.startsWith("#") || trimmed.startsWith("**")) {
			if (headingPattern.test(trimmed)) return true;
		}
	}
	return false;
}

/**
 * Read subflow diagram content from disk for subflow artifacts.
 * Returns a map of step ID to Mermaid diagram source.
 * Reads .mmd files directly and extracts Mermaid from markdown artifacts.
 */
async function getSubflowDiagrams(
	artifacts: readonly Artifact[],
	events: readonly EventRecord[],
	directories: ProjectDirectories,
): Promise<Readonly<Record<string, string>>> {
	const subflows: Record<string, string> = {};

	for (const artifact of artifacts) {
		if (!artifact.subflow || !artifact.step) continue;

		try {
			const file = Bun.file(artifact.absolutePath);
			if (await file.exists()) {
				if (artifact.path.endsWith(".mmd")) {
					subflows[artifact.step] = await file.text();
				} else {
					const content = await file.text();
					const mermaid = extractMermaidFromMarkdown(content);
					if (mermaid) subflows[artifact.step] = mermaid;
				}
			}
		} catch {
			// Best-effort: skip unreadable subflow files
		}
	}

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
		const agentName = isNamespacedLifecycleStep(stepId)
			? getLogicalStepDisplayId(stepId)
			: stepId;
		const compositeKey = `${agentName}:${taskId}`;
		const status = (data?.status as string) ?? "running";

		taskMap.set(compositeKey, {
			id: taskId,
			name: humanizeFeatureName(taskId),
			status,
			agent: agentName,
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
function runRecordToListRun(
	record: RunRecordWithLastEvent,
	project: ProjectEntry,
	statusMessage: string | null = null,
	currentStep: string | null = null,
): Run {
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
		currentStep,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: record.createdAt,
		lastEventAt: record.lastEventAt ?? record.createdAt,
		completedAt: isTerminalRunStatus(record.status) ? record.updatedAt : null,
		error: null,
		statusMessage,
		agentSteps: null,
	};
}

type NotificationAttentionLevel = "action_required" | "attention" | "info";

interface NotificationListItem {
	readonly id: number;
	readonly message: string;
	readonly sourceType: NotificationRecord["sourceType"];
	readonly sourceId: string | null;
	readonly route: string | null;
	readonly projectId: string | null;
	readonly createdAt: string;
	readonly harness: string | null;
	readonly runCommand: string | null;
	readonly runName: string | null;
	readonly projectName: string | null;
	readonly attentionLevel: NotificationAttentionLevel;
}

interface NotificationsSummary {
	readonly totalCount: number;
	readonly actionRequiredCount: number;
	readonly attentionCount: number;
	readonly informationalCount: number;
}

interface NotificationsListResponse {
	readonly notifications: readonly NotificationListItem[];
	readonly total: number;
	readonly summary: NotificationsSummary;
}

function deriveNotificationAttentionLevel(
	notification: Pick<NotificationRecord, "sourceType" | "message">,
): NotificationAttentionLevel {
	if (notification.sourceType === "agent") {
		return "action_required";
	}

	if (
		notification.sourceType === "run" &&
		notification.message.endsWith(" failed")
	) {
		return "attention";
	}

	return "info";
}

function resolveNotificationProjectName(
	projectLookup: ReturnType<typeof buildProjectLookup>,
	projectId: string | null,
): string | null {
	if (!projectId) {
		return null;
	}

	return projectLookup.byId.get(projectId)?.name ?? null;
}

function notificationRecordToListItem(
	db: Database,
	projectLookup: ReturnType<typeof buildProjectLookup>,
	notification: NotificationRecord,
): NotificationListItem {
	let harness: string | null = null;
	let runCommand: string | null = null;
	let runName: string | null = null;
	let projectName: string | null = resolveNotificationProjectName(
		projectLookup,
		notification.projectId,
	);

	if (notification.sourceId) {
		const run = getRunById(db, notification.sourceId);
		if (run) {
			harness = run.harness;
			runCommand = `/${run.flow}`;
			runName = run.name ?? null;
			const project =
				findProjectByIdentity(projectLookup, run) ??
				fallbackProjectFromRun(run);
			projectName = project.name;
		}
	}

	return {
		id: notification.id,
		message: notification.message,
		sourceType: notification.sourceType,
		sourceId: notification.sourceId,
		route: notification.route,
		projectId: notification.projectId,
		createdAt: notification.createdAt,
		harness,
		runCommand,
		runName,
		projectName,
		attentionLevel: deriveNotificationAttentionLevel(notification),
	};
}

function summarizeNotifications(
	notifications: readonly Pick<NotificationRecord, "sourceType" | "message">[],
): NotificationsSummary {
	let actionRequiredCount = 0;
	let attentionCount = 0;
	let informationalCount = 0;

	for (const notification of notifications) {
		switch (deriveNotificationAttentionLevel(notification)) {
			case "action_required":
				actionRequiredCount += 1;
				break;
			case "attention":
				attentionCount += 1;
				break;
			case "info":
				informationalCount += 1;
				break;
		}
	}

	return {
		totalCount: notifications.length,
		actionRequiredCount,
		attentionCount,
		informationalCount,
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

	const stepStatuses = getEffectiveStepStatuses(db, record.id);
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
	const statusMessage = getRunLevelStatusMessage(
		events,
		record.status,
		record.flow,
	);

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
		lastEventAt: events[events.length - 1]?.createdAt ?? record.createdAt,
		completedAt: isTerminalRunStatus(record.status) ? record.updatedAt : null,
		error,
		statusMessage,
		agentSteps,
		invocation: parseRunInvocationContext(record),
		subflows:
			subflows && Object.keys(subflows).length > 0 ? subflows : undefined,
	};
}

/**
 * GET /api/v2/runs - paginated list with filters.
 * Queries the runs table in rp1.db for canonical status values.
 */
export async function handleV2RunsListRequest(
	req: Request,
	ctx?: ApiContext,
): Promise<Response> {
	const url = new URL(req.url);
	const params = url.searchParams;

	const statusFilter = params.get("status") as RunStatus | "all" | null;
	const projectIdFilter = params.get("projectId");
	const projectUuidFilter = params.get("project_id");
	const limit = Number.parseInt(params.get("limit") ?? "50", 10);
	const offset = Number.parseInt(params.get("offset") ?? "0", 10);
	const dateRange = params.get("dateRange") ?? "all";

	try {
		const db = await getDb();
		await reclassifyInactiveRunsWithBroadcast(db, ctx?.websocketHub);
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);

		let projectPathFilter: string | undefined;
		let dbProjectIdFilter: string | undefined;

		if (projectUuidFilter) {
			dbProjectIdFilter = projectUuidFilter;
		} else if (projectIdFilter) {
			const project = findProjectByIdentity(projectLookup, {
				projectId: projectIdFilter,
			});
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

		const result = listRuns(db, {
			projectId: dbProjectIdFilter,
			projectPath: dbProjectIdFilter ? undefined : projectPathFilter,
			status: dbStatus,
			excludeBootstrapOnly: true,
			limit,
			offset,
		});

		let runs: Run[] = [];
		for (const record of result.records) {
			if (isEvalRunRecord(record)) continue;
			const project =
				findProjectByIdentity(projectLookup, record) ??
				fallbackProjectFromRun(record);
			runs.push(
				runRecordToListRun(
					record,
					project,
					getListRunStatusMessage(db, record),
					getListRunCurrentStep(db, record),
				),
			);
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
					(r) =>
						now - new Date(r.lastEventAt ?? r.startedAt).getTime() <= range,
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
export async function handleV2RunsAttentionRequest(
	ctx?: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		await reclassifyInactiveRunsWithBroadcast(db, ctx?.websocketHub);
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);

		const attentionRuns = getRunsByAttentionStatus(db);

		const toRuns = (records: readonly RunRecordWithLastEvent[]): Run[] => {
			const runs: Run[] = [];
			for (const record of records) {
				const project =
					findProjectByIdentity(projectLookup, record) ??
					fallbackProjectFromRun(record);
				runs.push(
					runRecordToListRun(
						record,
						project,
						getListRunStatusMessage(db, record),
						getListRunCurrentStep(db, record),
					),
				);
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
 * GET /api/v2/runs/:id/summary - lightweight list-view run shape for targeted hydration.
 * Run ID is a native UUID from the runs table.
 */
export async function handleV2RunSummaryRequest(
	runId: string,
	ctx?: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		await reclassifyInactiveRunsWithBroadcast(db, ctx?.websocketHub);
		const record = getRunWithLastEventById(db, runId);

		if (!record || isEvalRunRecord(record)) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const project =
			findProjectByIdentity(projectLookup, record) ??
			fallbackProjectFromRun(record);

		return jsonResponse(
			runRecordToListRun(
				record,
				project,
				getListRunStatusMessage(db, record),
				getListRunCurrentStep(db, record),
			),
		);
	} catch (error) {
		return errorResponse(`Failed to fetch run summary: ${String(error)}`);
	}
}

/**
 * GET /api/v2/runs/:id - single run with steps, artifacts, events.
 * Run ID is a native UUID from the runs table.
 */
export async function handleV2RunDetailRequest(
	runId: string,
	ctx?: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		await reclassifyInactiveRunsWithBroadcast(db, ctx?.websocketHub);
		const record = getRunById(db, runId);

		if (!record) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const project =
			findProjectByIdentity(projectLookup, record) ??
			fallbackProjectFromRun(record);

		const run = await buildDetailedRun(db, record, project);
		return jsonResponse(run);
	} catch (error) {
		return errorResponse(`Failed to fetch run: ${String(error)}`);
	}
}

/**
 * POST /api/v2/runs/:id/end - intentionally stop a live run.
 */
export async function handleV2RunEndRequest(
	runId: string,
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		let body: { outcome?: string; reason?: string };
		try {
			body = (await req.json()) as { outcome?: string; reason?: string };
		} catch {
			return errorResponse("Malformed JSON body", 400);
		}

		if (body.outcome !== "cancelled" && body.outcome !== "abandoned") {
			return errorResponse(
				'Missing or invalid "outcome": expected "cancelled" or "abandoned"',
				400,
			);
		}

		if (body.reason !== undefined && typeof body.reason !== "string") {
			return errorResponse('Invalid "reason": expected string', 400);
		}

		const outcome = body.outcome;
		const reason =
			typeof body.reason === "string" && body.reason.trim().length > 0
				? body.reason.trim()
				: undefined;
		const db = await getDb();
		const existingRun = getRunById(db, runId);
		if (!existingRun) {
			return errorResponse(`Run not found: ${runId}`, 404);
		}

		if (isTerminalRunStatus(existingRun.status)) {
			return errorResponse(
				`Run "${runId}" is already terminal (${existingRun.status}) and cannot be ended again`,
				409,
			);
		}

		const result = endRun(db, {
			runId,
			outcome,
			message: reason,
			actor: "user",
		});

		if (E.isLeft(result)) {
			return errorResponse(formatError(result.left, false), 400);
		}

		const { event, run, runStatus } = result.right;
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const project =
			findProjectByIdentity(projectLookup, run) ?? fallbackProjectFromRun(run);

		const eventData: Record<string, unknown> = {
			status: outcome,
			actor: "user",
			source: "manual_end",
		};
		if (reason) {
			eventData.message = reason;
		}

		const notification = maybeGenerateNotification(
			db,
			run.id,
			runStatus,
			"status_change",
			run.projectId,
			run.flow !== "unknown" ? run.flow : null,
			null,
			eventData,
		);

		ctx.websocketHub?.broadcastEvent(
			project.id,
			event.id,
			"status_change",
			run.id,
			run.featureId,
			runStatus,
			null,
			null,
			eventData,
			event.createdAt,
		);

		if (notification) {
			ctx.websocketHub?.broadcastNotificationCreated(notification);
		}

		return jsonResponse({
			runId: run.id,
			eventId: event.id,
			runStatus,
			...(notification ? { notificationId: notification.id } : {}),
		});
	} catch (error) {
		return errorResponse(`Failed to end run: ${String(error)}`);
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

		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const project =
			findProjectByIdentity(projectLookup, record) ??
			fallbackProjectFromRun(record);

		if (artifactPath.includes("..")) {
			return errorResponse("Invalid artifact path", 400);
		}

		const directories = getRunDirectories(record);
		const artifactRecords = getArtifactsForRun(db, runId);
		const artifactRecord = findArtifactByRequestedPath(
			directories,
			artifactRecords,
			artifactPath,
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
				const flippedIds = detectOrphanedAnnotations(
					db,
					artifactRecord.docId,
					content,
				);
				broadcastOrphanFlips(db, apiContext?.websocketHub, flippedIds);
				return jsonResponse({ content });
			}
		}

		const scopedPath = await resolveProjectSectionFilePath(
			directories,
			artifactPath,
		);
		if (scopedPath) {
			const content = await Bun.file(scopedPath).text();
			if (artifactRecord) {
				const flippedIds = detectOrphanedAnnotations(
					db,
					artifactRecord.docId,
					content,
				);
				broadcastOrphanFlips(db, apiContext?.websocketHub, flippedIds);
			}
			return jsonResponse({ content });
		}

		if (!artifactPath.includes("/")) {
			const fallbackCandidates = [
				resolve(
					directories.workRoot,
					`features/${record.featureId}/${artifactPath}`,
				),
				resolve(
					directories.workRoot,
					`archives/features/${record.featureId}/${artifactPath}`,
				),
			];
			for (const candidate of fallbackCandidates) {
				if (await Bun.file(candidate).exists()) {
					const content = await Bun.file(candidate).text();
					if (artifactRecord) {
						const flippedIds = detectOrphanedAnnotations(
							db,
							artifactRecord.docId,
							content,
						);
						broadcastOrphanFlips(db, apiContext?.websocketHub, flippedIds);
					}
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
				const flippedIds = detectOrphanedAnnotations(
					db,
					artifactRow.doc_id,
					content,
				);
				broadcastOrphanFlips(db, apiContext?.websocketHub, flippedIds);
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
		const projects = await getAllProjects(db);
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

		v2Projects.sort((a, b) => {
			if (!a.lastActivityAt && !b.lastActivityAt) return 0;
			if (!a.lastActivityAt) return 1;
			if (!b.lastActivityAt) return -1;
			return b.lastActivityAt.localeCompare(a.lastActivityAt);
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
		const db = await getDb();
		const project = await getProject(db, projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

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
		const db = await getDb();
		const project = await getProject(db, projectId);

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
			const tree = await buildFileTree(root.absolutePath, root.displayPath);
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
		const db = await getDb();
		const project = await getProject(db, projectId);

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
		const db = await getDb();
		const project = await getProject(db, projectId);

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

	const db = await getDb();
	const projectCount = await getProjectCount(db);
	const uptime = Math.floor((Date.now() - ctx.startTime) / 1000);

	return jsonResponse({
		status: "ok",
		uptime,
		port: ctx.port,
		projectCount,
		isDev: ctx.isDev ?? false,
		...(ctx.version && { version: ctx.version }),
	});
}

/**
 * POST /api/v2/shutdown - graceful daemon shutdown.
 */
export async function handleV2ShutdownRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	logDaemonEvent("shutdown_endpoint_hit", {
		userAgent: req.headers.get("user-agent") ?? "",
	});
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
		const projectId = body.projectId as string | undefined;
		const rp1ProjectRoot = body.rp1ProjectRoot as string | undefined;
		const projectPath = body.projectPath as string | undefined;
		const featureId = body.featureId as string | undefined;
		const runStatus =
			typeof body.runStatus === "string" && isValidStatus(body.runStatus)
				? body.runStatus
				: undefined;
		const step = (body.step as string | null) ?? null;
		const unit = (body.unit as string | null) ?? null;
		const data = (body.data as Record<string, unknown> | null) ?? null;
		const createdAt = (body.createdAt as string) ?? new Date().toISOString();

		if (
			!featureId ||
			!eventType ||
			eventId == null ||
			!runId ||
			(!projectId && !rp1ProjectRoot && !projectPath)
		) {
			console.warn(
				"[notify] Malformed event notification, missing required fields, discarding",
			);
			return errorResponse(
				"Missing required fields for event notification: featureId, eventType, eventId, runId, and one of projectId, rp1ProjectRoot, or projectPath",
				400,
			);
		}

		const db = await getDb();
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const project = findProjectByIdentity(projectLookup, {
			projectId,
			rp1ProjectRoot,
			projectPath,
		});

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
			runStatus ?? null,
			step,
			unit,
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

		const db = await getDb();
		const project = await registerProject(db, projectPath);
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
		const db = await getDb();
		const removed = await removeProject(db, projectId);

		if (!removed) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		ctx.websocketHub?.broadcastProjectsChanged();

		return jsonResponse({ removed: true });
	} catch (error) {
		return errorResponse(`Failed to remove project: ${String(error)}`);
	}
}

/**
 * GET /api/v2/notifications - list non-dismissed notifications with pagination.
 */
export async function handleV2NotificationsListRequest(
	req: Request,
): Promise<Response> {
	try {
		const url = new URL(req.url);
		const params = url.searchParams;
		const projectId = params.get("projectId") ?? undefined;
		const limit = Number.parseInt(params.get("limit") ?? "50", 10);
		const offset = Number.parseInt(params.get("offset") ?? "0", 10);

		const db = await getDb();
		const result = listNotifications(db, { projectId, limit, offset });
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);

		const summaryRecords =
			offset > 0 || result.notifications.length < result.total
				? listNotifications(db, {
						projectId,
						limit: Math.max(result.total, 1),
						offset: 0,
					}).notifications
				: result.notifications;

		const response: NotificationsListResponse = {
			notifications: result.notifications.map((notification) =>
				notificationRecordToListItem(db, projectLookup, notification),
			),
			total: result.total,
			summary: summarizeNotifications(summaryRecords),
		};

		return jsonResponse(response);
	} catch (error) {
		return errorResponse(`Failed to fetch notifications: ${String(error)}`);
	}
}

/**
 * POST /api/v2/notifications/:id/dismiss - soft-delete a notification.
 * Broadcasts notification:dismissed via WebSocket.
 */
export async function handleV2NotificationDismissRequest(
	notificationId: number,
	ctx: ApiContext,
): Promise<Response> {
	try {
		const db = await getDb();
		const dismissed = dismissNotification(db, notificationId);

		if (!dismissed) {
			return errorResponse(
				`Notification not found or already dismissed: ${notificationId}`,
				404,
			);
		}

		ctx.websocketHub?.broadcastNotificationDismissed(notificationId);

		return jsonResponse({ dismissed: true });
	} catch (error) {
		return errorResponse(`Failed to dismiss notification: ${String(error)}`);
	}
}

/**
 * POST /api/v2/notifications/notify - receive notification from CLI emit pipeline.
 * Broadcasts via WebSocket hub for real-time delivery.
 */
export async function handleV2NotificationNotifyRequest(
	req: Request,
	ctx: ApiContext,
): Promise<Response> {
	try {
		let body: Record<string, unknown>;
		try {
			body = (await req.json()) as Record<string, unknown>;
		} catch {
			return errorResponse("Malformed JSON body", 400);
		}

		if (body.type !== "notification") {
			return errorResponse(
				`Unsupported type: expected "notification", received "${String(body.type ?? "none")}"`,
				400,
			);
		}

		const notification = body.notification as
			| {
					id: number;
					message: string;
					sourceType: string;
					sourceId: string | null;
					route: string | null;
					projectId: string | null;
					createdAt: string;
			  }
			| undefined;

		if (!notification || typeof notification.id !== "number") {
			return errorResponse("Missing or invalid notification payload", 400);
		}

		ctx.websocketHub?.broadcastNotificationCreated(notification);

		return jsonResponse({ notified: true, notificationId: notification.id });
	} catch (error) {
		return errorResponse(`Failed to process notification: ${String(error)}`);
	}
}

/**
 * GET /api/v2/feed - run activity feed only.
 * Returns runs ordered by latest activity time with filtering and pagination.
 */
export async function handleV2FeedRequest(
	req: Request,
	ctx?: ApiContext,
): Promise<Response> {
	try {
		const url = new URL(req.url);
		const params = url.searchParams;
		const projectIdFilter = params.get("projectId");
		const projectUuidFilter = params.get("project_id");
		const statusFilter = params.get("status") as string | null;
		const dateRange = params.get("dateRange") ?? "all";
		const searchQuery = params.get("q") ?? params.get("search");
		const searchTokens = normalizeActivitySearchTokens(searchQuery);
		const limit = Number.parseInt(params.get("limit") ?? "25", 10);
		const offset = Number.parseInt(params.get("offset") ?? "0", 10);

		const db = await getDb();
		await reclassifyInactiveRunsWithBroadcast(db, ctx?.websocketHub);
		const projects = await getAllProjects(db);
		const projectLookup = buildProjectLookup(projects);
		const skillMetadataLookup = await getRuntimeSkillMetadataLookup();

		let projectPathFilter: string | undefined;
		let dbProjectIdFilter: string | undefined;

		if (projectUuidFilter) {
			dbProjectIdFilter = projectUuidFilter;
		} else if (projectIdFilter) {
			const project = findProjectByIdentity(projectLookup, {
				projectId: projectIdFilter,
			});
			if (project) {
				projectPathFilter = project.path;
			} else {
				return jsonResponse({ items: [], total: 0 });
			}
		}

		const dbStatus =
			statusFilter && statusFilter !== "all"
				? (statusFilter as string)
				: undefined;

		if (searchTokens.length > 0) {
			const result = searchActivityFeedRuns({
				db,
				projectLookup,
				skillMetadataLookup,
				projection: {
					currentStepForRun: getListRunCurrentStep,
					statusMessageForRun: getListRunStatusMessage,
					runRecordToListRun,
				},
				query: searchQuery,
				projectId: dbProjectIdFilter,
				projectRoot: dbProjectIdFilter ? undefined : projectPathFilter,
				status: dbStatus as Status | undefined,
				dateRange: dateRange as ActivitySearchDateRange,
				limit,
				offset,
			});

			return jsonResponse(result);
		}

		const runsResult = listRuns(db, {
			projectId: dbProjectIdFilter,
			projectPath: dbProjectIdFilter ? undefined : projectPathFilter,
			status: dbStatus as
				| import("../../../../shared/events.js").Status
				| undefined,
			excludeBootstrapOnly: true,
			limit: 200,
			offset: 0,
		});

		let runCandidates: Array<{
			record: RunRecordWithLastEvent;
			project: ProjectEntry;
			timestamp: string;
		}> = [];
		for (const record of runsResult.records) {
			if (isEvalRunRecord(record)) continue;
			if (!isActivityTrackedFlow(record.flow, skillMetadataLookup)) continue;
			const project =
				findProjectByIdentity(projectLookup, record) ??
				fallbackProjectFromRun(record);
			runCandidates.push({
				record,
				project,
				timestamp: record.lastEventAt ?? record.createdAt,
			});
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
				runCandidates = runCandidates.filter(
					(item) => now - new Date(item.timestamp).getTime() <= range,
				);
			}
		}

		runCandidates.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);

		const total = runCandidates.length;
		const paged = runCandidates
			.slice(offset, offset + limit)
			.map(({ record, project, timestamp }) => {
				const run = runRecordToListRun(
					record,
					project,
					getListRunStatusMessage(db, record),
					getListRunCurrentStep(db, record),
				);

				return {
					type: "run" as const,
					id: record.id,
					timestamp,
					run,
				};
			});

		return jsonResponse({ items: paged, total });
	} catch (error) {
		return errorResponse(`Failed to fetch feed: ${String(error)}`);
	}
}
