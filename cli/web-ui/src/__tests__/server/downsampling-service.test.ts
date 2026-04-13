import { describe, expect, test } from "bun:test";
import { DownsamplingService } from "../../server/downsampling-service.js";
import type { Run } from "../../types/runs.js";

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
});
