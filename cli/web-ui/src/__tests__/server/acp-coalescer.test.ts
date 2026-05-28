import { describe, expect, test } from "bun:test";
import { AcpRunCoalescer } from "../../server/acp/coalescer";
import type {
	AcpSidecarSession,
	AcpSidecarSignal,
} from "../../server/acp/types";

const session: AcpSidecarSession = {
	sessionId: "session-1",
	provider: "fake",
	projectId: "project-1",
	runId: "run-1",
	status: "running",
	promptCount: 1,
	activePermission: null,
	createdAt: "2026-05-18T00:00:00.000Z",
	updatedAt: "2026-05-18T00:00:00.000Z",
};

function statusSignal(
	sequence: number,
	overrides: Partial<AcpSidecarSignal> = {},
): AcpSidecarSignal {
	return {
		signalId: `session-1:${sequence}`,
		provider: "fake",
		projectId: "project-1",
		runId: "run-1",
		sessionId: "session-1",
		sequence,
		timestamp: `2026-05-18T00:00:${String(sequence).padStart(2, "0")}.000Z`,
		kind: "status",
		payload: {
			status: "running",
			health: "available",
			message: `status ${sequence}`,
		},
		...overrides,
	} as AcpSidecarSignal;
}

function transcriptSignal(sequence: number): AcpSidecarSignal {
	return {
		signalId: `session-1:${sequence}`,
		provider: "fake",
		projectId: "project-1",
		runId: "run-1",
		sessionId: "session-1",
		sequence,
		timestamp: `2026-05-18T00:01:${String(sequence).padStart(2, "0")}.000Z`,
		kind: "transcript",
		payload: {
			role: "assistant",
			text: `Fake update ${sequence}`,
		},
	};
}

describe("AcpRunCoalescer", () => {
	test("rejects unbound sidecar signals and emits live-only identifiers", () => {
		const coalescer = new AcpRunCoalescer();

		const messages = coalescer.coalesceSessionSignals(session, [
			statusSignal(1),
			statusSignal(2, { projectId: "other-project" }),
			statusSignal(3, { runId: "other-run" }),
			statusSignal(4, { sessionId: "other-session" }),
		]);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			type: "acp:activity",
			sequenceId: "session-1:1",
			projectId: "project-1",
			runId: "run-1",
			sessionId: "session-1",
			provider: "fake",
			kind: "status",
			signalIds: ["session-1:1"],
			sidecarSequences: [1],
		});
		expect(Object.hasOwn(messages[0], "eventId")).toBe(false);
	});

	test("suppresses duplicate signal IDs and repeated same-kind payloads", () => {
		const coalescer = new AcpRunCoalescer();
		const repeatedPayload = {
			status: "running" as const,
			health: "available" as const,
			message: "same payload",
		};

		const messages = coalescer.coalesceSessionSignals(session, [
			statusSignal(1, { payload: repeatedPayload }),
			statusSignal(1, { payload: repeatedPayload }),
			statusSignal(2, { payload: repeatedPayload }),
			statusSignal(3),
		]);

		expect(messages.map((message) => message.sequenceId)).toEqual([
			"session-1:1",
			"session-1:3",
		]);
		expect(
			coalescer.coalesceSessionSignals(session, [statusSignal(1)]),
		).toEqual([]);
	});

	test("batches and caps high-volume activity before WebSocket delivery", () => {
		const coalescer = new AcpRunCoalescer({
			batchThreshold: 3,
			maxSignalsPerMessage: 3,
		});

		const messages = coalescer.coalesceSessionSignals(
			session,
			Array.from({ length: 6 }, (_, index) => transcriptSignal(index + 1)),
		);

		expect(messages).toHaveLength(1);
		expect(messages[0]).toMatchObject({
			type: "acp:activity",
			sequenceId: "session-1:4-6",
			kind: "batch",
			signalIds: ["session-1:4", "session-1:5", "session-1:6"],
			sidecarSequences: [4, 5, 6],
			payload: {
				droppedCount: 3,
			},
		});
		expect(
			messages[0].kind === "batch" &&
				"signals" in messages[0].payload &&
				messages[0].payload.signals.map((signal) => signal.signalId),
		).toEqual(["session-1:4", "session-1:5", "session-1:6"]);
	});
});
