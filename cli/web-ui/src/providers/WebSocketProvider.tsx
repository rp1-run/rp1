import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

import type {
	AcpActivityMessage,
	AnnotationMessage,
	ConnectionStatus,
	EventNotificationMessage,
	EventReplayMessage,
	FileChangedMessage,
	HeartbeatAckMessage,
	NotificationMessage,
	ProjectsChangedMessage,
	ServerMessage,
	StateSnapshotCallback,
	TreeChangedMessage,
	WebSocketActivityScope,
} from "../types/websocket";
import { useRuntimeContract } from "./RuntimeProvider";

export type {
	AcpActivityMessage,
	ConnectionStatus,
	EventNotificationMessage,
	FileChangedMessage,
	NotificationMessage,
	StateSnapshotMessage,
	TreeChangedMessage,
} from "../types/websocket";

interface WebSocketContextValue {
	status: ConnectionStatus;
	projectId: string | null;
	setProjectId: (projectId: string | null) => void;
	subscribe: (path: string) => void;
	unsubscribe: (path: string) => void;
	onFileChange: (callback: (msg: FileChangedMessage) => void) => () => void;
	onTreeChange: (callback: (msg: TreeChangedMessage) => void) => () => void;
	onEventNotification: (
		callback: (msg: EventNotificationMessage) => void,
	) => () => void;
	onStateSnapshot: (callback: StateSnapshotCallback) => () => void;
	onProjectsChange: (
		callback: (msg: ProjectsChangedMessage) => void,
	) => () => void;
	onAnnotationMessage: (
		callback: (msg: AnnotationMessage) => void,
	) => () => void;
	onAcpActivity: (callback: (msg: AcpActivityMessage) => void) => () => void;
	onNotification: (callback: (msg: NotificationMessage) => void) => () => void;
	subscribeToReconnect: (callback: () => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const LAST_EVENT_ID_STORAGE_PREFIX = "rp1:last-event-id:";
const GLOBAL_ACTIVITY_SCOPE_KEY = "global";

interface ActivitySocketScope {
	readonly scope: WebSocketActivityScope;
	readonly storageKey: string;
	readonly projectId: string | null;
}

function getActivitySocketScope(projectId: string | null): ActivitySocketScope {
	if (projectId) {
		return { scope: "project", storageKey: projectId, projectId };
	}

	return {
		scope: "global",
		storageKey: GLOBAL_ACTIVITY_SCOPE_KEY,
		projectId: null,
	};
}

interface WebSocketProviderProps {
	children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
	const runtime = useRuntimeContract();
	const reconnectPolicy = runtime.reconnectPolicy;
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [projectId, setProjectIdState] = useState<string | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectDelayRef = useRef(reconnectPolicy.initialDelayMs);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const mountedRef = useRef(true);
	const projectIdRef = useRef<string | null>(null);
	const lastEventIdByScopeRef = useRef<Map<string, number>>(new Map());
	const fileChangeListenersRef = useRef<Set<(msg: FileChangedMessage) => void>>(
		new Set(),
	);
	const treeChangeListenersRef = useRef<Set<(msg: TreeChangedMessage) => void>>(
		new Set(),
	);
	const eventNotificationListenersRef = useRef<
		Set<(msg: EventNotificationMessage) => void>
	>(new Set());
	const projectsChangeListenersRef = useRef<
		Set<(msg: ProjectsChangedMessage) => void>
	>(new Set());
	const annotationListenersRef = useRef<Set<(msg: AnnotationMessage) => void>>(
		new Set(),
	);
	const acpActivityListenersRef = useRef<
		Set<(msg: AcpActivityMessage) => void>
	>(new Set());
	const notificationListenersRef = useRef<
		Set<(msg: NotificationMessage) => void>
	>(new Set());
	const snapshotListenersRef = useRef<Set<StateSnapshotCallback>>(new Set());
	const subscriptionsRef = useRef<Set<string>>(new Set());
	const reconnectListenersRef = useRef<Set<() => void>>(new Set());
	const notifyReconnectRef = useRef(false);

	const readStoredLastEventId = useCallback(
		(storageKey: string): number | null => {
			const cached = lastEventIdByScopeRef.current.get(storageKey);
			if (cached != null) {
				return cached;
			}

			try {
				const storedValue = sessionStorage.getItem(
					`${LAST_EVENT_ID_STORAGE_PREFIX}${storageKey}`,
				);
				if (storedValue == null) {
					return null;
				}
				const parsedValue = Number.parseInt(storedValue, 10);
				if (Number.isNaN(parsedValue)) {
					return null;
				}
				lastEventIdByScopeRef.current.set(storageKey, parsedValue);
				return parsedValue;
			} catch {
				return null;
			}
		},
		[],
	);

	const advanceLastEventId = useCallback(
		(storageKey: string, eventId: number) => {
			const currentValue = readStoredLastEventId(storageKey);
			if (currentValue != null && currentValue >= eventId) {
				return;
			}

			lastEventIdByScopeRef.current.set(storageKey, eventId);
			try {
				sessionStorage.setItem(
					`${LAST_EVENT_ID_STORAGE_PREFIX}${storageKey}`,
					String(eventId),
				);
			} catch {}
		},
		[readStoredLastEventId],
	);

	const parseReplayEventData = useCallback(
		(rawData: string | null): Record<string, unknown> | null => {
			if (rawData == null) {
				return null;
			}

			try {
				const parsed = JSON.parse(rawData) as unknown;
				return parsed !== null && typeof parsed === "object"
					? (parsed as Record<string, unknown>)
					: null;
			} catch {
				return null;
			}
		},
		[],
	);

	const normalizeReplayMessage = useCallback(
		(
			message: EventReplayMessage,
			targetProjectId: string | null,
		): EventNotificationMessage | null => {
			const messageProjectId = message.event.projectId ?? targetProjectId;
			if (messageProjectId == null) {
				return null;
			}

			return {
				type: "event:notification",
				eventId: message.event.id,
				eventType: message.event.eventType,
				runId: message.event.runId,
				projectId: messageProjectId,
				featureId: message.event.featureId ?? "",
				runStatus: message.event.runStatus ?? null,
				step: message.event.step,
				unit: message.event.unit ?? null,
				data: parseReplayEventData(message.event.data),
				createdAt: message.event.createdAt,
			};
		},
		[parseReplayEventData],
	);

	const advanceEventCursors = useCallback(
		(message: EventNotificationMessage, scope: WebSocketActivityScope) => {
			if (scope === "global") {
				advanceLastEventId(GLOBAL_ACTIVITY_SCOPE_KEY, message.eventId);
			}
			if (message.projectId) {
				advanceLastEventId(message.projectId, message.eventId);
			}
		},
		[advanceLastEventId],
	);

	const emitEventNotification = useCallback(
		(message: EventNotificationMessage) => {
			for (const listener of eventNotificationListenersRef.current) {
				listener(message);
			}
		},
		[],
	);

	useEffect(() => {
		mountedRef.current = true;
		projectIdRef.current = projectId;

		function connect() {
			if (!mountedRef.current) return;
			if (wsRef.current?.readyState === WebSocket.OPEN) return;
			if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

			setStatus("connecting");

			const currentProjectId = projectIdRef.current;
			const activityScope = getActivitySocketScope(currentProjectId);
			const runtimeBaseUrl = new URL(runtime.baseUrl);
			const wsProto = runtimeBaseUrl.protocol === "https:" ? "wss" : "ws";
			const wsUrl = (() => {
				const query = new URLSearchParams();
				query.set("scope", activityScope.scope);
				if (activityScope.projectId) {
					query.set("projectId", activityScope.projectId);
				}
				const lastEventId = readStoredLastEventId(activityScope.storageKey);
				if (lastEventId != null) {
					query.set("lastEventId", String(lastEventId));
				}
				const queryString = query.toString();
				return `${wsProto}://${runtimeBaseUrl.host}/ws${queryString ? `?${queryString}` : ""}`;
			})();
			const ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				if (!mountedRef.current) {
					ws.close();
					return;
				}
				setStatus("connected");
				reconnectDelayRef.current = reconnectPolicy.initialDelayMs;

				for (const path of subscriptionsRef.current) {
					ws.send(JSON.stringify({ type: "subscribe", path }));
				}

				if (notifyReconnectRef.current) {
					notifyReconnectRef.current = false;
					for (const callback of reconnectListenersRef.current) {
						callback();
					}
				}
			};

			ws.onclose = () => {
				if (!mountedRef.current) return;
				setStatus("disconnected");
				wsRef.current = null;
				notifyReconnectRef.current = true;
				scheduleReconnect();
			};

			ws.onerror = () => {
				ws.close();
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data) as ServerMessage;
					routeMessage(message, ws);
				} catch {
					console.warn("Failed to parse WebSocket message");
				}
			};

			wsRef.current = ws;
		}

		function routeMessage(message: ServerMessage, socket: WebSocket) {
			switch (message.type) {
				case "file:changed":
					for (const listener of fileChangeListenersRef.current) {
						listener(message);
					}
					break;
				case "tree:changed":
					for (const listener of treeChangeListenersRef.current) {
						listener(message);
					}
					break;
				case "event:notification":
					advanceEventCursors(
						message,
						getActivitySocketScope(projectIdRef.current).scope,
					);
					emitEventNotification(message);
					break;
				case "event:replay": {
					const normalizedMessage = normalizeReplayMessage(
						message,
						projectIdRef.current,
					);
					if (normalizedMessage) {
						advanceEventCursors(
							normalizedMessage,
							message.scope ??
								getActivitySocketScope(projectIdRef.current).scope,
						);
						emitEventNotification(normalizedMessage);
					}
					break;
				}
				case "state:snapshot": {
					const snapshotScope =
						message.scope ?? getActivitySocketScope(projectIdRef.current).scope;
					if (snapshotScope === "global") {
						advanceLastEventId(GLOBAL_ACTIVITY_SCOPE_KEY, message.lastEventId);
					} else {
						const snapshotProjectId = message.projectId ?? projectIdRef.current;
						if (snapshotProjectId != null) {
							advanceLastEventId(snapshotProjectId, message.lastEventId);
						}
					}
					for (const listener of snapshotListenersRef.current) {
						listener(message);
					}
					break;
				}
				case "projects:changed":
					for (const listener of projectsChangeListenersRef.current) {
						listener(message);
					}
					break;
				case "annotation:created":
				case "annotation:updated":
				case "annotation:resolved":
				case "annotation:deleted":
				case "annotation:reply-added":
					for (const listener of annotationListenersRef.current) {
						listener(message);
					}
					break;
				case "acp:activity":
					for (const listener of acpActivityListenersRef.current) {
						listener(message);
					}
					break;
				case "notification:created":
				case "notification:dismissed":
					for (const listener of notificationListenersRef.current) {
						listener(message);
					}
					break;
				case "heartbeat": {
					if (socket.readyState === WebSocket.OPEN) {
						const acknowledgement: HeartbeatAckMessage = {
							type: "heartbeat:ack",
							heartbeatId: message.heartbeatId,
							receivedAt: new Date().toISOString(),
						};
						socket.send(JSON.stringify(acknowledgement));
					}
					break;
				}
			}
		}

		function scheduleReconnect() {
			if (!mountedRef.current) return;
			if (reconnectTimeoutRef.current) return;

			reconnectTimeoutRef.current = setTimeout(() => {
				reconnectTimeoutRef.current = null;
				if (!mountedRef.current) return;
				reconnectDelayRef.current = Math.min(
					reconnectDelayRef.current * reconnectPolicy.backoffFactor,
					reconnectPolicy.maxDelayMs,
				);
				connect();
			}, reconnectDelayRef.current);
		}

		connect();

		return () => {
			mountedRef.current = false;
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [
		projectId,
		advanceLastEventId,
		advanceEventCursors,
		emitEventNotification,
		normalizeReplayMessage,
		readStoredLastEventId,
		reconnectPolicy.backoffFactor,
		reconnectPolicy.initialDelayMs,
		reconnectPolicy.maxDelayMs,
		runtime.baseUrl,
	]);

	const subscribe = useCallback((path: string) => {
		subscriptionsRef.current.add(path);
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "subscribe", path }));
		}
	}, []);

	const unsubscribe = useCallback((path: string) => {
		subscriptionsRef.current.delete(path);
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify({ type: "unsubscribe", path }));
		}
	}, []);

	const onFileChange = useCallback(
		(callback: (msg: FileChangedMessage) => void) => {
			fileChangeListenersRef.current.add(callback);
			return () => {
				fileChangeListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onTreeChange = useCallback(
		(callback: (msg: TreeChangedMessage) => void) => {
			treeChangeListenersRef.current.add(callback);
			return () => {
				treeChangeListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onEventNotification = useCallback(
		(callback: (msg: EventNotificationMessage) => void) => {
			eventNotificationListenersRef.current.add(callback);
			return () => {
				eventNotificationListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onAnnotationMessage = useCallback(
		(callback: (msg: AnnotationMessage) => void) => {
			annotationListenersRef.current.add(callback);
			return () => {
				annotationListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onAcpActivity = useCallback(
		(callback: (msg: AcpActivityMessage) => void) => {
			acpActivityListenersRef.current.add(callback);
			return () => {
				acpActivityListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onNotification = useCallback(
		(callback: (msg: NotificationMessage) => void) => {
			notificationListenersRef.current.add(callback);
			return () => {
				notificationListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onStateSnapshot = useCallback((callback: StateSnapshotCallback) => {
		snapshotListenersRef.current.add(callback);
		return () => {
			snapshotListenersRef.current.delete(callback);
		};
	}, []);

	const onProjectsChange = useCallback(
		(callback: (msg: ProjectsChangedMessage) => void) => {
			projectsChangeListenersRef.current.add(callback);
			return () => {
				projectsChangeListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const subscribeToReconnect = useCallback((callback: () => void) => {
		reconnectListenersRef.current.add(callback);
		return () => {
			reconnectListenersRef.current.delete(callback);
		};
	}, []);

	const setProjectId = useCallback((newProjectId: string | null) => {
		setProjectIdState(newProjectId);
	}, []);

	return (
		<WebSocketContext.Provider
			value={{
				status,
				projectId,
				setProjectId,
				subscribe,
				unsubscribe,
				onFileChange,
				onTreeChange,
				onEventNotification,
				onStateSnapshot,
				onProjectsChange,
				onAnnotationMessage,
				onAcpActivity,
				onNotification,
				subscribeToReconnect,
			}}
		>
			{children}
		</WebSocketContext.Provider>
	);
}

export function useWebSocket(): WebSocketContextValue {
	const context = useContext(WebSocketContext);
	if (!context) {
		throw new Error("useWebSocket must be used within a WebSocketProvider");
	}
	return context;
}
