import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";

interface FileChangedMessage {
	type: "file:changed";
	path: string;
	changeType: "modify" | "add" | "delete";
	timestamp: string;
}

interface TreeChangedMessage {
	type: "tree:changed";
	timestamp: string;
}

interface HeartbeatMessage {
	type: "heartbeat";
	timestamp: string;
}

type ServerMessage = FileChangedMessage | TreeChangedMessage | HeartbeatMessage;

type ConnectionStatus = "connecting" | "connected" | "disconnected";

interface WebSocketContextValue {
	status: ConnectionStatus;
	subscribe: (path: string) => void;
	unsubscribe: (path: string) => void;
	onFileChange: (callback: (msg: FileChangedMessage) => void) => () => void;
	onTreeChange: (callback: (msg: TreeChangedMessage) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

const INITIAL_RECONNECT_DELAY = 2000;
const MAX_RECONNECT_DELAY = 30000;
const RECONNECT_BACKOFF_FACTOR = 2;

interface WebSocketProviderProps {
	children: ReactNode;
	port?: number;
}

export function WebSocketProvider({
	children,
	port = 7710,
}: WebSocketProviderProps) {
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectDelayRef = useRef(INITIAL_RECONNECT_DELAY);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);
	const mountedRef = useRef(true);
	const fileChangeListenersRef = useRef<Set<(msg: FileChangedMessage) => void>>(
		new Set(),
	);
	const treeChangeListenersRef = useRef<Set<(msg: TreeChangedMessage) => void>>(
		new Set(),
	);
	const subscriptionsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		mountedRef.current = true;

		function connect() {
			if (!mountedRef.current) return;
			if (wsRef.current?.readyState === WebSocket.OPEN) return;
			if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

			setStatus("connecting");

			const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);

			ws.onopen = () => {
				if (!mountedRef.current) {
					ws.close();
					return;
				}
				setStatus("connected");
				reconnectDelayRef.current = INITIAL_RECONNECT_DELAY;

				for (const path of subscriptionsRef.current) {
					ws.send(JSON.stringify({ type: "subscribe", path }));
				}
			};

			ws.onclose = () => {
				if (!mountedRef.current) return;
				setStatus("disconnected");
				wsRef.current = null;
				scheduleReconnect();
			};

			ws.onerror = () => {
				ws.close();
			};

			ws.onmessage = (event) => {
				try {
					const message = JSON.parse(event.data) as ServerMessage;

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
						case "heartbeat":
							break;
					}
				} catch {
					console.warn("Failed to parse WebSocket message");
				}
			};

			wsRef.current = ws;
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
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
			}
			if (wsRef.current) {
				wsRef.current.close();
				wsRef.current = null;
			}
		};
	}, [port]);

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

	return (
		<WebSocketContext.Provider
			value={{ status, subscribe, unsubscribe, onFileChange, onTreeChange }}
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
