import { describe, expect, test } from "bun:test";
import {
	createDownsamplingService,
	DownsamplingService,
} from "../../server/downsampling-service.js";
import type { Run, RunEvent } from "../../types/runs.js";

const baseRun: Run = {
	id: "run-1",
	projectId: "proj-1",
	projectName: "Project One",
	featureId: "state-fixes",
	featureName: "State Fixes",
	name: "Example Run",
	command: "/build",
	status: "completed",
	harness: "codex",
	currentStep: null,
	steps: [],
	artifacts: [],
	events: [],
	startedAt: "2026-04-10T00:00:00.000Z",
	lastEventAt: "2026-04-10T01:00:00.000Z",
	completedAt: "2026-04-10T01:00:00.000Z",
	error: null,
	agentSteps: null,
};

describe("DownsamplingService", () => {
	test("treats cancelled and abandoned runs as terminal for downsampling", () => {
		const service = new DownsamplingService({ thresholdHours: 24 });

		expect(
			service.shouldDownsample({
				...baseRun,
				status: "cancelled",
			}),
		).toBe(true);
		expect(
			service.shouldDownsample({
				...baseRun,
				status: "abandoned",
			}),
		).toBe(true);
	});

	test("does not downsample inactive runs", () => {
		const service = new DownsamplingService({ thresholdHours: 24 });

		expect(
			service.shouldDownsample({
				...baseRun,
				status: "inactive",
				completedAt: null,
			}),
		).toBe(false);
	});

	test("keeps recent terminal runs uncompressed until the threshold passes", () => {
		const service = new DownsamplingService({ thresholdHours: 24 });
		const now = new Date();
		const recentCompletedAt = new Date(now.getTime() - 2 * 60 * 60 * 1000);

		expect(
			service.shouldDownsample({
				...baseRun,
				completedAt: recentCompletedAt.toISOString(),
			}),
		).toBe(false);
	});

	test("compresses aggregate event types while preserving status and waiting events", () => {
		const service = new DownsamplingService();
		const events: readonly RunEvent[] = [
			event("e1", "status_change", "2026-04-10T00:00:00.000Z"),
			event("e2", "btw_update", "2026-04-10T00:01:00.000Z"),
			event("e3", "artifact_registered", "2026-04-10T00:02:00.000Z"),
			event("e4", "btw_update", "2026-04-10T00:03:00.000Z"),
			event("e5", "waiting_for_user", "2026-04-10T00:04:00.000Z"),
			event("e6", "artifact_registered", "2026-04-10T00:05:00.000Z"),
		];

		const compressed = service.downsampleEvents(events);

		expect(compressed.originalCount).toBe(6);
		expect(compressed.compressionRatio).toBe(4 / 6);
		expect(compressed.events.map((item) => item.id)).toEqual([
			"e1",
			"summary-btw_update-2026-04-10T00:01:00.000Z",
			"e5",
			"summary-artifact_registered-2026-04-10T00:02:00.000Z",
		]);
		expect(compressed.events[1]?.message).toBe("2 update events compressed");
		expect(compressed.events[3]?.message).toBe("2 artifact events compressed");
		expect(compressed.events[1]?.metadata).toMatchObject({
			isSummary: true,
			originalCount: 2,
			firstTimestamp: "2026-04-10T00:01:00.000Z",
			lastTimestamp: "2026-04-10T00:03:00.000Z",
		});
	});

	test("returns the original event stream for active runs and compressed events for old terminal runs", () => {
		const service = new DownsamplingService({ thresholdHours: 1 });
		const events = [
			event("e1", "btw_update", "2026-04-10T00:00:00.000Z"),
			event("e2", "btw_update", "2026-04-10T00:01:00.000Z"),
		];

		expect(
			service.getEventsForRun({
				...baseRun,
				status: "running",
				completedAt: null,
				events,
			}).events,
		).toBe(events);

		const compressed = service.getEventsForRun({ ...baseRun, events });
		expect(compressed.events).toHaveLength(1);
		expect(compressed.events[0]?.metadata?.originalCount).toBe(2);
	});

	test("returns updated immutable config from the factory and update helper", () => {
		const service = createDownsamplingService(12);
		const updated = service.updateConfig({
			thresholdHours: 48,
			preserveTypes: ["artifact_registered"],
		});

		expect(service.getConfig()).toEqual({
			thresholdHours: 12,
			preserveTypes: ["status_change", "waiting_for_user"],
		});
		expect(updated.getConfig()).toEqual({
			thresholdHours: 48,
			preserveTypes: ["artifact_registered"],
		});
	});
});

function event(
	id: string,
	type: RunEvent["type"],
	timestamp: string,
): RunEvent {
	return {
		id,
		type,
		message: `${type} message`,
		timestamp,
		stepId: null,
		metadata: null,
	};
}
