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
	AnnotationMessage,
	AttentionCallback,
	ConnectionStatus,
	EventNotificationMessage,
	FileChangedMessage,
	NotificationMessage,
	ProjectsChangedMessage,
	ServerMessage,
	TreeChangedMessage,
} from "../types/websocket";

export type {
	ConnectionStatus,
	EventNotificationMessage,
	FileChangedMessage,
	NotificationMessage,
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
	onProjectsChange: (
		callback: (msg: ProjectsChangedMessage) => void,
	) => () => void;
	onAnnotationMessage: (
		callback: (msg: AnnotationMessage) => void,
	) => () => void;
	onNotification: (callback: (msg: NotificationMessage) => void) => () => void;
	subscribeToAttention: (callback: AttentionCallback) => () => void;
	subscribeToReconnect: (callback: () => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;
const POLLING_INTERVAL = 5000;

interface WebSocketProviderProps {
	children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [projectId, setProjectIdState] = useState<string | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);
	const mountedRef = useRef(true);
	const projectIdRef = useRef<string | null>(null);
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
	const notificationListenersRef = useRef<
		Set<(msg: NotificationMessage) => void>
	>(new Set());
	const subscriptionsRef = useRef<Set<string>>(new Set());
	const attentionListenersRef = useRef<Set<AttentionCallback>>(new Set());
	const reconnectListenersRef = useRef<Set<() => void>>(new Set());
	const notifyReconnectRef = useRef(false);

	const startPollingFallback = useCallback(() => {
		if (pollingIntervalRef.current) return;

		pollingIntervalRef.current = setInterval(() => {
			for (const callback of attentionListenersRef.current) {
				callback();
			}
		}, POLLING_INTERVAL);
	}, []);

	const stopPollingFallback = useCallback(() => {
		if (pollingIntervalRef.current) {
			clearInterval(pollingIntervalRef.current);
			pollingIntervalRef.current = null;
		}
	}, []);

	useEffect(() => {
		mountedRef.current = true;
		projectIdRef.current = projectId;

		function connect() {
			if (!mountedRef.current) return;
			if (wsRef.current?.readyState === WebSocket.OPEN) return;
			if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

			setStatus("connecting");

			const currentProjectId = projectIdRef.current;
			const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
			const wsUrl = currentProjectId
				? `${wsProto}://${window.location.host}/ws?projectId=${encodeURIComponent(currentProjectId)}`
				: `${wsProto}://${window.location.host}/ws`;
			const ws = new WebSocket(wsUrl);

			ws.onopen = () => {
				if (!mountedRef.current) {
					ws.close();
					return;
				}
				setStatus("connected");
				reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;
				stopPollingFallback();

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
				startPollingFallback();
				scheduleReconnect();
			};

			ws.onerror = () => {
				ws.close();
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data) as ServerMessage;
					routeMessage(message);
				} catch {
					console.warn("Failed to parse WebSocket message");
				}
			};

			wsRef.current = ws;
		}

		function routeMessage(message: ServerMessage) {
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
					for (const listener of eventNotificationListenersRef.current) {
						listener(message);
					}
					for (const callback of attentionListenersRef.current) {
						callback();
					}
					break;
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
				case "notification:created":
				case "notification:dismissed":
					for (const listener of notificationListenersRef.current) {
						listener(message);
					}
					break;
				case "heartbeat":
					break;
			}
		}

		function scheduleReconnect() {
			if (!mountedRef.current) return;
			if (reconnectTimeoutRef.current) return;

			reconnectTimeoutRef.current = setTimeout(() => {
				reconnectTimeoutRef.current = null;
				if (!mountedRef.current) return;
				reconnectDelayRef.current = Math.min(
					reconnectDelayRef.current * RECONNECT_BACKOFF_FACTOR,
					MAX_RECONNECT_DELAY,
				);
				connect();
			}, reconnectDelayRef.current);
		}

		connect();

		return () => {
			mountedRef.current = false;
			stopPollingFallback();
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [projectId, startPollingFallback, stopPollingFallback]);

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

	const onNotification = useCallback(
		(callback: (msg: NotificationMessage) => void) => {
			notificationListenersRef.current.add(callback);
			return () => {
				notificationListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onProjectsChange = useCallback(
		(callback: (msg: ProjectsChangedMessage) => void) => {
			projectsChangeListenersRef.current.add(callback);
			return () => {
				projectsChangeListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const subscribeToAttention = useCallback((callback: AttentionCallback) => {
		attentionListenersRef.current.add(callback);
		return () => {
			attentionListenersRef.current.delete(callback);
		};
	}, []);

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
				onProjectsChange,
				onAnnotationMessage,
				onNotification,
				subscribeToAttention,
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
