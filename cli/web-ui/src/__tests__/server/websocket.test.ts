import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { type ReplayProvider, WebSocketHub } from "../../server/websocket";

class MockServerWebSocket {
	readonly sentMessages: string[] = [];
	closed = false;

	send(message: string): void {
		this.sentMessages.push(message);
	}

	close(): void {
		this.closed = true;
	}
}

function asServerWebSocket(socket: MockServerWebSocket): ServerWebSocket<{
	projectPath: string;
	projectId?: string;
	lastEventId?: number;
}> {
	return socket as unknown as ServerWebSocket<{
		projectPath: string;
		projectId?: string;
		lastEventId?: number;
	}>;
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
