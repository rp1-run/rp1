import type { ServerWebSocket } from "bun";

export interface FileChangedMessage {
  type: "file:changed";
  path: string;
  changeType: "modify" | "add" | "delete";
  timestamp: string;
}

export interface TreeChangedMessage {
  type: "tree:changed";
  timestamp: string;
}

export interface HeartbeatMessage {
  type: "heartbeat";
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

export type ServerMessage =
  | FileChangedMessage
  | TreeChangedMessage
  | HeartbeatMessage;
export type ClientMessage = SubscribeMessage | UnsubscribeMessage;

interface ClientData {
  projectPath: string;
}

interface ClientState {
  ws: ServerWebSocket<ClientData>;
  subscriptions: Set<string>;
  lastPing: number;
}

export class WebSocketHub {
  private clients: Map<ServerWebSocket<ClientData>, ClientState> = new Map();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  addClient(ws: ServerWebSocket<ClientData>): void {
    this.clients.set(ws, {
      ws,
      subscriptions: new Set(),
      lastPing: Date.now(),
    });
    console.log(`WebSocket client connected. Total clients: ${this.clients.size}`);
  }

  removeClient(ws: ServerWebSocket<ClientData>): void {
    this.clients.delete(ws);
    console.log(`WebSocket client disconnected. Total clients: ${this.clients.size}`);
  }

  handleMessage(
    ws: ServerWebSocket<ClientData>,
    message: string | ArrayBufferLike | Uint8Array
  ): void {
    const state = this.clients.get(ws);
    if (!state) return;

    state.lastPing = Date.now();

    try {
      const msgStr =
        typeof message === "string"
          ? message
          : new TextDecoder().decode(
              message instanceof Uint8Array ? message : new Uint8Array(message)
            );
      const parsed = JSON.parse(msgStr) as ClientMessage;

      switch (parsed.type) {
        case "subscribe":
          state.subscriptions.add(parsed.path);
          break;
        case "unsubscribe":
          state.subscriptions.delete(parsed.path);
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
    path: string,
    changeType: "modify" | "add" | "delete"
  ): void {
    const message: FileChangedMessage = {
      type: "file:changed",
      path,
      changeType,
      timestamp: new Date().toISOString(),
    };

    const data = JSON.stringify(message);
    for (const state of this.clients.values()) {
      const isSubscribed =
        state.subscriptions.size === 0 || state.subscriptions.has(path);

      if (isSubscribed) {
        try {
          state.ws.send(data);
        } catch {
          this.removeClient(state.ws);
        }
      }
    }
  }

  broadcastTreeChange(): void {
    const message: TreeChangedMessage = {
      type: "tree:changed",
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
}
