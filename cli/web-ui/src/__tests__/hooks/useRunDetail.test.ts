import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { Run, RunEvent } from "@/types/runs";
import type { EventNotificationMessage } from "@/types/websocket";

type EventCallback = (msg: EventNotificationMessage) => void;

let eventListeners: EventCallback[] = [];
let mockWsStatus = "connected";
let runResponse: Run;
let fetchMock: ReturnType<typeof mock>;
let useRunDetailImportVersion = 0;

async function loadUseRunDetail() {
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

	return import(
		`../../hooks/useRunDetail.ts?use-run-detail-test=${++useRunDetailImportVersion}`
	);
}

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
	name: null,
	command: "build",
	status: "running",
	harness: null,
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
	mock.restore();
	eventListeners = [];
	mockWsStatus = "connected";
	runResponse = { ...baseRun };

	fetchMock = mock((url: string) => {
		if (url === "/api/v2/runs/run-1") {
			return Promise.resolve({
				ok: true,
				json: () => Promise.resolve({ ...runResponse }),
			});
		}
		return Promise.resolve({ ok: false, status: 404, statusText: "Not Found" });
	});

	globalThis.fetch = fetchMock as unknown as typeof fetch;
});

afterEach(() => {
	cleanup();
	eventListeners = [];
	mock.restore();
});

describe("useRunDetail", () => {
	test("waiting_for_user event sets status to waiting and appends event", async () => {
		const { useRunDetail } = await loadUseRunDetail();
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
		expect(result.current.run?.steps[0]?.status).toBe("waiting");
		const waitingEvents = result.current.run?.events.filter(
			(e: RunEvent) => e.type === "waiting_for_user",
		);
		expect(waitingEvents).toHaveLength(1);
		expect(waitingEvents?.[0].message).toBe(
			"Should I proceed with the migration?",
		);
		expect(waitingEvents?.[0].id).toBe("ws-100");
		expect(waitingEvents?.[0].stepId).toBe("design");
	});

	test("btw_update event appends event without changing status", async () => {
		const { useRunDetail } = await loadUseRunDetail();
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
		expect(btwEvents?.[0].message).toBe(
			"Found 3 unused imports in auth module",
		);
		expect(btwEvents?.[0].id).toBe("ws-200");
	});

	test("subflow_registered event triggers refetch without inline handling", async () => {
		const { useRunDetail } = await loadUseRunDetail();
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
		const { useRunDetail } = await loadUseRunDetail();
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

	test("ignores websocket events for a different run in the same project and feature", async () => {
		const { useRunDetail } = await loadUseRunDetail();
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 500,
				eventType: "waiting_for_user",
				runId: "run-2",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "design",
				data: { prompt: "Wrong run" },
				createdAt: "2026-03-15T01:20:00Z",
			});
		});

		expect(result.current.run?.status).toBe("running");
		expect(result.current.run?.events).toHaveLength(0);
	});

	test("reuses cached run data across remounts without returning to loading", async () => {
		const { useRunDetail } = await loadUseRunDetail();
		const firstRender = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(firstRender.result.current.isLoading).toBe(false);
		});
		expect(firstRender.result.current.run?.id).toBe("run-1");

		firstRender.unmount();

		globalThis.fetch = mock(
			() => new Promise<Response>(() => {}),
		) as unknown as typeof fetch;

		const secondRender = renderHook(() => useRunDetail("run-1"));

		expect(secondRender.result.current.run?.id).toBe("run-1");
		expect(secondRender.result.current.isLoading).toBe(false);
	});

	test("reconciled artifact updates local state without refetching the run", async () => {
		runResponse = {
			...baseRun,
			artifacts: [
				{
					docId: "doc-1",
					path: "/tmp/project/.rp1/work/features/feat-1/tasks.md",
					absolutePath: "/tmp/project/.rp1/work/features/feat-1/tasks.md",
					type: "markdown",
					updatedDuringRun: true,
					isNew: false,
					step: "design",
				},
			],
		};

		const { useRunDetail } = await loadUseRunDetail();
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		expect(fetchMock).toHaveBeenCalledTimes(1);

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 600,
				eventType: "artifact_registered",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: "design",
				data: {
					docId: "doc-1",
					path: ".rp1/work/features/feat-1/tasks.md",
					reconciled: true,
				},
				createdAt: "2026-03-15T01:25:00Z",
			});
		});

		expect(result.current.run?.artifacts[0]?.path).toBe(
			".rp1/work/features/feat-1/tasks.md",
		);
		expect(result.current.run?.artifacts[0]?.absolutePath).toBe(
			"/tmp/project/.rp1/work/features/feat-1/tasks.md",
		);

		await new Promise((resolve) => setTimeout(resolve, 650));
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	test("run-level cancelled status changes stay on the current step and trigger a terminal refetch", async () => {
		const { useRunDetail } = await loadUseRunDetail();
		const { result } = renderHook(() => useRunDetail("run-1"));

		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
		});

		act(() => {
			emitEvent({
				type: "event:notification",
				eventId: 700,
				eventType: "status_change",
				runId: "run-1",
				projectId: "proj-1",
				featureId: "feat-1",
				step: null,
				data: {
					status: "cancelled",
					message: "Stopped intentionally",
					source: "manual_end",
				},
				createdAt: "2026-03-15T01:30:00Z",
			});
		});

		expect(result.current.run?.status).toBe("cancelled");
		expect(result.current.run?.currentStep).toBe("design");
		expect(result.current.run?.statusMessage).toBe("Stopped intentionally");
		expect(result.current.run?.completedAt).toBe("2026-03-15T01:30:00Z");

		await new Promise((resolve) => setTimeout(resolve, 1100));
		expect(fetchMock).toHaveBeenCalledTimes(2);
	});
});
