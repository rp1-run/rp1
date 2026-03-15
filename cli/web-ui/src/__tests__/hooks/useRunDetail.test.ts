import { beforeEach, describe, expect, mock, test } from "bun:test";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { Run, RunEvent } from "@/types/runs";
import type { EventNotificationMessage } from "@/types/websocket";

type EventCallback = (msg: EventNotificationMessage) => void;

let eventListeners: EventCallback[] = [];
let mockWsStatus = "connected";

mock.module("@/providers/WebSocketProvider", () => ({
	useWebSocket: () => ({
		onEventNotification: (cb: EventCallback) => {
			eventListeners.push(cb);
			return () => {
				eventListeners = eventListeners.filter((l) => l !== cb);
			};
		},
		status: mockWsStatus,
	}),
}));

function emitEvent(msg: EventNotificationMessage) {
	for (const listener of eventListeners) {
		listener(msg);
	}
}

const baseRun: Run = {
	id: "run-1",
	projectId: "proj-1",
	projectName: "Test Project",
	featureId: "feat-1",
	featureName: "Test Feature",
	command: "build",
	status: "running",
	currentStep: "design",
	steps: [
		{
			id: "design",
			name: "Design",
			status: "running",
			startedAt: "2026-03-15T00:00:00Z",
			completedAt: null,
			taskCount: null,
			completedTaskCount: null,
		},
	],
	artifacts: [],
	events: [],
	startedAt: "2026-03-15T00:00:00Z",
	completedAt: null,
	error: null,
	agentSteps: null,
};

beforeEach(() => {
	eventListeners = [];
	mockWsStatus = "connected";

	globalThis.fetch = mock((url: string) => {
		if (url === "/api/v2/runs/run-1") {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ...baseRun }),
			});
		}
		return Promise.resolve({ ok: false, status: 404, statusText: "Not Found" });
	}) as unknown as typeof fetch;
});

describe("useRunDetail", () => {
	test("waiting_for_user event sets status to waiting and appends event", async () => {
		const { useRunDetail } = await import("../../hooks/useRunDetail");
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});
		expect(result.current.run?.status).toBe("running");

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 100,
				eventType: "waiting_for_user",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "design",
				data: { prompt: "Should I proceed with the migration?" },
				createdAt: "2026-03-15T01:00:00Z",
			});
		});

		expect(result.current.run?.status).toBe("waiting");
		const waitingEvents = result.current.run?.events.filter(
			(e: RunEvent) => e.type === "waiting_for_user",
		);
		expect(waitingEvents).toHaveLength(1);
		expect(waitingEvents![0].message).toBe(
			"Should I proceed with the migration?",
		);
		expect(waitingEvents![0].id).toBe("ws-100");
		expect(waitingEvents![0].stepId).toBe("design");
	});

	test("btw_update event appends event without changing status", async () => {
		const { useRunDetail } = await import("../../hooks/useRunDetail");
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 200,
				eventType: "btw_update",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "design",
				data: { message: "Found 3 unused imports in auth module" },
				createdAt: "2026-03-15T01:05:00Z",
			});
		});

		expect(result.current.run?.status).toBe("running");
		const btwEvents = result.current.run?.events.filter(
			(e: RunEvent) => e.type === "btw_update",
		);
		expect(btwEvents).toHaveLength(1);
		expect(btwEvents![0].message).toBe("Found 3 unused imports in auth module");
		expect(btwEvents![0].id).toBe("ws-200");
	});

	test("subflow_registered event triggers refetch without inline handling", async () => {
		const { useRunDetail } = await import("../../hooks/useRunDetail");
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		const eventsBefore = result.current.run?.events.length ?? 0;

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 300,
				eventType: "subflow_registered",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "design",
				data: { diagram: "stateDiagram-v2" },
				createdAt: "2026-03-15T01:10:00Z",
			});
		});

		expect(result.current.run?.events.length).toBe(eventsBefore);
		expect(result.current.run?.status).toBe("running");
	});

	test("annotation_updated event triggers refetch without inline handling", async () => {
		const { useRunDetail } = await import("../../hooks/useRunDetail");
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		const eventsBefore = result.current.run?.events.length ?? 0;

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 400,
				eventType: "annotation_updated",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: null,
				data: { docId: "doc-1" },
				createdAt: "2026-03-15T01:15:00Z",
			});
		});

		expect(result.current.run?.events.length).toBe(eventsBefore);
		expect(result.current.run?.status).toBe("running");
	});
});
