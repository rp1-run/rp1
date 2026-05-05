import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { type ReplayProvider, WebSocketHub } from "../../server/websocket";
import { DEFAULT_ARCADE_RECONNECT_POLICY } from "../../types/runtime";

class MockServerWebSocket {
	readonly sentMessages: string[] = [];
	closed = false;
	onSend?: (message: string) => void;

	send(message: string): void {
		this.sentMessages.push(message);
		this.onSend?.(message);
	}

	close(): void {
		this.closed = true;
	}
}

function asServerWebSocket(socket: MockServerWebSocket): ServerWebSocket<{
	projectPath: string;
	scope?: "global" | "project";
	projectId?: string;
	lastEventId?: number;
}> {
	return socket as unknown as ServerWebSocket<{
		projectPath: string;
		scope?: "global" | "project";
		projectId?: string;
		lastEventId?: number;
	}>;
}

const FAST_HEARTBEAT_POLICY = {
	...DEFAULT_ARCADE_RECONNECT_POLICY,
	heartbeatIntervalMs: 5,
	heartbeatMissThreshold: 2,
};

function wait(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitUntil(assertion: () => void): Promise<void> {
	const deadline = Date.now() + 250;
	let lastError: unknown;

	while (Date.now() < deadline) {
		try {
			assertion();
			return;
		} catch (error) {
			lastError = error;
			await wait(5);
		}
	}

	if (lastError) {
		throw lastError;
	}
	assertion();
}

function buildReplayProvider(
	overrides: Partial<ReplayProvider> = {},
): ReplayProvider {
	return {
		getEventsSince: () => [],
		getRunContext: (runId) => {
			if (runId === "run-1") {
				return {
					projectId: "proj-1",
					featureId: "feat-1",
					runStatus: "running",
				};
			}
			if (runId === "run-2") {
				return {
					projectId: "proj-2",
					featureId: "feat-2",
					runStatus: "waiting",
				};
			}
			return null;
		},
		getRunStatus: () => null,
		getActiveRunsSnapshot: () => [],
		getMaxEventId: () => 0,
		...overrides,
	};
}

describe("WebSocketHub replay", () => {
	test("filters project replay events and includes resolved project identity", () => {
		const hub = new WebSocketHub();
		try {
			hub.setReplayProvider(
				buildReplayProvider({
					getEventsSince: () => [
						{
							id: 11,
							runId: "run-1",
							type: "status_change",
							step: "build",
							unit: null,
							data: JSON.stringify({ status: "running" }),
							createdAt: "2026-04-14T00:00:00.000Z",
						},
						{
							id: 12,
							runId: "run-2",
							type: "waiting_for_user",
							step: "review",
							unit: null,
							data: JSON.stringify({ prompt: "Need approval" }),
							createdAt: "2026-04-14T00:00:01.000Z",
						},
					],
				}),
			);

			const socket = new MockServerWebSocket();
			hub.addClient(asServerWebSocket(socket), {
				scope: "project",
				projectId: "proj-1",
				lastEventId: 10,
			});

			expect(socket.sentMessages).toHaveLength(1);
			expect(JSON.parse(socket.sentMessages[0])).toMatchObject({
				type: "event:replay",
				scope: "project",
				event: {
					id: 11,
					runId: "run-1",
					projectId: "proj-1",
					featureId: "feat-1",
					runStatus: "running",
				},
			});
		} finally {
			hub.stop();
		}
	});

	test("sends scoped snapshots with resolved project ids when replay exceeds the cap", () => {
		const hub = new WebSocketHub();
		try {
			hub.setReplayProvider(
				buildReplayProvider({
					getEventsSince: () =>
						Array.from({ length: 101 }, (_, index) => ({
							id: index + 11,
							runId: "run-1",
							type: "status_change",
							step: "build",
							unit: null,
							data: JSON.stringify({ status: "running" }),
							createdAt: "2026-04-14T00:00:00.000Z",
						})),
					getActiveRunsSnapshot: () => [
						{
							id: "run-1",
							flow: "build",
							featureId: "feat-1",
							projectPath: "/tmp/project-one",
							status: "running",
							steps: [{ step: "build", status: "running" }],
							artifacts: [],
						},
						{
							id: "run-2",
							flow: "build",
							featureId: "feat-2",
							projectPath: "/tmp/project-two",
							status: "waiting",
							steps: [{ step: "review", status: "waiting" }],
							artifacts: [],
						},
					],
					getMaxEventId: () => 111,
				}),
			);

			const socket = new MockServerWebSocket();
			hub.addClient(asServerWebSocket(socket), {
				scope: "project",
				projectId: "proj-1",
				lastEventId: 10,
			});

			expect(socket.sentMessages).toHaveLength(1);
			expect(JSON.parse(socket.sentMessages[0])).toMatchObject({
				type: "state:snapshot",
				scope: "project",
				projectId: "proj-1",
				lastEventId: 111,
				runs: [
					{
						id: "run-1",
						projectId: "proj-1",
						featureId: "feat-1",
					},
				],
			});
		} finally {
			hub.stop();
		}
	});
});

describe("WebSocketHub heartbeat acknowledgements", () => {
	test("keeps passive clients connected while heartbeat acknowledgements succeed", async () => {
		const hub = new WebSocketHub(FAST_HEARTBEAT_POLICY);
		try {
			const socket = new MockServerWebSocket();
			const serverSocket = asServerWebSocket(socket);
			socket.onSend = (message) => {
				const parsed = JSON.parse(message) as {
					type?: string;
					heartbeatId?: string;
				};
				if (parsed.type === "heartbeat" && parsed.heartbeatId) {
					hub.handleMessage(
						serverSocket,
						JSON.stringify({
							type: "heartbeat:ack",
							heartbeatId: parsed.heartbeatId,
							receivedAt: new Date().toISOString(),
						}),
					);
				}
			};

			hub.addClient(serverSocket, { scope: "global" });

			await waitUntil(() => {
				expect(socket.sentMessages.length).toBeGreaterThanOrEqual(2);
			});
			await wait(FAST_HEARTBEAT_POLICY.heartbeatIntervalMs * 2);

			expect(socket.closed).toBe(false);
			expect(hub.clientCount).toBe(1);
			expect(JSON.parse(socket.sentMessages[0])).toMatchObject({
				type: "heartbeat",
				heartbeatId: expect.any(String),
			});
		} finally {
			hub.stop();
		}
	});

	test("closes clients after missed heartbeat acknowledgements despite unrelated messages", async () => {
		const hub = new WebSocketHub(FAST_HEARTBEAT_POLICY);
		try {
			const socket = new MockServerWebSocket();
			const serverSocket = asServerWebSocket(socket);

			hub.addClient(serverSocket, { scope: "global" });

			await waitUntil(() => {
				expect(socket.sentMessages.length).toBeGreaterThanOrEqual(1);
			});

			hub.handleMessage(
				serverSocket,
				JSON.stringify({ type: "subscribe", path: "/tmp/project" }),
			);

			await waitUntil(() => {
				expect(socket.closed).toBe(true);
			});

			expect(hub.clientCount).toBe(0);
		} finally {
			hub.stop();
		}
	});
});
