/**
 * V2 API endpoints for runs and projects.
 * Integrates with status.db for real run data via database queries.
 */

import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import { formatError } from "../../../../shared/errors.js";
import { queryAllLatestStatuses } from "../../../../src/agent-tools/work/database.js";
import type {
	StatusUpdateRecord,
	StatusValue,
} from "../../../../src/agent-tools/work/models.js";
import type {
	Artifact,
	AttentionData,
	Run,
	RunEvent,
	RunStatus,
	Step,
} from "../../types/runs";
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
 * Generate mock steps for a run.
 */
function generateMockSteps(status: RunStatus): Step[] {
	const stepNames = ["Requirements", "Design", "Tasks", "Build", "Verify"];

	const getStepStatus = (
		index: number,
		runStatus: RunStatus,
		currentStepIndex: number,
	): Step["status"] => {
		if (runStatus === "failed" && index === currentStepIndex) return "failed";
		if (runStatus === "completed" || runStatus === "needs-review") {
			return "completed";
		}
		if (index < currentStepIndex) return "completed";
		if (index === currentStepIndex)
			return runStatus === "running" ? "running" : "pending";
		return "pending";
	};

	const currentStepIndex =
		status === "completed" || status === "needs-review"
			? stepNames.length - 1
			: status === "failed"
				? 2
				: Math.floor(Math.random() * stepNames.length);

	return stepNames.map((name, index) => ({
		id: `step-${index}`,
		name,
		status: getStepStatus(index, status, currentStepIndex),
		startedAt:
			index <= currentStepIndex
				? new Date(Date.now() - (5 - index) * 60 * 1000).toISOString()
				: null,
		completedAt:
			index < currentStepIndex
				? new Date(Date.now() - (4 - index) * 60 * 1000).toISOString()
				: null,
		taskCount: index === 3 ? 12 : null,
		completedTaskCount:
			index === 3 ? (index < currentStepIndex ? 12 : 8) : null,
	}));
}

/**
 * Generate mock artifacts for a run.
 */
function generateMockArtifacts(status: RunStatus): Artifact[] {
	if (status === "queued" || status === "running") {
		return [];
	}

	return [
		{
			path: ".rp1/work/features/auth-refactor/requirements.md",
			type: "markdown",
			updatedDuringRun: true,
			isNew: true,
		},
		{
			path: ".rp1/work/features/auth-refactor/design.md",
			type: "markdown",
			updatedDuringRun: true,
			isNew: true,
		},
		{
			path: ".rp1/work/features/auth-refactor/tasks.md",
			type: "markdown",
			updatedDuringRun: true,
			isNew: true,
		},
		{
			path: "src/auth/validation.ts",
			type: "code",
			updatedDuringRun: true,
			isNew: false,
		},
	];
}

/**
 * Generate mock events for a run.
 */
function generateMockEvents(status: RunStatus): RunEvent[] {
	const events: RunEvent[] = [
		{
			id: "evt-1",
			type: "step-start",
			message: "Starting requirements phase",
			timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
			stepId: "step-0",
			metadata: null,
		},
		{
			id: "evt-2",
			type: "step-complete",
			message: "Requirements phase completed",
			timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
			stepId: "step-0",
			metadata: null,
		},
		{
			id: "evt-3",
			type: "step-start",
			message: "Starting design phase",
			timestamp: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
			stepId: "step-1",
			metadata: null,
		},
	];

	if (status === "failed") {
		events.push({
			id: "evt-4",
			type: "error",
			message: "Build failed: missing dependency @types/node",
			timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
			stepId: "step-3",
			metadata: { exitCode: 1 },
		});
	}

	if (status === "completed" || status === "needs-review") {
		events.push(
			{
				id: "evt-4",
				type: "task-batch",
				message: "12 tasks completed in Build step",
				timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
				stepId: "step-3",
				metadata: { taskCount: 12, completedCount: 12 },
			},
			{
				id: "evt-5",
				type: "artifact-updated",
				message: "Created requirements.md",
				timestamp: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
				stepId: "step-4",
				metadata: { path: ".rp1/work/features/auth-refactor/requirements.md" },
			},
		);
	}

	return events;
}

/**
 * Generate mock runs for demonstration.
 */
function generateMockRuns(): Run[] {
	const now = Date.now();
	const minutesAgo = (minutes: number) =>
		new Date(now - minutes * 60 * 1000).toISOString();

	const statuses: RunStatus[] = [
		"waiting-input",
		"needs-review",
		"failed",
		"running",
		"running",
		"completed",
		"completed",
		"queued",
	];

	return statuses.map((status, index) => {
		const steps = generateMockSteps(status);
		const currentStep = steps.find((s) => s.status === "running")?.name ?? null;

		return {
			id: `run-${index + 1}`,
			projectId: index < 4 ? "rp1" : "my-app",
			projectName: index < 4 ? "rp1" : "my-app",
			featureId: `feature-${index + 1}`,
			featureName: [
				"Auth Refactor",
				"API Rate Limiting",
				"WebSocket Fix",
				"Dashboard Build",
				"User Settings",
				"Search Feature",
				"Export Feature",
				"Cache Layer",
			][index],
			command: index % 2 === 0 ? "/build" : "/pr-review",
			status,
			currentStep,
			steps,
			artifacts: generateMockArtifacts(status),
			events: generateMockEvents(status),
			startedAt: minutesAgo(30 - index * 3),
			completedAt:
				status === "completed" ||
				status === "failed" ||
				status === "needs-review"
					? minutesAgo(5 - index)
					: null,
			error:
				status === "failed"
					? "Build failed: missing dependency @types/node"
					: null,
		};
	});
}

const mockRuns = generateMockRuns();

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
 */
export async function handleV2RunDetailRequest(
	runId: string,
): Promise<Response> {
	const run = mockRuns.find((r) => r.id === runId);

	if (!run) {
		return errorResponse(`Run not found: ${runId}`, 404);
	}

	return jsonResponse(run);
}

/**
 * Mock content for artifacts - in production this would read from file system.
 */
const mockArtifactContent: Record<string, string> = {
	".rp1/work/features/auth-refactor/requirements.md": `# Requirements: Auth Refactor

## Overview
Refactor the authentication system to support modern security standards.

## Functional Requirements

### FR1: Token-based Authentication
- Support JWT tokens with configurable expiration
- Implement refresh token rotation
- Support token revocation

### FR2: Multi-factor Authentication
- SMS-based OTP
- TOTP (Google Authenticator compatible)
- Email-based verification

### FR3: Session Management
- Track active sessions per user
- Allow users to terminate sessions
- Implement session timeout

## Non-Functional Requirements

### NFR1: Security
- All tokens must be signed with RS256
- Passwords must be hashed with bcrypt (cost factor 12)
- Rate limiting on auth endpoints

### NFR2: Performance
- Token validation < 10ms
- Login flow < 500ms p99

## Acceptance Criteria
- [ ] All existing tests pass
- [ ] New unit tests for token validation
- [ ] Integration tests for auth flows
- [ ] Security audit completed
`,
	".rp1/work/features/auth-refactor/design.md": `# Design: Auth Refactor

## Architecture

\`\`\`mermaid
graph TD
    A[Client] --> B[API Gateway]
    B --> C[Auth Service]
    C --> D[Token Store]
    C --> E[User DB]
    C --> F[MFA Provider]
\`\`\`

## Components

### Auth Service
Handles all authentication logic including:
- Login/logout
- Token generation and validation
- MFA verification

### Token Store
Redis-based storage for:
- Active refresh tokens
- Revoked tokens (blacklist)
- Rate limiting counters

## API Design

### POST /auth/login
\`\`\`typescript
interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
\`\`\`

### POST /auth/refresh
\`\`\`typescript
interface RefreshRequest {
  refreshToken: string;
}
\`\`\`

## Security Considerations
- Tokens signed with RS256 using rotating keys
- Refresh tokens are single-use
- Failed login attempts tracked per IP
`,
	".rp1/work/features/auth-refactor/tasks.md": `# Tasks: Auth Refactor

## T1: Set up token infrastructure
**Status:** Completed
- Create JWT utility functions
- Set up key rotation mechanism
- Add token validation middleware

## T2: Implement refresh token flow
**Status:** Completed
- Create refresh token model
- Implement token rotation
- Add revocation support

## T3: Add MFA support
**Status:** In Progress
- Integrate TOTP library
- Create MFA enrollment flow
- Add SMS provider integration

## T4: Session management
**Status:** Pending
- Create session tracking model
- Add session list endpoint
- Implement session termination

## T5: Security hardening
**Status:** Pending
- Add rate limiting
- Implement brute force protection
- Security audit
`,
	"src/auth/validation.ts": `import { z } from "zod";
import jwt from "jsonwebtoken";
import { getPublicKey } from "./keys";

/**
 * Schema for validating login requests.
 */
export const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  mfaCode: z.string().length(6).optional(),
});

/**
 * Schema for validating JWT payload.
 */
export const tokenPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  roles: z.array(z.string()),
  iat: z.number(),
  exp: z.number(),
});

export type TokenPayload = z.infer<typeof tokenPayloadSchema>;

/**
 * Validate and decode a JWT token.
 */
export async function validateToken(token: string): Promise<TokenPayload> {
  const publicKey = await getPublicKey();

  const decoded = jwt.verify(token, publicKey, {
    algorithms: ["RS256"],
  });

  return tokenPayloadSchema.parse(decoded);
}

/**
 * Check if a token is expired.
 */
export function isTokenExpired(payload: TokenPayload): boolean {
  return Date.now() >= payload.exp * 1000;
}

/**
 * Extract bearer token from Authorization header.
 */
export function extractBearerToken(header: string | null): string | null {
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice(7);
}
`,
};

/**
 * GET /api/v2/runs/:runId/artifacts/:path - fetch artifact content.
 */
export async function handleV2ArtifactContentRequest(
	runId: string,
	artifactPath: string,
): Promise<Response> {
	const run = mockRuns.find((r) => r.id === runId);

	if (!run) {
		return errorResponse(`Run not found: ${runId}`, 404);
	}

	const artifact = run.artifacts.find((a) => a.path === artifactPath);
	if (!artifact) {
		return errorResponse(`Artifact not found: ${artifactPath}`, 404);
	}

	const content = mockArtifactContent[artifactPath];
	if (!content) {
		return errorResponse(`Artifact content not found: ${artifactPath}`, 404);
	}

	return jsonResponse({ content });
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
