import { randomUUID } from "node:crypto";
import type { ServerWebSocket } from "bun";
import type { ArtifactLocationKind, Status } from "../../../shared/events.js";
import type { Annotation, AnnotationReply } from "../types/annotations";
import {
	type ArcadeReconnectPolicy,
	DEFAULT_ARCADE_RECONNECT_POLICY,
} from "../types/runtime";

export type WebSocketActivityScope = "global" | "project";

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
	heartbeatId: string;
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

export interface HeartbeatAckMessage {
	type: "heartbeat:ack";
	heartbeatId: string;
	receivedAt: string;
}

export interface EventReplayMessage {
	type: "event:replay";
	scope: WebSocketActivityScope;
	event: {
		id: number;
		runId: string;
		projectId: string;
		featureId: string;
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
	scope: WebSocketActivityScope;
	projectId: string | null;
	runs: Array<{
		id: string;
		projectId: string;
		flow: string;
		featureId: string;
		projectPath: string;
		status: string;
		steps: Array<{ step: string; status: string }>;
		artifacts: Array<{
			docId: string;
			path: string;
			type: string;
			locationKind?: ArtifactLocationKind;
			url?: string | null;
			label?: string | null;
			relationship?: string | null;
			sourceContext?: string | null;
			sourceArtifactPath?: string | null;
		}>;
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
	| SwitchProjectMessage
	| HeartbeatAckMessage;

interface ClientData {
	projectPath: string;
	scope?: WebSocketActivityScope;
	projectId?: string;
	lastEventId?: number;
}

interface ClientState {
	ws: ServerWebSocket<ClientData>;
	scope: WebSocketActivityScope;
	projectId: string | null;
	subscriptions: Set<string>;
	lastHeartbeatAckAt: number;
	pendingHeartbeatId: string | null;
	missedHeartbeatCount: number;
	lastEventId: number | null;
}

interface ReplayRunContext {
	projectId: string;
	featureId: string;
	runStatus: Status | null;
}

interface ReplayEventWithContext {
	event: ReturnType<ReplayProvider["getEventsSince"]>[number];
	context: ReplayRunContext;
}

export interface ReplayProvider {
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
	getRunContext?: (runId: string) => ReplayRunContext | null;
	getRunStatus?: (runId: string) => Status | null;
	getActiveRunsSnapshot(): Array<{
		id: string;
		flow: string;
		featureId: string;
		projectPath: string;
		status: string;
		steps: readonly { step: string; status: string }[];
		artifacts: readonly {
			docId: string;
			path: string;
			type: string;
			locationKind?: ArtifactLocationKind;
			url?: string | null;
			label?: string | null;
			relationship?: string | null;
			sourceContext?: string | null;
			sourceArtifactPath?: string | null;
		}[];
	}>;
	getMaxEventId(): number;
}

export class WebSocketHub {
	private clients: Map<ServerWebSocket<ClientData>, ClientState> = new Map();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
	private replayProvider: ReplayProvider | null = null;
	private readonly reconnectPolicy: ArcadeReconnectPolicy;

	private static readonly REPLAY_EVENT_CAP = 100;

	constructor(
		reconnectPolicy: ArcadeReconnectPolicy = DEFAULT_ARCADE_RECONNECT_POLICY,
	) {
		this.reconnectPolicy = reconnectPolicy;
		this.startHeartbeat();
	}

	setReplayProvider(provider: ReplayProvider): void {
		this.replayProvider = provider;
	}

	addClient(
		ws: ServerWebSocket<ClientData>,
		options: {
			scope?: WebSocketActivityScope;
			projectId?: string;
			lastEventId?: number;
		} = {},
	): void {
		const scope = options.scope ?? (options.projectId ? "project" : "global");
		const projectId = scope === "project" ? (options.projectId ?? null) : null;
		const lastEventId = options.lastEventId;
		this.clients.set(ws, {
			ws,
			scope,
			projectId,
			subscriptions: new Set(),
			lastHeartbeatAckAt: Date.now(),
			pendingHeartbeatId: null,
			missedHeartbeatCount: 0,
			lastEventId: lastEventId ?? null,
		});
		const scopeLabel =
			scope === "project" && projectId ? `project ${projectId}` : "global";
		console.log(
			`WebSocket client connected for ${scopeLabel}. Total clients: ${this.clients.size}`,
		);

		if (lastEventId != null && this.replayProvider) {
			this.replayEventsForClient(ws, lastEventId);
		}
	}

	private clientReceivesProject(
		state: ClientState,
		projectId: string,
	): boolean {
		return state.scope === "global" || state.projectId === projectId;
	}

	private resolveReplayRunContext(
		runId: string,
		state: ClientState,
	): ReplayRunContext | null {
		if (!this.replayProvider) return null;

		const context = this.replayProvider.getRunContext?.(runId);
		if (context) {
			return context;
		}

		if (state.scope === "project" && state.projectId) {
			return {
				projectId: state.projectId,
				featureId: "",
				runStatus: this.replayProvider.getRunStatus?.(runId) ?? null,
			};
		}

		return null;
	}

	private getReplayEventsForClient(
		state: ClientState,
		lastEventId: number,
	): ReplayEventWithContext[] {
		if (!this.replayProvider) return [];

		const events = this.replayProvider.getEventsSince(lastEventId);
		const replayableEvents: ReplayEventWithContext[] = [];

		for (const event of events) {
			const context = this.resolveReplayRunContext(event.runId, state);
			if (!context || !this.clientReceivesProject(state, context.projectId)) {
				continue;
			}
			replayableEvents.push({ event, context });
		}

		return replayableEvents;
	}

	private replayEventsForClient(
		ws: ServerWebSocket<ClientData>,
		lastEventId: number,
	): void {
		if (!this.replayProvider) return;

		const state = this.clients.get(ws);
		if (!state) return;

		try {
			const replayEvents = this.getReplayEventsForClient(state, lastEventId);
			const missedCount = replayEvents.length;

			if (missedCount === 0) {
				return;
			}

			if (missedCount <= WebSocketHub.REPLAY_EVENT_CAP) {
				for (const { event, context } of replayEvents) {
					const message: EventReplayMessage = {
						type: "event:replay",
						scope: state.scope,
						event: {
							id: event.id,
							runId: event.runId,
							projectId: context.projectId,
							featureId: context.featureId,
							eventType: event.type,
							runStatus: context.runStatus,
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
				console.log(
					`[replay] Replayed ${replayEvents.length} events for ${state.scope} client`,
				);
			} else {
				const runs = this.replayProvider
					.getActiveRunsSnapshot()
					.flatMap((run) => {
						const context = this.resolveReplayRunContext(run.id, state);
						if (
							!context ||
							!this.clientReceivesProject(state, context.projectId)
						) {
							return [];
						}

						return [
							{
								run,
								context,
							},
						];
					});
				const maxEventId = this.replayProvider.getMaxEventId();
				const message: StateSnapshotMessage = {
					type: "state:snapshot",
					scope: state.scope,
					projectId: state.scope === "project" ? state.projectId : null,
					runs: runs.map(({ run, context }) => ({
						id: run.id,
						projectId: context.projectId,
						flow: run.flow,
						featureId: context.featureId,
						projectPath: run.projectPath,
						status: run.status,
						steps: run.steps.map((s) => ({ step: s.step, status: s.status })),
						artifacts: run.artifacts.map((a) => ({
							docId: a.docId,
							path: a.path,
							type: a.type,
							locationKind: a.locationKind,
							url: a.url,
							label: a.label,
							relationship: a.relationship,
							sourceContext: a.sourceContext,
							sourceArtifactPath: a.sourceArtifactPath,
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
					state.scope = "project";
					state.projectId = parsed.projectId;
					console.log(`Client switched to project: ${parsed.projectId}`);
					break;
				case "heartbeat:ack":
					if (parsed.heartbeatId === state.pendingHeartbeatId) {
						state.pendingHeartbeatId = null;
						state.missedHeartbeatCount = 0;
						state.lastHeartbeatAckAt = Date.now();
					}
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
			const isProjectMatch = this.clientReceivesProject(state, projectId);
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
			const isProjectMatch = this.clientReceivesProject(state, projectId);

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
			const isProjectMatch = this.clientReceivesProject(state, projectId);

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
		const { heartbeatIntervalMs, heartbeatMissThreshold } =
			this.reconnectPolicy;

		this.heartbeatInterval = setInterval(() => {
			for (const [ws, state] of this.clients.entries()) {
				if (state.pendingHeartbeatId !== null) {
					state.missedHeartbeatCount += 1;
				}

				if (state.missedHeartbeatCount >= heartbeatMissThreshold) {
					console.log(
						"Closing WebSocket connection after missed heartbeat acknowledgements",
					);
					try {
						ws.close();
					} catch {
						/* ignore */
					}
					this.clients.delete(ws);
					continue;
				}

				const heartbeat: HeartbeatMessage = {
					type: "heartbeat",
					heartbeatId: randomUUID(),
					timestamp: new Date().toISOString(),
				};
				state.pendingHeartbeatId = heartbeat.heartbeatId;

				try {
					ws.send(JSON.stringify(heartbeat));
				} catch {
					this.removeClient(ws);
				}
			}
		}, heartbeatIntervalMs);
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
				this.clientReceivesProject(state, notification.projectId);

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
