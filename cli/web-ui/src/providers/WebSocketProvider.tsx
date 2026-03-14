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
	AttentionCallback,
	ConnectionStatus,
	FileChangedMessage,
	RunArtifactMessage,
	ServerMessage,
	StatusChangedMessage,
	TreeChangedMessage,
} from "../types/websocket";

export type {
	ConnectionStatus,
	FileChangedMessage,
	RunArtifactMessage,
	StatusChangedMessage,
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
	onStatusChange: (callback: (msg: StatusChangedMessage) => void) => () => void;
	onArtifactChange: (callback: (msg: RunArtifactMessage) => void) => () => void;
	subscribeToAttention: (callback: AttentionCallback) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;
const POLLING_INTERVAL = 5000;

interface WebSocketProviderProps {
	children: ReactNode;
	port?: number;
}

export function WebSocketProvider({
	children,
	port = 7710,
}: WebSocketProviderProps) {
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
	const statusChangeListenersRef = useRef<
		Set<(msg: StatusChangedMessage) => void>
	>(new Set());
	const artifactChangeListenersRef = useRef<
		Set<(msg: RunArtifactMessage) => void>
	>(new Set());
	const subscriptionsRef = useRef<Set<string>>(new Set());

	const attentionListenersRef = useRef<Set<AttentionCallback>>(new Set());

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
			const wsUrl = currentProjectId
				? `ws://127.0.0.1:${port}/ws?projectId=${encodeURIComponent(currentProjectId)}`
				: `ws://127.0.0.1:${port}/ws`;
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
			};

			ws.onclose = () => {
				if (!mountedRef.current) return;
				setStatus("disconnected");
				wsRef.current = null;
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
				case "status_changed":
					for (const listener of statusChangeListenersRef.current) {
						listener(message);
					}
					for (const callback of attentionListenersRef.current) {
						callback();
					}
					break;
				case "run:artifact":
					for (const listener of artifactChangeListenersRef.current) {
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
	}, [port, projectId, startPollingFallback, stopPollingFallback]);

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

	const onStatusChange = useCallback(
		(callback: (msg: StatusChangedMessage) => void) => {
			statusChangeListenersRef.current.add(callback);
			return () => {
				statusChangeListenersRef.current.delete(callback);
			};
		},
		[],
	);

	const onArtifactChange = useCallback(
		(callback: (msg: RunArtifactMessage) => void) => {
			artifactChangeListenersRef.current.add(callback);
			return () => {
				artifactChangeListenersRef.current.delete(callback);
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
				onStatusChange,
				onArtifactChange,
				subscribeToAttention,
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
