import type { ServerWebSocket } from "bun";

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

export type ServerMessage =
	| FileChangedMessage
	| TreeChangedMessage
	| HeartbeatMessage
	| ProjectsChangedMessage;
export type ClientMessage =
	| SubscribeMessage
	| UnsubscribeMessage
	| SwitchProjectMessage;

interface ClientData {
	projectPath: string;
}

interface ClientState {
	ws: ServerWebSocket<ClientData>;
	projectId: string | null;
	subscriptions: Set<string>;
	lastPing: number;
}

export class WebSocketHub {
	private clients: Map<ServerWebSocket<ClientData>, ClientState> = new Map();
	private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		this.startHeartbeat();
	}

	addClient(ws: ServerWebSocket<ClientData>, projectId?: string): void {
		this.clients.set(ws, {
			ws,
			projectId: projectId ?? null,
			subscriptions: new Set(),
			lastPing: Date.now(),
		});
		console.log(
			`WebSocket client connected${projectId ? ` for project ${projectId}` : ""}. Total clients: ${this.clients.size}`,
		);
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
}
