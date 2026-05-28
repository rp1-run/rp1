import type { LiveAcpActivityItem, LiveAcpRunState, Run } from "@/types/runs";
import type {
	AcpActivityBatchPayload,
	AcpActivityMessage,
	AcpActivitySignalItem,
	EventNotificationMessage,
	StateSnapshotMessage,
} from "@/types/websocket";
import {
	isLiveAttentionStatus,
	isTerminalRunStatus,
	isValidRunStatus,
} from "../../../shared/events";
import { getSocraticDuelEventLabel } from "./socratic-duel-status";

type Listener = () => void;

const EMPTY_RUNS: readonly Run[] = [];
const EMPTY_RUN_IDS: readonly string[] = [];
const EMPTY_MESSAGES: readonly EventNotificationMessage[] = [];
const EMPTY_ACP_MESSAGES: readonly AcpActivityMessage[] = [];
const MAX_LIVE_ACP_ACTIVITY_ITEMS = 100;
const MAX_LIVE_ACP_SEEN_SIGNAL_IDS = 500;
type SnapshotRun = StateSnapshotMessage["runs"][number];

export interface LiveRunIndexState {
	readonly runsById: ReadonlyMap<string, Run>;
	readonly runsByProject: ReadonlyMap<string, ReadonlySet<string>>;
	readonly lastEventIdByProject: ReadonlyMap<string, number>;
	readonly lastActivityAtByProject: ReadonlyMap<string, string>;
}

export interface LiveRunIndexOptions {
	readonly fetchRunSummary?: (runId: string) => Promise<Run | null>;
}

export interface LiveRunIndex {
	subscribe: (listener: Listener) => () => void;
	getRun: (runId: string) => Run | undefined;
	hasRun: (runId: string) => boolean;
	getRunsForProject: (projectId: string) => readonly Run[];
	getAllRuns: () => readonly Run[];
	getProjectRunIds: (projectId: string) => readonly string[];
	getLastEventId: (projectId: string) => number | null;
	getLastActivityAt: (projectId: string) => string | null;
	getSnapshot: () => LiveRunIndexState;
	upsertRun: (run: Run) => void;
	upsertRuns: (runs: readonly Run[]) => void;
	hydrateRun: (runId: string) => Promise<Run | null>;
	applyEvent: (message: EventNotificationMessage) => Promise<void>;
	applyAcpActivity: (message: AcpActivityMessage) => Promise<void>;
	applySnapshot: (projectId: string, message: StateSnapshotMessage) => void;
	applyGlobalSnapshot: (message: StateSnapshotMessage) => void;
	clear: () => void;
}

async function defaultFetchRunSummary(runId: string): Promise<Run | null> {
	const response = await fetch(`/api/v2/runs/${runId}/summary`);
	if (!response.ok) {
		if (response.status === 404) {
			return null;
		}
		throw new Error(`Failed to fetch run summary: ${response.statusText}`);
	}
	return normalizeRun((await response.json()) as Run);
}

function normalizeRun(run: Run): Run {
	return {
		...run,
		name: run.name ?? null,
		harness: run.harness ?? null,
		currentStep: run.currentStep ?? null,
		steps: [...run.steps],
		artifacts: [...run.artifacts],
		events: [...run.events],
		lastEventAt: run.lastEventAt ?? run.startedAt,
		completedAt: run.completedAt ?? null,
		error: run.error ?? null,
		statusMessage: run.statusMessage ?? null,
		agentSteps: run.agentSteps ?? null,
		...(run.liveAcp ? { liveAcp: run.liveAcp } : {}),
	};
}

function mergeRuns(existing: Run | undefined, incoming: Run): Run {
	const normalized = normalizeRun(incoming);
	if (!existing) {
		return normalized;
	}

	return {
		...existing,
		...normalized,
		steps: normalized.steps.length > 0 ? normalized.steps : existing.steps,
		artifacts:
			normalized.artifacts.length > 0
				? normalized.artifacts
				: existing.artifacts,
		events: normalized.events.length > 0 ? normalized.events : existing.events,
		error: normalized.error ?? existing.error,
		statusMessage: normalized.statusMessage ?? existing.statusMessage ?? null,
		agentSteps: normalized.agentSteps ?? existing.agentSteps,
		invocation: normalized.invocation ?? existing.invocation,
		subflows: normalized.subflows ?? existing.subflows,
		liveAcp: normalized.liveAcp ?? existing.liveAcp,
	};
}

function activityTimestampForRun(run: Run): string {
	return run.lastEventAt ?? run.startedAt;
}

function compareRunsByActivity(a: Run, b: Run): number {
	const left = activityTimestampForRun(a);
	const right = activityTimestampForRun(b);
	return right.localeCompare(left);
}

function deriveCurrentStepFromSnapshot(
	steps: SnapshotRun["steps"],
): string | null {
	for (const step of [...steps].reverse()) {
		if (step.status === "running" || step.status === "waiting") {
			return step.step;
		}
	}

	for (const step of [...steps].reverse()) {
		if (step.status !== "not_started") {
			return step.step;
		}
	}

	return null;
}

function reconcileRunWithSnapshot(
	existing: Run,
	snapshotRun: SnapshotRun,
): Run {
	const nextStatus = isValidRunStatus(snapshotRun.status)
		? snapshotRun.status
		: existing.status;

	return {
		...existing,
		status: nextStatus,
		currentStep: deriveCurrentStepFromSnapshot(snapshotRun.steps),
		completedAt: isTerminalRunStatus(nextStatus) ? existing.completedAt : null,
		...(nextStatus !== existing.status && nextStatus !== "failed"
			? {
					error: null,
					statusMessage: null,
				}
			: {}),
	};
}

function reduceRun(run: Run, message: EventNotificationMessage): Run {
	switch (message.eventType) {
		case "status_change": {
			const data = message.data ?? {};
			const rawStatus =
				typeof data.status === "string" ? data.status : undefined;
			const fallbackRunStatus =
				!message.step &&
				!message.unit &&
				rawStatus &&
				isValidRunStatus(rawStatus)
					? rawStatus
					: undefined;
			const nextRunStatus =
				message.runStatus && isValidRunStatus(message.runStatus)
					? message.runStatus
					: fallbackRunStatus;
			const rawMessage =
				typeof data.message === "string" ? data.message : undefined;
			const statusMessage =
				getSocraticDuelEventLabel(run.command, message.step, data) ??
				rawMessage;
			const shouldClearLifecycleMessage =
				nextRunStatus !== undefined &&
				nextRunStatus !== run.status &&
				statusMessage === undefined &&
				nextRunStatus !== "failed";

			return {
				...run,
				lastEventAt: message.createdAt,
				...(message.step ? { currentStep: message.step } : {}),
				...(nextRunStatus !== undefined
					? {
							status: nextRunStatus,
							completedAt: isTerminalRunStatus(nextRunStatus)
								? message.createdAt
								: null,
						}
					: {}),
				...(statusMessage !== undefined
					? {
							statusMessage,
							...(nextRunStatus === "failed" && rawMessage
								? { error: rawMessage }
								: {}),
						}
					: {}),
				...(shouldClearLifecycleMessage
					? {
							statusMessage: null,
							error: null,
						}
					: {}),
			};
		}
		case "waiting_for_user":
			return {
				...run,
				status:
					message.runStatus && isValidRunStatus(message.runStatus)
						? message.runStatus
						: "waiting",
				currentStep: message.step ?? run.currentStep,
				lastEventAt: message.createdAt,
				completedAt: null,
			};
		case "artifact_registered":
		case "btw_update":
		case "subflow_registered":
			return {
				...run,
				lastEventAt: message.createdAt,
			};
		default:
			return run;
	}
}

function isAcpBatchPayload(
	payload: AcpActivityMessage["payload"],
): payload is AcpActivityBatchPayload {
	return (
		typeof payload === "object" &&
		payload !== null &&
		Array.isArray((payload as AcpActivityBatchPayload).signals) &&
		typeof (payload as AcpActivityBatchPayload).droppedCount === "number"
	);
}

function acpSignalsForMessage(message: AcpActivityMessage): {
	readonly signals: readonly AcpActivitySignalItem[];
	readonly droppedCount: number;
} {
	if (message.kind === "batch") {
		if (!isAcpBatchPayload(message.payload)) {
			return { signals: [], droppedCount: 0 };
		}
		return {
			signals: message.payload.signals,
			droppedCount: Math.max(0, message.payload.droppedCount),
		};
	}

	return {
		signals: [
			{
				signalId: message.signalIds[0] ?? message.sequenceId,
				sequence: message.sidecarSequences[0] ?? 0,
				kind: message.kind,
				payload: message.payload as AcpActivitySignalItem["payload"],
				createdAt: message.createdAt,
			},
		],
		droppedCount: 0,
	};
}

function toLiveAcpActivityItem(
	signal: AcpActivitySignalItem,
): LiveAcpActivityItem {
	return {
		id: signal.signalId,
		sequence: signal.sequence,
		kind: signal.kind,
		payload: signal.payload,
		createdAt: signal.createdAt,
	};
}

function reduceLiveAcpState(
	existing: LiveAcpRunState | undefined,
	message: AcpActivityMessage,
	signals: readonly AcpActivitySignalItem[],
	serverDroppedCount: number,
): LiveAcpRunState {
	let status = existing?.status ?? "running";
	let health = existing?.health ?? "available";
	let statusMessage = existing?.statusMessage ?? null;
	let activePermission = existing?.activePermission ?? null;
	let lastSequence = existing?.lastSequence ?? null;

	for (const signal of signals) {
		lastSequence =
			lastSequence == null
				? signal.sequence
				: Math.max(lastSequence, signal.sequence);

		if (signal.kind === "session") {
			const payload = signal.payload as {
				readonly status?: LiveAcpRunState["status"];
				readonly message?: string;
			};
			status = payload.status ?? status;
			statusMessage =
				typeof payload.message === "string" ? payload.message : statusMessage;
			health =
				status === "blocked"
					? "blocked"
					: status === "cancelled" || status === "closed"
						? "closed"
						: "available";
			continue;
		}

		if (signal.kind === "status") {
			const payload = signal.payload as {
				readonly status?: LiveAcpRunState["status"];
				readonly message?: string;
				readonly health?: LiveAcpRunState["health"];
			};
			status = payload.status ?? status;
			health = payload.health ?? health;
			statusMessage =
				typeof payload.message === "string" ? payload.message : statusMessage;
			continue;
		}

		if (signal.kind === "permission") {
			const payload = signal.payload as Omit<
				NonNullable<LiveAcpRunState["activePermission"]>,
				"updatedAt"
			>;
			if (payload?.status === "pending") {
				activePermission = {
					...payload,
					updatedAt: signal.createdAt,
				};
				if (payload.blocking) {
					status = "blocked";
					health = "blocked";
				}
			} else if (
				payload?.permissionId &&
				activePermission?.permissionId === payload.permissionId
			) {
				activePermission = null;
			}
		}
	}

	if (status === "cancelled" || status === "closed") {
		activePermission = null;
		health = "closed";
	}

	const nextItems = signals.map(toLiveAcpActivityItem);
	const unboundedActivity = [...(existing?.activity ?? []), ...nextItems];
	const localDroppedCount = Math.max(
		0,
		unboundedActivity.length - MAX_LIVE_ACP_ACTIVITY_ITEMS,
	);
	const activity = unboundedActivity.slice(-MAX_LIVE_ACP_ACTIVITY_ITEMS);

	return {
		sessionId: message.sessionId,
		provider: message.provider,
		status,
		health,
		statusMessage,
		activePermission,
		activity,
		droppedCount:
			(existing?.droppedCount ?? 0) + serverDroppedCount + localDroppedCount,
		lastSequence,
		updatedAt: message.createdAt,
	};
}

export function createLiveRunIndex(
	options: LiveRunIndexOptions = {},
): LiveRunIndex {
	const fetchRunSummary = options.fetchRunSummary ?? defaultFetchRunSummary;
	const listeners = new Set<Listener>();
	const runsById = new Map<string, Run>();
	const runsByProject = new Map<string, Set<string>>();
	const lastEventIdByProject = new Map<string, number>();
	const lastActivityAtByProject = new Map<string, string>();
	const queuedEventsByRun = new Map<string, EventNotificationMessage[]>();
	const queuedAcpMessagesByRun = new Map<string, AcpActivityMessage[]>();
	const pendingHydrations = new Map<string, Promise<Run | null>>();
	const seenAcpSignalIdsByRun = new Map<string, Set<string>>();
	const seenAcpSignalIdOrderByRun = new Map<string, string[]>();

	function buildSnapshot(): LiveRunIndexState {
		return {
			runsById: new Map(runsById),
			runsByProject: new Map(
				Array.from(runsByProject.entries(), ([projectId, runIds]) => [
					projectId,
					new Set(runIds),
				]),
			),
			lastEventIdByProject: new Map(lastEventIdByProject),
			lastActivityAtByProject: new Map(lastActivityAtByProject),
		};
	}

	let snapshotCache = buildSnapshot();

	function emitChange() {
		snapshotCache = buildSnapshot();
		for (const listener of listeners) {
			listener();
		}
	}

	function noteProjectActivity(projectId: string, timestamp: string) {
		const current = lastActivityAtByProject.get(projectId);
		if (current == null || timestamp > current) {
			lastActivityAtByProject.set(projectId, timestamp);
		}
	}

	function noteProjectCursor(projectId: string, eventId: number) {
		const current = lastEventIdByProject.get(projectId);
		if (current == null || eventId > current) {
			lastEventIdByProject.set(projectId, eventId);
		}
	}

	function storeRun(run: Run) {
		const existing = runsById.get(run.id);
		const nextRun = mergeRuns(existing, run);
		if (existing?.projectId && existing.projectId !== nextRun.projectId) {
			const previousProjectRuns = runsByProject.get(existing.projectId);
			previousProjectRuns?.delete(nextRun.id);
			if (previousProjectRuns?.size === 0) {
				runsByProject.delete(existing.projectId);
			}
		}

		runsById.set(nextRun.id, nextRun);

		let projectRuns = runsByProject.get(nextRun.projectId);
		if (!projectRuns) {
			projectRuns = new Set();
			runsByProject.set(nextRun.projectId, projectRuns);
		}
		projectRuns.add(nextRun.id);
		noteProjectActivity(nextRun.projectId, activityTimestampForRun(nextRun));
	}

	function deleteRun(runId: string) {
		const existing = runsById.get(runId);
		if (!existing) {
			return;
		}

		runsById.delete(runId);
		const projectRuns = runsByProject.get(existing.projectId);
		projectRuns?.delete(runId);
		if (projectRuns?.size === 0) {
			runsByProject.delete(existing.projectId);
		}
		queuedAcpMessagesByRun.delete(runId);
		seenAcpSignalIdsByRun.delete(runId);
		seenAcpSignalIdOrderByRun.delete(runId);
	}

	function acceptAcpSignal(runId: string, signalId: string): boolean {
		let seenSignalIds = seenAcpSignalIdsByRun.get(runId);
		let signalIdOrder = seenAcpSignalIdOrderByRun.get(runId);
		if (!seenSignalIds) {
			seenSignalIds = new Set();
			seenAcpSignalIdsByRun.set(runId, seenSignalIds);
		}
		if (!signalIdOrder) {
			signalIdOrder = [];
			seenAcpSignalIdOrderByRun.set(runId, signalIdOrder);
		}

		if (seenSignalIds.has(signalId)) {
			return false;
		}

		seenSignalIds.add(signalId);
		signalIdOrder.push(signalId);
		while (signalIdOrder.length > MAX_LIVE_ACP_SEEN_SIGNAL_IDS) {
			const removed = signalIdOrder.shift();
			if (removed) {
				seenSignalIds.delete(removed);
			}
		}
		return true;
	}

	function reduceRunWithAcpActivity(
		run: Run,
		message: AcpActivityMessage,
	): Run {
		if (run.id !== message.runId || run.projectId !== message.projectId) {
			return run;
		}

		const { signals, droppedCount } = acpSignalsForMessage(message);
		const acceptedSignals = signals.filter((signal) =>
			acceptAcpSignal(run.id, signal.signalId),
		);
		if (acceptedSignals.length === 0) {
			return run;
		}

		return {
			...run,
			liveAcp: reduceLiveAcpState(
				run.liveAcp,
				message,
				acceptedSignals,
				droppedCount,
			),
		};
	}

	async function reconcileUnknownRun(runId: string): Promise<Run | null> {
		const hydratedRun = await fetchRunSummary(runId);
		try {
			if (!hydratedRun) {
				queuedEventsByRun.delete(runId);
				queuedAcpMessagesByRun.delete(runId);
				return null;
			}

			let nextRun = mergeRuns(runsById.get(runId), hydratedRun);
			const queuedMessages = queuedEventsByRun.get(runId) ?? EMPTY_MESSAGES;
			const queuedAcpMessages =
				queuedAcpMessagesByRun.get(runId) ?? EMPTY_ACP_MESSAGES;
			queuedEventsByRun.delete(runId);
			queuedAcpMessagesByRun.delete(runId);

			for (const message of queuedMessages) {
				nextRun = reduceRun(nextRun, message);
			}
			for (const message of queuedAcpMessages) {
				nextRun = reduceRunWithAcpActivity(nextRun, message);
			}

			storeRun(nextRun);
			emitChange();
			return nextRun;
		} finally {
			pendingHydrations.delete(runId);
		}
	}

	function queueEvent(message: EventNotificationMessage) {
		const queued = queuedEventsByRun.get(message.runId);
		if (queued) {
			queued.push(message);
			return;
		}
		queuedEventsByRun.set(message.runId, [message]);
	}

	function queueAcpActivity(message: AcpActivityMessage) {
		const queued = queuedAcpMessagesByRun.get(message.runId);
		if (queued) {
			queued.push(message);
			return;
		}
		queuedAcpMessagesByRun.set(message.runId, [message]);
	}

	return {
		subscribe(listener: Listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		getRun(runId: string) {
			return runsById.get(runId);
		},
		hasRun(runId: string) {
			return runsById.has(runId);
		},
		getRunsForProject(projectId: string) {
			const runIds = runsByProject.get(projectId);
			if (!runIds || runIds.size === 0) {
				return EMPTY_RUNS;
			}
			return Array.from(runIds)
				.map((runId) => runsById.get(runId))
				.filter((run): run is Run => run !== undefined)
				.sort(compareRunsByActivity);
		},
		getAllRuns() {
			if (runsById.size === 0) {
				return EMPTY_RUNS;
			}
			return Array.from(runsById.values()).sort(compareRunsByActivity);
		},
		getProjectRunIds(projectId: string) {
			const runIds = runsByProject.get(projectId);
			if (!runIds || runIds.size === 0) {
				return EMPTY_RUN_IDS;
			}
			return Array.from(runIds);
		},
		getLastEventId(projectId: string) {
			return lastEventIdByProject.get(projectId) ?? null;
		},
		getLastActivityAt(projectId: string) {
			return lastActivityAtByProject.get(projectId) ?? null;
		},
		getSnapshot() {
			return snapshotCache;
		},
		upsertRun(run: Run) {
			storeRun(run);
			emitChange();
		},
		upsertRuns(runs: readonly Run[]) {
			for (const run of runs) {
				storeRun(run);
			}
			emitChange();
		},
		async hydrateRun(runId: string) {
			const existing = runsById.get(runId);
			if (existing) {
				return existing;
			}

			const pending = pendingHydrations.get(runId);
			if (pending) {
				return pending;
			}

			const nextPending = reconcileUnknownRun(runId);
			pendingHydrations.set(runId, nextPending);
			return nextPending;
		},
		async applyEvent(message: EventNotificationMessage) {
			const currentEventId = lastEventIdByProject.get(message.projectId);
			if (currentEventId != null && currentEventId >= message.eventId) {
				return;
			}

			noteProjectCursor(message.projectId, message.eventId);
			noteProjectActivity(message.projectId, message.createdAt);

			const existing = runsById.get(message.runId);
			if (existing) {
				storeRun(reduceRun(existing, message));
				emitChange();
				return;
			}

			queueEvent(message);
			emitChange();

			const pending = pendingHydrations.get(message.runId);
			if (pending) {
				await pending;
				return;
			}

			const nextPending = reconcileUnknownRun(message.runId);
			pendingHydrations.set(message.runId, nextPending);
			await nextPending;
		},
		async applyAcpActivity(message: AcpActivityMessage) {
			const existing = runsById.get(message.runId);
			if (existing) {
				const nextRun = reduceRunWithAcpActivity(existing, message);
				if (nextRun === existing) {
					return;
				}
				storeRun(nextRun);
				noteProjectActivity(message.projectId, message.createdAt);
				emitChange();
				return;
			}

			queueAcpActivity(message);

			const pending = pendingHydrations.get(message.runId);
			if (pending) {
				await pending;
				return;
			}

			const nextPending = reconcileUnknownRun(message.runId);
			pendingHydrations.set(message.runId, nextPending);
			await nextPending;
		},
		applySnapshot(projectId: string, message: StateSnapshotMessage) {
			const currentEventId = lastEventIdByProject.get(projectId);
			if (currentEventId != null && currentEventId >= message.lastEventId) {
				return;
			}

			noteProjectCursor(projectId, message.lastEventId);

			const snapshotRunIds = new Set(message.runs.map((run) => run.id));
			for (const runId of runsByProject.get(projectId) ?? EMPTY_RUN_IDS) {
				const run = runsById.get(runId);
				if (
					run &&
					isLiveAttentionStatus(run.status) &&
					!snapshotRunIds.has(runId)
				) {
					deleteRun(runId);
				}
			}

			for (const snapshotRun of message.runs) {
				const existing = runsById.get(snapshotRun.id);
				if (existing) {
					storeRun(reconcileRunWithSnapshot(existing, snapshotRun));
					continue;
				}

				void this.hydrateRun(snapshotRun.id);
			}

			emitChange();
		},
		applyGlobalSnapshot(message: StateSnapshotMessage) {
			for (const snapshotRun of message.runs) {
				const existing = runsById.get(snapshotRun.id);
				if (existing) {
					storeRun(reconcileRunWithSnapshot(existing, snapshotRun));
					continue;
				}

				void this.hydrateRun(snapshotRun.id);
			}

			emitChange();
		},
		clear() {
			runsById.clear();
			runsByProject.clear();
			lastEventIdByProject.clear();
			lastActivityAtByProject.clear();
			queuedEventsByRun.clear();
			queuedAcpMessagesByRun.clear();
			pendingHydrations.clear();
			seenAcpSignalIdsByRun.clear();
			seenAcpSignalIdOrderByRun.clear();
			emitChange();
		},
	};
}

export const liveRunIndex = createLiveRunIndex();
