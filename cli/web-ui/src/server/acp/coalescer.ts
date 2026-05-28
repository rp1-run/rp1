import type {
	AcpActivityMessage,
	AcpActivitySignalItem,
} from "../../types/websocket";
import type {
	AcpSidecarResult,
	AcpSidecarSession,
	AcpSidecarSignal,
} from "./types";

const DEFAULT_BATCH_THRESHOLD = 4;
const DEFAULT_MAX_SIGNALS_PER_MESSAGE = 25;
const DEFAULT_MAX_SEEN_SIGNAL_IDS = 1000;

interface SessionDedupState {
	readonly signalIds: string[];
	readonly signalIdSet: Set<string>;
	readonly lastFingerprintByKind: Map<AcpSidecarSignal["kind"], string>;
}

export interface AcpRunCoalescerOptions {
	readonly batchThreshold?: number;
	readonly maxSignalsPerMessage?: number;
	readonly maxSeenSignalIds?: number;
}

function createDedupState(): SessionDedupState {
	return {
		signalIds: [],
		signalIdSet: new Set(),
		lastFingerprintByKind: new Map(),
	};
}

function isBoundToSession(
	session: AcpSidecarSession,
	signal: AcpSidecarSignal,
): boolean {
	return (
		signal.projectId === session.projectId &&
		signal.runId === session.runId &&
		signal.sessionId === session.sessionId
	);
}

function signalFingerprint(signal: AcpSidecarSignal): string {
	return `${signal.projectId}:${signal.runId}:${signal.sessionId}:${signal.kind}:${JSON.stringify(signal.payload)}`;
}

function toSignalItem(signal: AcpSidecarSignal): AcpActivitySignalItem {
	return {
		signalId: signal.signalId,
		sequence: signal.sequence,
		kind: signal.kind,
		payload: signal.payload,
		createdAt: signal.timestamp,
	};
}

function toSingleMessage(signal: AcpSidecarSignal): AcpActivityMessage {
	return {
		type: "acp:activity",
		sequenceId: signal.signalId,
		projectId: signal.projectId,
		runId: signal.runId,
		sessionId: signal.sessionId,
		provider: signal.provider,
		kind: signal.kind,
		payload: signal.payload,
		signalIds: [signal.signalId],
		sidecarSequences: [signal.sequence],
		createdAt: signal.timestamp,
	};
}

function toBatchMessage(
	session: AcpSidecarSession,
	signals: readonly AcpSidecarSignal[],
	droppedCount: number,
): AcpActivityMessage {
	const firstSignal = signals[0];
	const lastSignal = signals[signals.length - 1];

	return {
		type: "acp:activity",
		sequenceId: `${session.sessionId}:${firstSignal.sequence}-${lastSignal.sequence}`,
		projectId: session.projectId,
		runId: session.runId,
		sessionId: session.sessionId,
		provider: session.provider,
		kind: "batch",
		payload: {
			signals: signals.map(toSignalItem),
			droppedCount,
		},
		signalIds: signals.map((signal) => signal.signalId),
		sidecarSequences: signals.map((signal) => signal.sequence),
		createdAt: lastSignal.timestamp,
	};
}

export class AcpRunCoalescer {
	private readonly batchThreshold: number;
	private readonly maxSignalsPerMessage: number;
	private readonly maxSeenSignalIds: number;
	private readonly dedupBySession = new Map<string, SessionDedupState>();

	constructor(options: AcpRunCoalescerOptions = {}) {
		this.batchThreshold = Math.max(
			2,
			options.batchThreshold ?? DEFAULT_BATCH_THRESHOLD,
		);
		this.maxSignalsPerMessage = Math.max(
			1,
			options.maxSignalsPerMessage ?? DEFAULT_MAX_SIGNALS_PER_MESSAGE,
		);
		this.maxSeenSignalIds = Math.max(
			1,
			options.maxSeenSignalIds ?? DEFAULT_MAX_SEEN_SIGNAL_IDS,
		);
	}

	coalesceResult(result: AcpSidecarResult): readonly AcpActivityMessage[] {
		return this.coalesceSessionSignals(result.session, result.signals);
	}

	coalesceSessionSignals(
		session: AcpSidecarSession,
		signals: readonly AcpSidecarSignal[],
	): readonly AcpActivityMessage[] {
		const accepted = signals.filter((signal) =>
			this.acceptSignal(session, signal),
		);
		if (accepted.length === 0) {
			return [];
		}

		const retained = accepted.slice(-this.maxSignalsPerMessage);
		const droppedCount = accepted.length - retained.length;

		if (
			retained.length === 1 &&
			droppedCount === 0 &&
			accepted.length < this.batchThreshold
		) {
			return [toSingleMessage(retained[0])];
		}

		if (accepted.length >= this.batchThreshold || droppedCount > 0) {
			return [toBatchMessage(session, retained, droppedCount)];
		}

		return retained.map(toSingleMessage);
	}

	private acceptSignal(
		session: AcpSidecarSession,
		signal: AcpSidecarSignal,
	): boolean {
		if (!isBoundToSession(session, signal)) {
			return false;
		}

		const state = this.getDedupState(session.sessionId);
		if (state.signalIdSet.has(signal.signalId)) {
			return false;
		}

		const fingerprint = signalFingerprint(signal);
		if (state.lastFingerprintByKind.get(signal.kind) === fingerprint) {
			this.rememberSignalId(state, signal.signalId);
			return false;
		}

		state.lastFingerprintByKind.set(signal.kind, fingerprint);
		this.rememberSignalId(state, signal.signalId);
		return true;
	}

	private getDedupState(sessionId: string): SessionDedupState {
		const existing = this.dedupBySession.get(sessionId);
		if (existing) {
			return existing;
		}

		const state = createDedupState();
		this.dedupBySession.set(sessionId, state);
		return state;
	}

	private rememberSignalId(state: SessionDedupState, signalId: string): void {
		state.signalIds.push(signalId);
		state.signalIdSet.add(signalId);

		while (state.signalIds.length > this.maxSeenSignalIds) {
			const removed = state.signalIds.shift();
			if (removed) {
				state.signalIdSet.delete(removed);
			}
		}
	}
}
