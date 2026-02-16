/**
 * V2 API endpoints for runs and projects.
 * Integrates with status.db for real run data via database queries.
 */

import { resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { formatError } from "../../../../shared/errors.js";
import {
	queryAllLatestStatuses,
	queryStatusUpdateById,
} from "../../../../src/agent-tools/work/database.js";
import type {
	StatusUpdateRecord,
	StatusValue,
} from "../../../../src/agent-tools/work/models.js";
import type { AttentionData, Run, RunStatus } from "../../types/runs";
import { getAllProjects, getProject, type ProjectEntry } from "../registry";

function jsonResponse(data: unknown, status = 200): Response {
	return new Response(JSON.stringify(data), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}

function errorResponse(message: string, status = 500): Response {
	return jsonResponse({ error: message }, status);
}

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
 * Extract command from metadata JSON if present.
 * Falls back to "/build" as the default command.
 */
function extractCommand(metadata: string | null): string {
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
 */
function recordToRun(record: StatusUpdateRecord, project: ProjectEntry): Run {
	const status = mapStatusValueToRunStatus(record.status);
	return {
		id: `${project.id}-${record.feature}-${record.id}`,
		projectId: project.id,
		projectName: project.name,
		featureId: record.feature,
		featureName: humanizeFeatureName(record.feature),
		command: extractCommand(record.metadata),
		status,
		currentStep: null,
		steps: [],
		artifacts: [],
		events: [],
		startedAt: record.createdAt,
		completedAt:
			status === "completed" || status === "failed" ? record.createdAt : null,
		error: status === "failed" ? record.message : null,
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
			// Return undefined to indicate special handling needed
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
		// Load all projects to create a lookup map
		const projects = await getAllProjects();
		const projectByPath = new Map(projects.map((p) => [p.path, p]));
		const projectById = new Map(projects.map((p) => [p.id, p]));

		// Determine project path filter if projectId is specified
		let projectPathFilter: string | undefined;
		if (projectIdFilter) {
			const project = projectById.get(projectIdFilter);
			if (project) {
				projectPathFilter = project.path;
			} else {
				// Project not found - return empty results
				return jsonResponse({ runs: [], total: 0 });
			}
		}

		// Determine status filter for database query
		let dbStatusFilter: StatusValue | undefined;
		if (statusFilter && statusFilter !== "all") {
			dbStatusFilter = mapRunStatusToStatusValue(statusFilter);
			// For "running" status, we query without status filter and post-filter
			// For "queued" status, return empty (not in status.db)
			if (statusFilter === "queued") {
				return jsonResponse({ runs: [], total: 0 });
			}
		}

		// Query database for latest statuses
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

		const { records, total: dbTotal } = result.right;

		// Convert records to Run objects
		let runs: Run[] = [];
		for (const record of records) {
			const project = projectByPath.get(record.projectPath);
			if (project) {
				runs.push(recordToRun(record, project));
			}
		}

		// Post-filter for "running" status (includes both started and in_progress)
		let total = dbTotal;
		if (statusFilter === "running") {
			runs = runs.filter((r) => r.status === "running");
			total = runs.length;
			// Apply pagination after filtering
			runs = runs.slice(offset, offset + limit);
		}

		// Apply date range filter
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
 */
export async function handleV2RunsAttentionRequest(): Promise<Response> {
	try {
		// Load all projects to create a lookup map
		const projects = await getAllProjects();
		const projectByPath = new Map(projects.map((p) => [p.path, p]));

		// Query all latest statuses (no filter)
		const result = await pipe(queryAllLatestStatuses({}))();

		if (E.isLeft(result)) {
			return errorResponse(
				`Database query failed: ${formatError(result.left, false)}`,
			);
		}

		const { records } = result.right;

		// Convert records to Run objects
		const allRuns: Run[] = [];
		for (const record of records) {
			const project = projectByPath.get(record.projectPath);
			if (project) {
				allRuns.push(recordToRun(record, project));
			}
		}

		// Group runs by attention category
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
 * queries the database, and returns real run data.
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

		const run = recordToRun(record, project);
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
		const fullPath = resolve(projectRoot, artifactPath);

		if (!fullPath.startsWith(`${projectRoot}/`)) {
			return errorResponse("Access denied: path traversal detected", 403);
		}

		const file = Bun.file(fullPath);
		const exists = await file.exists();

		if (!exists) {
			return errorResponse(`Artifact not found: ${artifactPath}`, 404);
		}

		const content = await file.text();
		return jsonResponse({ content });
	} catch (error) {
		return errorResponse(`Failed to fetch artifact: ${String(error)}`);
	}
}

/**
 * V2 Project type including availability status.
 */
interface V2Project {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly available: boolean;
}

/**
 * GET /api/v2/projects - list registered projects.
 */
export async function handleV2ProjectsListRequest(): Promise<Response> {
	try {
		const projects = await getAllProjects();
		const v2Projects: V2Project[] = projects.map((p) => ({
			id: p.id,
			name: p.name,
			path: p.path,
			available: p.available,
		}));
		return jsonResponse({ projects: v2Projects });
	} catch (error) {
		return errorResponse(`Failed to load projects: ${String(error)}`);
	}
}

/**
 * GET /api/v2/projects/:id - single project.
 */
export async function handleV2ProjectDetailRequest(
	projectId: string,
): Promise<Response> {
	try {
		const project = await getProject(projectId);

		if (!project) {
			return errorResponse(`Project not found: ${projectId}`, 404);
		}

		const v2Project: V2Project = {
			id: project.id,
			name: project.name,
			path: project.path,
			available: project.available,
		};

		return jsonResponse(v2Project);
	} catch (error) {
		return errorResponse(`Failed to get project: ${String(error)}`);
	}
}
