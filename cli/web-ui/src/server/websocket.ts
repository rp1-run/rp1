import type { ServerWebSocket } from "bun";
import type { Status } from "../../../shared/events.js";
import type { Annotation, AnnotationReply } from "../types/annotations";

export interface FileChangedMessage {
	type: "file:changed";
	projectId: string;
	path: string;
	changeType: "modify" | "add" | "delete";
	timestamp: string;
}

export interface TreeChangedMessage {
	type: "tree:changed";
	projectId: string;
	timestamp: string;
}

export interface HeartbeatMessage {
	type: "heartbeat";
	timestamp: string;
}

export interface ProjectsChangedMessage {
	type: "projects:changed";
	timestamp: string;
}

export interface EventNotificationMessage {
	type: "event:notification";
	eventId: number;
	eventType: string;
	runId: string;
	projectId: string;
	featureId: string;
	runStatus?: Status | null;
	step: string | null;
	unit?: string | null;
	data: Record<string, unknown> | null;
	createdAt: string;
}

export interface AnnotationCreatedMessage {
	type: "annotation:created";
	annotation: Annotation;
	timestamp: string;
}

export interface AnnotationUpdatedMessage {
	type: "annotation:updated";
	annotation: Annotation;
	timestamp: string;
}

export interface AnnotationResolvedMessage {
	type: "annotation:resolved";
	annotationId: string;
	timestamp: string;
}

export interface AnnotationDeletedMessage {
	type: "annotation:deleted";
	annotationId: string;
	timestamp: string;
}

export interface AnnotationReplyAddedMessage {
	type: "annotation:reply-added";
	annotationId: string;
	reply: AnnotationReply;
	timestamp: string;
}

export interface NotificationCreatedMessage {
	type: "notification:created";
	notification: {
		id: number;
		message: string;
		sourceType: string;
		sourceId: string | null;
		route: string | null;
		projectId: string | null;
		createdAt: string;
	};
}

export interface NotificationDismissedMessage {
	type: "notification:dismissed";
	notificationId: number;
}

export interface SubscribeMessage {
	type: "subscribe";
	path: string;
}

export interface UnsubscribeMessage {
	type: "unsubscribe";
	path: string;
}

export interface SwitchProjectMessage {
	type: "switch-project";
	projectId: string;
}

export interface EventReplayMessage {
	type: "event:replay";
	event: {
		id: number;
		runId: string;
		eventType: string;
		runStatus?: Status | null;
		step: string | null;
		unit?: string | null;
		data: string | null;
		createdAt: string;
	};
}

export interface StateSnapshotMessage {
	type: "state:snapshot";
	runs: Array<{
		id: string;
		flow: string;
		featureId: string;
		projectPath: string;
		status: string;
		steps: Array<{ step: string; status: string }>;
		artifacts: Array<{ docId: string; path: string; type: string }>;
	}>;
	lastEventId: number;
}

export type ServerMessage =
	| FileChangedMessage
	| TreeChangedMessage
	| HeartbeatMessage
	| ProjectsChangedMessage
	| EventNotificationMessage
	| AnnotationCreatedMessage
	| AnnotationUpdatedMessage
	| AnnotationResolvedMessage
	| AnnotationDeletedMessage
	| AnnotationReplyAddedMessage
	| NotificationCreatedMessage
	| NotificationDismissedMessage
	| EventReplayMessage
	| StateSnapshotMessage;
export type ClientMessage =
	| SubscribeMessage
	| UnsubscribeMessage
	| SwitchProjectMessage;

interface ClientData {
	projectPath: string;
	lastEventId?: number;
}

interface ClientState {
	ws: ServerWebSocket<ClientData>;
	projectId: string | null;
	subscriptions: Set<string>;
	lastPing: number;
	lastEventId: number | null;
}

export interface ReplayProvider {
	countEventsSince(afterId: number): number;
	getEventsSince(
		afterId: number,
		limit?: number,
	): Array<{
		id: number;
		runId: string;
		type: string;
		step: string | null;
		unit: string | null;
		data: string | null;
		createdAt: string;
	}>;
	getRunStatus?: (runId: string) => Status | null;
	getActiveRunsSnapshot(): Array<{
		id: string;
		flow: string;
		featureId: string;
		projectPath: string;
		status: string;
		steps: readonly { step: string; status: string }[];
		artifacts: readonly { docId: string; path: string; type: string }[];
	}>;
	getMaxEventId(): number;
}

export class WebSocketHub {
	private clients: Map<ServerWebSocket<ClientData>, ClientState> = new Map();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private replayProvider: ReplayProvider | null = null;

	private static readonly REPLAY_EVENT_CAP = 100;

	constructor() {
		this.startHeartbeat();
	}

	setReplayProvider(provider: ReplayProvider): void {
		this.replayProvider = provider;
	}

	addClient(
		ws: ServerWebSocket<ClientData>,
		projectId?: string,
		lastEventId?: number,
	): void {
		this.clients.set(ws, {
			ws,
			projectId: projectId ?? null,
			subscriptions: new Set(),
			lastPing: Date.now(),
			lastEventId: lastEventId ?? null,
		});
		console.log(
			`WebSocket client connected${projectId ? ` for project ${projectId}` : ""}. Total clients: ${this.clients.size}`,
		);

		if (lastEventId != null && this.replayProvider) {
			this.replayEventsForClient(ws, lastEventId);
		}
	}

	private replayEventsForClient(
		ws: ServerWebSocket<ClientData>,
		lastEventId: number,
	): void {
		if (!this.replayProvider) return;

		const state = this.clients.get(ws);
		if (!state) return;

		try {
			const missedCount = this.replayProvider.countEventsSince(lastEventId);

			if (missedCount === 0) {
				return;
			}

			if (missedCount <= WebSocketHub.REPLAY_EVENT_CAP) {
				const events = this.replayProvider.getEventsSince(lastEventId);
				for (const event of events) {
					const message: EventReplayMessage = {
						type: "event:replay",
						event: {
							id: event.id,
							runId: event.runId,
							eventType: event.type,
							runStatus:
								this.replayProvider.getRunStatus?.(event.runId) ?? null,
							step: event.step,
							unit: event.unit,
							data: event.data,
							createdAt: event.createdAt,
						},
					};
					try {
						ws.send(JSON.stringify(message));
						state.lastEventId = event.id;
					} catch {
						this.removeClient(ws);
						return;
					}
				}
				console.log(`[replay] Replayed ${events.length} events for client`);
			} else {
				const runs = this.replayProvider.getActiveRunsSnapshot();
				const maxEventId = this.replayProvider.getMaxEventId();
				const message: StateSnapshotMessage = {
					type: "state:snapshot",
					runs: runs.map((r) => ({
						id: r.id,
						flow: r.flow,
						featureId: r.featureId,
						projectPath: r.projectPath,
						status: r.status,
						steps: r.steps.map((s) => ({ step: s.step, status: s.status })),
						artifacts: r.artifacts.map((a) => ({
							docId: a.docId,
							path: a.path,
							type: a.type,
						})),
					})),
					lastEventId: maxEventId,
				};
				try {
					ws.send(JSON.stringify(message));
					state.lastEventId = maxEventId;
				} catch {
					this.removeClient(ws);
					return;
				}
				console.log(
					`[replay] Sent snapshot to client (${missedCount} events missed)`,
				);
			}
		} catch (error) {
			console.warn("[replay] Error during event replay:", error);
		}
	}

	removeClient(ws: ServerWebSocket<ClientData>): void {
		this.clients.delete(ws);
		console.log(
			`WebSocket client disconnected. Total clients: ${this.clients.size}`,
		);
	}

	handleMessage(
		ws: ServerWebSocket<ClientData>,
		message: string | ArrayBufferLike | Uint8Array,
	): void {
		const state = this.clients.get(ws);
		if (!state) return;

		state.lastPing = Date.now();

		try {
			const msgStr =
				typeof message === "string"
					? message
					: new TextDecoder().decode(
							message instanceof Uint8Array ? message : new Uint8Array(message),
						);
			const parsed = JSON.parse(msgStr) as ClientMessage;

			switch (parsed.type) {
				case "subscribe":
					state.subscriptions.add(parsed.path);
					break;
				case "unsubscribe":
					state.subscriptions.delete(parsed.path);
					break;
				case "switch-project":
					state.projectId = parsed.projectId;
					console.log(`Client switched to project: ${parsed.projectId}`);
					break;
			}
		} catch {
			console.warn("Failed to parse WebSocket message");
		}
	}

	broadcast(message: ServerMessage): void {
		const data = JSON.stringify(message);
		for (const state of this.clients.values()) {
			try {
				state.ws.send(data);
			} catch {
				this.removeClient(state.ws);
			}
		}
	}

	broadcastFileChange(
		projectId: string,
		path: string,
		changeType: "modify" | "add" | "delete",
	): void {
		const message: FileChangedMessage = {
			type: "file:changed",
			projectId,
			path,
			changeType,
			timestamp: new Date().toISOString(),
		};

		const data = JSON.stringify(message);
		for (const state of this.clients.values()) {
			const isProjectMatch =
				state.projectId === null || state.projectId === projectId;
			const isSubscribed =
				state.subscriptions.size === 0 || state.subscriptions.has(path);

			if (isProjectMatch && isSubscribed) {
				try {
					state.ws.send(data);
				} catch {
					this.removeClient(state.ws);
				}
			}
		}
	}

	broadcastTreeChange(projectId: string): void {
		const message: TreeChangedMessage = {
			type: "tree:changed",
			projectId,
			timestamp: new Date().toISOString(),
		};

		const data = JSON.stringify(message);
		for (const state of this.clients.values()) {
			const isProjectMatch =
				state.projectId === null || state.projectId === projectId;

			if (isProjectMatch) {
				try {
					state.ws.send(data);
				} catch {
					this.removeClient(state.ws);
				}
			}
		}
	}

	broadcastProjectsChanged(): void {
		const message: ProjectsChangedMessage = {
			type: "projects:changed",
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastEvent(
		projectId: string,
		eventId: number,
		eventType: string,
		runId: string,
		featureId: string,
		runStatus: Status | null,
		step: string | null,
		unit: string | null,
		data: Record<string, unknown> | null,
		createdAt: string,
	): void {
		const message: EventNotificationMessage = {
			type: "event:notification",
			eventId,
			eventType,
			runId,
			projectId,
			featureId,
			runStatus,
			step,
			unit,
			data,
			createdAt,
		};

		const serialized = JSON.stringify(message);
		for (const state of this.clients.values()) {
			const isProjectMatch =
				state.projectId === null || state.projectId === projectId;

			if (isProjectMatch) {
				try {
					state.ws.send(serialized);
					state.lastEventId = eventId;
				} catch {
					this.removeClient(state.ws);
				}
			}
		}
	}

	private startHeartbeat(): void {
		const HEARTBEAT_INTERVAL = 30_000;
		const STALE_THRESHOLD = 90_000;

		this.heartbeatInterval = setInterval(() => {
			const now = Date.now();
			const heartbeat: HeartbeatMessage = {
				type: "heartbeat",
				timestamp: new Date().toISOString(),
			};
			const data = JSON.stringify(heartbeat);

			for (const [ws, state] of this.clients.entries()) {
				if (now - state.lastPing > STALE_THRESHOLD) {
					console.log("Closing stale WebSocket connection");
					try {
						ws.close();
					} catch {
						/* ignore */
					}
					this.clients.delete(ws);
					continue;
				}

				try {
					ws.send(data);
				} catch {
					this.removeClient(ws);
				}
			}
		}, HEARTBEAT_INTERVAL);
	}

	stop(): void {
		if (this.heartbeatInterval) {
			clearInterval(this.heartbeatInterval);
			this.heartbeatInterval = null;
		}
		for (const ws of this.clients.keys()) {
			try {
				ws.close();
			} catch {
				/* ignore */
			}
		}
		this.clients.clear();
	}

	get clientCount(): number {
		return this.clients.size;
	}

	getClientProject(ws: ServerWebSocket<ClientData>): string | null {
		return this.clients.get(ws)?.projectId ?? null;
	}

	setClientProject(ws: ServerWebSocket<ClientData>, projectId: string): void {
		const state = this.clients.get(ws);
		if (state) {
			state.projectId = projectId;
		}
	}

	getClientCountForProject(projectId: string): number {
		let count = 0;
		for (const state of this.clients.values()) {
			if (state.projectId === projectId) {
				count++;
			}
		}
		return count;
	}

	broadcastAnnotationCreated(annotation: Annotation): void {
		const message: AnnotationCreatedMessage = {
			type: "annotation:created",
			annotation,
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastAnnotationUpdated(annotation: Annotation): void {
		const message: AnnotationUpdatedMessage = {
			type: "annotation:updated",
			annotation,
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastAnnotationResolved(annotationId: string): void {
		const message: AnnotationResolvedMessage = {
			type: "annotation:resolved",
			annotationId,
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastAnnotationDeleted(annotationId: string): void {
		const message: AnnotationDeletedMessage = {
			type: "annotation:deleted",
			annotationId,
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastAnnotationReplyAdded(
		annotationId: string,
		reply: AnnotationReply,
	): void {
		const message: AnnotationReplyAddedMessage = {
			type: "annotation:reply-added",
			annotationId,
			reply,
			timestamp: new Date().toISOString(),
		};
		this.broadcast(message);
	}

	broadcastNotificationCreated(notification: {
		id: number;
		message: string;
		sourceType: string;
		sourceId: string | null;
		route: string | null;
		projectId: string | null;
		createdAt: string;
	}): void {
		const msg: NotificationCreatedMessage = {
			type: "notification:created",
			notification,
		};

		const serialized = JSON.stringify(msg);
		for (const state of this.clients.values()) {
			const isProjectMatch =
				notification.projectId === null ||
				state.projectId === null ||
				state.projectId === notification.projectId;

			if (isProjectMatch) {
				try {
					state.ws.send(serialized);
				} catch {
					this.removeClient(state.ws);
				}
			}
		}
	}

	broadcastNotificationDismissed(notificationId: number): void {
		const msg: NotificationDismissedMessage = {
			type: "notification:dismissed",
			notificationId,
		};
		this.broadcast(msg);
	}
}
