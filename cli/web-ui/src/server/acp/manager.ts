import { randomUUID } from "node:crypto";
import { FakeAcpProvider } from "./fake-provider";
import type {
	AcpCancelInput,
	AcpPromptInput,
	AcpProvider,
	AcpProviderSessionContext,
	AcpProviderSignalDraft,
	AcpSidecarActiveSessionSummary,
	AcpSidecarBinding,
	AcpSidecarPermissionState,
	AcpSidecarProviderName,
	AcpSidecarResult,
	AcpSidecarSession,
	AcpSidecarSessionStatus,
	AcpSidecarSignal,
} from "./types";

export type AcpSidecarErrorCode =
	| "session_not_found"
	| "session_binding_mismatch"
	| "stale_session";

export class AcpSidecarError extends Error {
	readonly code: AcpSidecarErrorCode;

	constructor(code: AcpSidecarErrorCode, message: string) {
		super(message);
		this.name = "AcpSidecarError";
		this.code = code;
	}
}

interface ManagedSession {
	sessionId: string;
	provider: AcpSidecarProviderName;
	projectId: string;
	runId: string;
	status: AcpSidecarSessionStatus;
	promptCount: number;
	activePermission: AcpSidecarPermissionState | null;
	createdAt: string;
	updatedAt: string;
	nextSequence: number;
}

export interface AcpSidecarManagerOptions {
	readonly provider?: AcpProvider;
	readonly createSessionId?: () => string;
	readonly now?: () => Date;
}

function isTerminalStatus(status: AcpSidecarSessionStatus): boolean {
	return status === "cancelled" || status === "closed";
}

function snapshotSession(session: ManagedSession): AcpSidecarSession {
	return {
		sessionId: session.sessionId,
		provider: session.provider,
		projectId: session.projectId,
		runId: session.runId,
		status: session.status,
		promptCount: session.promptCount,
		activePermission: session.activePermission,
		createdAt: session.createdAt,
		updatedAt: session.updatedAt,
	};
}

export class AcpSidecarManager {
	private readonly provider: AcpProvider;
	private readonly createSessionId: () => string;
	private readonly now: () => Date;
	private readonly sessions = new Map<string, ManagedSession>();

	constructor(options: AcpSidecarManagerOptions = {}) {
		this.provider = options.provider ?? new FakeAcpProvider();
		this.createSessionId = options.createSessionId ?? randomUUID;
		this.now = options.now ?? (() => new Date());
	}

	createSession(binding: AcpSidecarBinding): AcpSidecarResult {
		const timestamp = this.now().toISOString();
		const session: ManagedSession = {
			sessionId: this.createSessionId(),
			provider: this.provider.name,
			projectId: binding.projectId,
			runId: binding.runId,
			status: "initializing",
			promptCount: 0,
			activePermission: null,
			createdAt: timestamp,
			updatedAt: timestamp,
			nextSequence: 0,
		};
		const context = this.contextFor(session);
		const signals = this.recordSignals(session, [
			...this.provider.initialize(context),
			...this.provider.createSession(context),
		]);

		this.sessions.set(session.sessionId, session);

		return {
			session: snapshotSession(session),
			signals,
		};
	}

	promptSession(
		sessionId: string,
		binding: AcpSidecarBinding,
		input: AcpPromptInput,
	): AcpSidecarResult {
		const session = this.requireLiveSession(sessionId, binding);
		const context = this.contextFor(session);
		const signals = this.recordSignals(
			session,
			this.provider.prompt(context, input),
		);
		session.promptCount += 1;

		return {
			session: snapshotSession(session),
			signals,
		};
	}

	cancelSession(
		sessionId: string,
		binding: AcpSidecarBinding,
		input?: AcpCancelInput,
	): AcpSidecarResult {
		const session = this.requireLiveSession(sessionId, binding);
		const signals = this.recordSignals(
			session,
			this.provider.cancel(this.contextFor(session), input),
		);

		return {
			session: snapshotSession(session),
			signals,
		};
	}

	closeSession(
		sessionId: string,
		binding: AcpSidecarBinding,
	): AcpSidecarResult {
		const session = this.requireLiveSession(sessionId, binding);
		const signals = this.recordSignals(
			session,
			this.provider.close(this.contextFor(session)),
		);

		return {
			session: snapshotSession(session),
			signals,
		};
	}

	getSession(sessionId: string): AcpSidecarSession | null {
		const session = this.sessions.get(sessionId);
		return session ? snapshotSession(session) : null;
	}

	listSessions(
		binding?: Partial<AcpSidecarBinding>,
	): readonly AcpSidecarSession[] {
		return Array.from(this.sessions.values())
			.filter((session) => {
				if (binding?.projectId && session.projectId !== binding.projectId) {
					return false;
				}
				if (binding?.runId && session.runId !== binding.runId) {
					return false;
				}
				return true;
			})
			.map(snapshotSession);
	}

	getActiveSessionSummary(): AcpSidecarActiveSessionSummary {
		let activeSessions = 0;
		let blockedSessions = 0;

		for (const session of this.sessions.values()) {
			if (isTerminalStatus(session.status)) {
				continue;
			}
			activeSessions += 1;
			if (session.status === "blocked") {
				blockedSessions += 1;
			}
		}

		return {
			activeSessions,
			blockedSessions,
		};
	}

	private requireLiveSession(
		sessionId: string,
		binding: AcpSidecarBinding,
	): ManagedSession {
		const session = this.sessions.get(sessionId);
		if (!session) {
			throw new AcpSidecarError(
				"session_not_found",
				`ACP sidecar session not found: ${sessionId}`,
			);
		}

		if (
			session.projectId !== binding.projectId ||
			session.runId !== binding.runId
		) {
			throw new AcpSidecarError(
				"session_binding_mismatch",
				`ACP sidecar session ${sessionId} is not bound to project ${binding.projectId} and run ${binding.runId}`,
			);
		}

		if (isTerminalStatus(session.status)) {
			throw new AcpSidecarError(
				"stale_session",
				`ACP sidecar session ${sessionId} is already ${session.status}`,
			);
		}

		return session;
	}

	private contextFor(session: ManagedSession): AcpProviderSessionContext {
		return {
			sessionId: session.sessionId,
			provider: session.provider,
			projectId: session.projectId,
			runId: session.runId,
			promptCount: session.promptCount,
		};
	}

	private recordSignals(
		session: ManagedSession,
		drafts: readonly AcpProviderSignalDraft[],
	): readonly AcpSidecarSignal[] {
		return drafts.map((draft) => {
			const sequence = session.nextSequence + 1;
			session.nextSequence = sequence;
			const timestamp = this.now().toISOString();
			const signal = {
				signalId: `${session.sessionId}:${sequence}`,
				provider: session.provider,
				projectId: session.projectId,
				runId: session.runId,
				sessionId: session.sessionId,
				sequence,
				timestamp,
				...draft,
			} as AcpSidecarSignal;
			this.applySignal(session, signal);
			return signal;
		});
	}

	private applySignal(session: ManagedSession, signal: AcpSidecarSignal): void {
		if (signal.kind === "session" || signal.kind === "status") {
			session.status = signal.payload.status;
		}

		if (signal.kind === "permission") {
			if (signal.payload.status === "pending") {
				session.activePermission = {
					permissionId: signal.payload.permissionId,
					title: signal.payload.title,
					reason: signal.payload.reason,
					status: signal.payload.status,
					blocking: signal.payload.blocking,
					updatedAt: signal.timestamp,
				};
				if (signal.payload.blocking) {
					session.status = "blocked";
				}
			} else if (
				session.activePermission?.permissionId === signal.payload.permissionId
			) {
				session.activePermission = null;
			}
		}

		if (isTerminalStatus(session.status)) {
			session.activePermission = null;
		}

		session.updatedAt = signal.timestamp;
	}
}
