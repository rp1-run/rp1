import type { Database } from "bun:sqlite";
import { getRunById } from "../../../../src/agent-tools/emit/database.js";
import type { AcpActivityMessage } from "../../types/websocket";
import { buildProjectLookup, findProjectByIdentity } from "../project-lookup";
import { getAllProjects } from "../registry";
import { loadSettings, type Settings } from "../settings-loader";
import type { WebSocketHub } from "../websocket";
import { AcpRunCoalescer } from "./coalescer";
import {
	AcpSidecarError,
	type AcpSidecarErrorCode,
	AcpSidecarManager,
} from "./manager";
import type { AcpSidecarBinding, AcpSidecarSession } from "./types";

export type AcpApiErrorCode =
	| "acp_disabled"
	| "invalid_request"
	| "project_not_registered"
	| "run_not_found"
	| "run_project_not_registered"
	| "run_project_mismatch"
	| AcpSidecarErrorCode;

export class AcpApiError extends Error {
	readonly code: AcpApiErrorCode;
	readonly status: number;

	constructor(code: AcpApiErrorCode, message: string, status: number) {
		super(message);
		this.name = "AcpApiError";
		this.code = code;
		this.status = status;
	}
}

export interface AcpSessionApiResponse {
	readonly enabled: true;
	readonly provider: "fake";
	readonly session: AcpSidecarSession;
	readonly activity: readonly AcpActivityMessage[];
}

export interface AcpSessionApiRuntime {
	readonly settings?: Settings;
	readonly websocketHub?: Pick<WebSocketHub, "broadcastAcpActivity">;
}

interface AcpSessionApiDependencies {
	readonly manager: AcpSidecarManager;
	readonly coalescer: AcpRunCoalescer;
}

interface ParsedStartRequest extends AcpSidecarBinding {
	readonly prompt: string;
}

interface ParsedSessionActionRequest extends AcpSidecarBinding {
	readonly reason?: string;
}

const defaultApiDependencies: AcpSessionApiDependencies = {
	manager: new AcpSidecarManager(),
	coalescer: new AcpRunCoalescer(),
};

function requireStringField(
	body: Readonly<Record<string, unknown>>,
	field: string,
): string {
	const value = body[field];
	if (typeof value !== "string" || value.trim().length === 0) {
		throw new AcpApiError(
			"invalid_request",
			`Missing or invalid "${field}": expected non-empty string`,
			400,
		);
	}
	return value.trim();
}

function optionalStringField(
	body: Readonly<Record<string, unknown>>,
	field: string,
): string | undefined {
	const value = body[field];
	if (value === undefined) {
		return undefined;
	}
	if (typeof value !== "string") {
		throw new AcpApiError(
			"invalid_request",
			`Invalid "${field}": expected string`,
			400,
		);
	}
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : undefined;
}

function parseStartRequest(
	body: Readonly<Record<string, unknown>>,
): ParsedStartRequest {
	return {
		projectId: requireStringField(body, "projectId"),
		runId: requireStringField(body, "runId"),
		prompt: optionalStringField(body, "prompt") ?? "Inspect the bound rp1 run",
	};
}

function parseSessionActionRequest(
	body: Readonly<Record<string, unknown>>,
): ParsedSessionActionRequest {
	const reason = optionalStringField(body, "reason");
	return {
		projectId: requireStringField(body, "projectId"),
		runId: requireStringField(body, "runId"),
		...(reason ? { reason } : {}),
	};
}

async function requireAcpEnabled(runtime: AcpSessionApiRuntime): Promise<void> {
	const settings = runtime.settings ?? (await loadSettings());
	if (!settings.acp.enabled) {
		throw new AcpApiError("acp_disabled", "Fake ACP sidecar is disabled", 404);
	}
}

async function requireRegisteredBinding(
	db: Database,
	binding: AcpSidecarBinding,
): Promise<AcpSidecarBinding> {
	const [run, projects] = await Promise.all([
		Promise.resolve(getRunById(db, binding.runId)),
		getAllProjects(db),
	]);
	const projectLookup = buildProjectLookup(projects);
	const project = projectLookup.byId.get(binding.projectId);

	if (!project) {
		throw new AcpApiError(
			"project_not_registered",
			`Project not registered: ${binding.projectId}`,
			404,
		);
	}

	if (!run) {
		throw new AcpApiError(
			"run_not_found",
			`Run not found: ${binding.runId}`,
			404,
		);
	}

	const runProject = findProjectByIdentity(projectLookup, run);
	if (!runProject) {
		throw new AcpApiError(
			"run_project_not_registered",
			`Run ${run.id} is not associated with a registered project`,
			404,
		);
	}

	if (runProject.id !== project.id) {
		throw new AcpApiError(
			"run_project_mismatch",
			`Run ${run.id} is not bound to project ${project.id}`,
			409,
		);
	}

	return {
		projectId: project.id,
		runId: run.id,
	};
}

function broadcastActivity(
	runtime: AcpSessionApiRuntime,
	messages: readonly AcpActivityMessage[],
): void {
	for (const message of messages) {
		runtime.websocketHub?.broadcastAcpActivity(message);
	}
}

function responseFor(
	session: AcpSidecarSession,
	activity: readonly AcpActivityMessage[],
): AcpSessionApiResponse {
	return {
		enabled: true,
		provider: "fake",
		session,
		activity,
	};
}

function mapSidecarError(error: AcpSidecarError): AcpApiError {
	switch (error.code) {
		case "session_not_found":
			return new AcpApiError(error.code, error.message, 404);
		case "session_binding_mismatch":
			return new AcpApiError(error.code, error.message, 403);
		case "stale_session":
			return new AcpApiError(error.code, error.message, 409);
	}
}

function normalizeAcpError(error: unknown): never {
	if (error instanceof AcpApiError) {
		throw error;
	}
	if (error instanceof AcpSidecarError) {
		throw mapSidecarError(error);
	}
	throw error;
}

export async function startFakeAcpSession(
	db: Database,
	body: Readonly<Record<string, unknown>>,
	runtime: AcpSessionApiRuntime,
	dependencies: AcpSessionApiDependencies = defaultApiDependencies,
): Promise<AcpSessionApiResponse> {
	try {
		await requireAcpEnabled(runtime);
		const request = parseStartRequest(body);
		const binding = await requireRegisteredBinding(db, request);

		const createResult = dependencies.manager.createSession(binding);
		const promptResult = dependencies.manager.promptSession(
			createResult.session.sessionId,
			binding,
			{ prompt: request.prompt },
		);
		const activity = [
			...dependencies.coalescer.coalesceResult(createResult),
			...dependencies.coalescer.coalesceResult(promptResult),
		];

		broadcastActivity(runtime, activity);
		return responseFor(promptResult.session, activity);
	} catch (error) {
		normalizeAcpError(error);
	}
}

export async function cancelFakeAcpSession(
	db: Database,
	sessionId: string,
	body: Readonly<Record<string, unknown>>,
	runtime: AcpSessionApiRuntime,
	dependencies: AcpSessionApiDependencies = defaultApiDependencies,
): Promise<AcpSessionApiResponse> {
	try {
		await requireAcpEnabled(runtime);
		const request = parseSessionActionRequest(body);
		const binding = await requireRegisteredBinding(db, request);
		const result = dependencies.manager.cancelSession(sessionId, binding, {
			reason: request.reason,
		});
		const activity = dependencies.coalescer.coalesceResult(result);

		broadcastActivity(runtime, activity);
		return responseFor(result.session, activity);
	} catch (error) {
		normalizeAcpError(error);
	}
}

export async function closeFakeAcpSession(
	db: Database,
	sessionId: string,
	body: Readonly<Record<string, unknown>>,
	runtime: AcpSessionApiRuntime,
	dependencies: AcpSessionApiDependencies = defaultApiDependencies,
): Promise<AcpSessionApiResponse> {
	try {
		await requireAcpEnabled(runtime);
		const request = parseSessionActionRequest(body);
		const binding = await requireRegisteredBinding(db, request);
		const result = dependencies.manager.closeSession(sessionId, binding);
		const activity = dependencies.coalescer.coalesceResult(result);

		broadcastActivity(runtime, activity);
		return responseFor(result.session, activity);
	} catch (error) {
		normalizeAcpError(error);
	}
}
