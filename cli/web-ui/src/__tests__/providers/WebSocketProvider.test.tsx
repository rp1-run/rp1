import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { RuntimeProvider } from "@/providers/RuntimeProvider";
import {
	type EventNotificationMessage,
	type StateSnapshotMessage,
	useWebSocket,
	WebSocketProvider,
} from "@/providers/WebSocketProvider";
import type { ArcadeRuntimeContract } from "@/types/runtime";

const LAST_EVENT_ID_STORAGE_PREFIX = "rp1:last-event-id:";
const TEST_RUNTIME: ArcadeRuntimeContract = {
	schemaVersion: 1,
	baseUrl: "http://127.0.0.1:7710",
	hostMode: "browser",
	version: "0.7.6",
	buildId: "test-build",
	cacheBust: "test-build",
	reconnectPolicy: {
		initialDelayMs: 2000,
		maxDelayMs: 30000,
		backoffFactor: 2,
		heartbeatIntervalMs: 30000,
		heartbeatMissThreshold: 3,
		disconnectedRecoveryIntervalMs: 5000,
		activityRecoveryLimit: 25,
	},
};

class MockWebSocket {
	static readonly CONNECTING = 0;
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	static instances: MockWebSocket[] = [];

	readonly url: string;
	readyState = MockWebSocket.CONNECTING;
	onopen: ((event: Event) => void) | null = null;
	onclose: ((event: CloseEvent) => void) | null = null;
	onerror: ((event: Event) => void) | null = null;
	onmessage: ((event: MessageEvent<string>) => void) | null = null;
	sentMessages: string[] = [];

	constructor(url: string | URL) {
		this.url = String(url);
		MockWebSocket.instances.push(this);
	}

	send(data: string): void {
		this.sentMessages.push(data);
	}

	close(): void {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.(new Event("close") as CloseEvent);
	}

	open(): void {
		this.readyState = MockWebSocket.OPEN;
		this.onopen?.(new Event("open"));
	}

	receive(message: unknown): void {
		this.onmessage?.({
			data: JSON.stringify(message),
		} as MessageEvent<string>);
	}
}

function wrapper({ children }: { children: ReactNode }) {
	return (
		<RuntimeProvider runtime={TEST_RUNTIME}>
			<WebSocketProvider>{children}</WebSocketProvider>
		</RuntimeProvider>
	);
}

function getLatestProjectSocket(projectId: string): MockWebSocket | undefined {
	return [...MockWebSocket.instances]
		.reverse()
		.find(
			(socket) =>
				new URL(socket.url).searchParams.get("projectId") === projectId,
		);
}

describe("WebSocketProvider", () => {
	const originalWebSocket = globalThis.WebSocket;

	beforeEach(() => {
		MockWebSocket.instances = [];
		sessionStorage.clear();
		globalThis.WebSocket = MockWebSocket as unknown as typeof WebSocket;
	});

	afterEach(() => {
		cleanup();
		sessionStorage.clear();
		MockWebSocket.instances = [];
		globalThis.WebSocket = originalWebSocket;
	});

	test("includes the stored project cursor when connecting to a project-scoped socket", async () => {
		sessionStorage.setItem(`${LAST_EVENT_ID_STORAGE_PREFIX}proj-1`, "41");

		const { result } = renderHook(() => useWebSocket(), { wrapper });

		act(() => {
			result.current.setProjectId("proj-1");
		});

		await waitFor(() => {
			expect(getLatestProjectSocket("proj-1")).toBeDefined();
		});

		const projectSocket = getLatestProjectSocket("proj-1");
		expect(projectSocket).toBeDefined();
		expect(new URL(projectSocket!.url).searchParams.get("lastEventId")).toBe(
			"41",
		);
	});

	test("normalizes replay events and routes snapshots while advancing the project cursor", async () => {
		const receivedEvents: EventNotificationMessage[] = [];
		const receivedSnapshots: StateSnapshotMessage[] = [];

		const { result, unmount } = renderHook(() => useWebSocket(), { wrapper });

		act(() => {
			result.current.onEventNotification((message) => {
				receivedEvents.push(message);
			});
			result.current.onStateSnapshot((message) => {
				receivedSnapshots.push(message);
			});
			result.current.setProjectId("proj-1");
		});

		await waitFor(() => {
			expect(getLatestProjectSocket("proj-1")).toBeDefined();
		});

		const projectSocket = getLatestProjectSocket("proj-1");
		expect(projectSocket).toBeDefined();

		act(() => {
			projectSocket!.open();
			projectSocket!.receive({
				type: "event:notification",
				eventId: 42,
				eventType: "status_change",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "build",
				data: { status: "running" },
				createdAt: "2026-04-14T00:00:00.000Z",
			});
			projectSocket!.receive({
				type: "event:replay",
				event: {
					id: 43,
					runId: "run-1",
					eventType: "waiting_for_user",
					step: "review",
					data: JSON.stringify({ prompt: "Need approval" }),
					createdAt: "2026-04-14T00:00:01.000Z",
				},
			});
			projectSocket!.receive({
				type: "state:snapshot",
				runs: [
					{
						id: "run-1",
						flow: "build",
						featureId: "feat-1",
						projectPath: "/tmp/project",
						status: "waiting",
						steps: [{ step: "review", status: "waiting" }],
						artifacts: [],
					},
				],
				lastEventId: 55,
			});
		});

		expect(receivedEvents).toHaveLength(2);
		expect(receivedEvents[0]).toMatchObject({
			type: "event:notification",
			eventId: 42,
			eventType: "status_change",
			projectId: "proj-1",
		});
		expect(receivedEvents[1]).toMatchObject({
			type: "event:notification",
			eventId: 43,
			eventType: "waiting_for_user",
			projectId: "proj-1",
			step: "review",
			data: { prompt: "Need approval" },
		});
		expect(receivedSnapshots).toHaveLength(1);
		expect(receivedSnapshots[0]?.lastEventId).toBe(55);
		expect(
			sessionStorage.getItem(`${LAST_EVENT_ID_STORAGE_PREFIX}proj-1`),
		).toBe("55");

		unmount();

		const rerendered = renderHook(() => useWebSocket(), { wrapper });
		act(() => {
			rerendered.result.current.setProjectId("proj-1");
		});

		await waitFor(() => {
			expect(MockWebSocket.instances.length).toBeGreaterThanOrEqual(2);
		});

		const reconnectedSocket = getLatestProjectSocket("proj-1");
		expect(reconnectedSocket).toBeDefined();
		expect(
			new URL(reconnectedSocket!.url).searchParams.get("lastEventId"),
		).toBe("55");
	});
});
