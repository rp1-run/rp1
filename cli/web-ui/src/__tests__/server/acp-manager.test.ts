import { describe, expect, test } from "bun:test";
import { AcpSidecarError, AcpSidecarManager } from "../../server/acp/manager";

function deterministicClock(): () => Date {
	let tick = 0;
	return () => new Date(Date.UTC(2026, 4, 18, 0, 0, tick++));
}

describe("AcpSidecarManager", () => {
	test("runs the fake lifecycle through prompt, permission, cancellation, and stale-session rejection", () => {
		const manager = new AcpSidecarManager({
			createSessionId: () => "session-1",
			now: deterministicClock(),
		});
		const binding = { projectId: "project-1", runId: "run-1" };

		const created = manager.createSession(binding);
		expect(created.session).toMatchObject({
			sessionId: "session-1",
			provider: "fake",
			projectId: "project-1",
			runId: "run-1",
			status: "ready",
			promptCount: 0,
			activePermission: null,
		});
		expect(created.signals.map((signal) => signal.kind)).toEqual([
			"session",
			"status",
			"session",
			"status",
		]);
		expect(created.signals.map((signal) => signal.signalId)).toEqual([
			"session-1:1",
			"session-1:2",
			"session-1:3",
			"session-1:4",
		]);
		expect(created.signals.map((signal) => signal.sequence)).toEqual([
			1, 2, 3, 4,
		]);

		const prompted = manager.promptSession("session-1", binding, {
			prompt: "Inspect the fake sidecar proof",
		});
		expect(prompted.session).toMatchObject({
			status: "blocked",
			promptCount: 1,
			activePermission: {
				permissionId: "fake-permission-1",
				status: "pending",
				blocking: true,
			},
		});
		expect(prompted.signals.map((signal) => signal.kind)).toEqual([
			"session",
			"transcript",
			"status",
			"plan",
			"tool",
			"transcript",
			"tool",
			"permission",
			"status",
		]);
		expect(prompted.signals.at(-1)).toMatchObject({
			signalId: "session-1:13",
			sequence: 13,
			kind: "status",
			payload: {
				status: "blocked",
				health: "blocked",
			},
		});
		expect(manager.getActiveSessionSummary()).toEqual({
			activeSessions: 1,
			blockedSessions: 1,
		});

		const cancelled = manager.cancelSession("session-1", binding, {
			reason: "manual test cancellation",
		});
		expect(cancelled.session).toMatchObject({
			status: "cancelled",
			activePermission: null,
		});
		expect(cancelled.signals.map((signal) => signal.kind)).toEqual([
			"status",
			"session",
		]);
		expect(manager.getActiveSessionSummary()).toEqual({
			activeSessions: 0,
			blockedSessions: 0,
		});

		expect(() => manager.closeSession("session-1", binding)).toThrow(
			AcpSidecarError,
		);
		expect(() => manager.closeSession("session-1", binding)).toThrow(
			/session-1 is already cancelled/,
		);
	});

	test("rejects missing and mismatched session operations before producing activity", () => {
		const manager = new AcpSidecarManager({
			createSessionId: () => "session-1",
			now: deterministicClock(),
		});
		const binding = { projectId: "project-1", runId: "run-1" };
		manager.createSession(binding);

		expect(() =>
			manager.promptSession("missing-session", binding, { prompt: "hello" }),
		).toThrow(/ACP sidecar session not found/);

		expect(() =>
			manager.promptSession(
				"session-1",
				{ projectId: "other-project", runId: "run-1" },
				{ prompt: "hello" },
			),
		).toThrow(/not bound to project other-project and run run-1/);
	});
});
