import { describe, expect, test } from "bun:test";
import type { Run } from "@/types/runs";
import type {
	EventNotificationMessage,
	StateSnapshotMessage,
} from "@/types/websocket";
import { createLiveRunIndex } from "../../lib/live-run-index";

function buildRun(overrides: Partial<Run> = {}): Run {
	return {
		id: "run-1",
		projectId: "proj-1",
		projectName: "Project One",
		featureId: "emit-daemon",
		featureName: "Emit Daemon",
		name: "Emit Daemon Run",
		command: "/build",
		status: "running",
		harness: "codex",
		currentStep: "build",
		steps: [],
		artifacts: [],
		events: [],
		startedAt: "2026-04-14T00:00:00.000Z",
		lastEventAt: "2026-04-14T00:01:00.000Z",
		completedAt: null,
		error: null,
		agentSteps: null,
		...overrides,
	};
}

function buildEvent(
	overrides: Partial<EventNotificationMessage> &
		Pick<EventNotificationMessage, "eventId" | "eventType">,
): EventNotificationMessage {
	return {
		type: "event:notification",
		eventId: overrides.eventId,
		eventType: overrides.eventType,
		runId: overrides.runId ?? "run-1",
		projectId: overrides.projectId ?? "proj-1",
		featureId: overrides.featureId ?? "emit-daemon",
		runStatus: overrides.runStatus ?? null,
		step: overrides.step ?? null,
		unit: overrides.unit ?? null,
		data: overrides.data ?? null,
		createdAt: overrides.createdAt ?? "2026-04-14T00:05:00.000Z",
	};
}

function buildSnapshot(
	overrides: Partial<StateSnapshotMessage> = {},
): StateSnapshotMessage {
	return {
		type: "state:snapshot",
		scope: overrides.scope ?? "project",
		projectId: overrides.projectId ?? "proj-1",
		lastEventId: overrides.lastEventId ?? 41,
		runs: overrides.runs ?? [],
	};
}

describe("LiveRunIndex", () => {
	test("tracks cursors and reduces status-bearing events onto known runs", async () => {
		const index = createLiveRunIndex();
		index.upsertRun(buildRun());

		await index.applyEvent(
			buildEvent({
				eventId: 11,
				eventType: "waiting_for_user",
				step: "review",
				data: { prompt: "Need approval" },
				createdAt: "2026-04-14T00:02:00.000Z",
			}),
		);

		expect(index.getLastEventId("proj-1")).toBe(11);
		expect(index.getLastActivityAt("proj-1")).toBe("2026-04-14T00:02:00.000Z");
		expect(index.getRun("run-1")).toMatchObject({
			status: "waiting",
			currentStep: "review",
			lastEventAt: "2026-04-14T00:02:00.000Z",
			completedAt: null,
		});

		await index.applyEvent(
			buildEvent({
				eventId: 12,
				eventType: "status_change",
				step: "ship",
				runStatus: "completed",
				data: { status: "completed", message: "Finished cleanly" },
				createdAt: "2026-04-14T00:03:00.000Z",
			}),
		);

		expect(index.getLastEventId("proj-1")).toBe(12);
		expect(index.getLastActivityAt("proj-1")).toBe("2026-04-14T00:03:00.000Z");
		expect(index.getRun("run-1")).toMatchObject({
			status: "completed",
			currentStep: "ship",
			lastEventAt: "2026-04-14T00:03:00.000Z",
			completedAt: "2026-04-14T00:03:00.000Z",
			statusMessage: "Finished cleanly",
		});
	});

	test("uses derived runStatus for Socratic unit events and terminal outcome labels", async () => {
		const index = createLiveRunIndex();
		index.upsertRun(
			buildRun({
				command: "/socratic-duel",
				featureId: "socratic-duel",
				featureName: "Socratic Duel",
				name: "Socratic Duel",
				currentStep: "debating",
			}),
		);

		await index.applyEvent(
			buildEvent({
				eventId: 13,
				eventType: "status_change",
				runStatus: "running",
				step: "debating",
				unit: "turn:1",
				data: {
					status: "completed",
					event: "artifact_updated",
					terminal_outcome: null,
				},
				createdAt: "2026-04-14T00:04:00.000Z",
			}),
		);

		expect(index.getRun("run-1")).toMatchObject({
			status: "running",
			currentStep: "debating",
			completedAt: null,
			statusMessage: "Debating",
		});

		await index.applyEvent(
			buildEvent({
				eventId: 14,
				eventType: "status_change",
				runStatus: "completed",
				step: "completed",
				data: {
					status: "completed",
					outcome: "DISSENT",
					summary: "Material disagreement remains.",
				},
				createdAt: "2026-04-14T00:05:00.000Z",
			}),
		);

		expect(index.getRun("run-1")).toMatchObject({
			status: "completed",
			currentStep: "completed",
			completedAt: "2026-04-14T00:05:00.000Z",
			statusMessage: "Dissent",
		});
	});

	test("applies non-terminal event reducers without broad run mutations", async () => {
		const index = createLiveRunIndex();
		index.upsertRun(buildRun());

		await index.applyEvent(
			buildEvent({
				eventId: 21,
				eventType: "artifact_registered",
				data: { docId: "doc-1", path: "artifact.md" },
				createdAt: "2026-04-14T00:04:00.000Z",
			}),
		);
		expect(index.getRun("run-1")).toMatchObject({
			status: "running",
			lastEventAt: "2026-04-14T00:04:00.000Z",
		});

		await index.applyEvent(
			buildEvent({
				eventId: 22,
				eventType: "btw_update",
				data: { message: "Heads up" },
				createdAt: "2026-04-14T00:05:00.000Z",
			}),
		);
		expect(index.getRun("run-1")).toMatchObject({
			status: "running",
			lastEventAt: "2026-04-14T00:05:00.000Z",
		});

		await index.applyEvent(
			buildEvent({
				eventId: 23,
				eventType: "subflow_registered",
				data: { subflowName: "review" },
				createdAt: "2026-04-14T00:06:00.000Z",
			}),
		);
		expect(index.getRun("run-1")).toMatchObject({
			status: "running",
			lastEventAt: "2026-04-14T00:06:00.000Z",
		});

		await index.applyEvent(
			buildEvent({
				eventId: 24,
				eventType: "annotation_updated",
				data: { docId: "doc-1" },
				createdAt: "2026-04-14T00:07:00.000Z",
			}),
		);

		expect(index.getRun("run-1")).toMatchObject({
			status: "running",
			lastEventAt: "2026-04-14T00:06:00.000Z",
		});
		expect(index.getLastEventId("proj-1")).toBe(24);
		expect(index.getLastActivityAt("proj-1")).toBe("2026-04-14T00:07:00.000Z");
	});

	test("does not regress newer live lifecycle state with stale summaries", async () => {
		const index = createLiveRunIndex();
		index.upsertRun(
			buildRun({
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:04:00.000Z",
				statusMessage: "Building",
			}),
		);

		await index.applyEvent(
			buildEvent({
				eventId: 25,
				eventType: "waiting_for_user",
				step: "review",
				runStatus: "waiting",
				data: { prompt: "Approve?" },
				createdAt: "2026-04-14T00:05:00.000Z",
			}),
		);

		index.upsertRun(
			buildRun({
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:03:00.000Z",
				completedAt: null,
				error: "old error",
				statusMessage: "Old summary",
			}),
		);

		expect(index.getRun("run-1")).toMatchObject({
			status: "waiting",
			currentStep: "review",
			lastEventAt: "2026-04-14T00:05:00.000Z",
			completedAt: null,
			error: null,
			statusMessage: "Building",
		});
	});

	test("deduplicates unknown-run hydration and replays queued events once", async () => {
		let resolveFetch: (run: Run | null) => void = () => {
			throw new Error("Hydration fetch was not initialized");
		};
		let fetchCount = 0;
		const index = createLiveRunIndex({
			fetchRunSummary: (runId) => {
				fetchCount += 1;
				return new Promise<Run | null>((resolve) => {
					resolveFetch = (run) => {
						resolve(runId === "run-2" ? run : null);
					};
				});
			},
		});

		const firstEvent = index.applyEvent(
			buildEvent({
				eventId: 31,
				eventType: "status_change",
				runId: "run-2",
				step: "build",
				runStatus: "running",
				data: { status: "running" },
				createdAt: "2026-04-14T00:02:00.000Z",
			}),
		);
		const secondEvent = index.applyEvent(
			buildEvent({
				eventId: 32,
				eventType: "waiting_for_user",
				runId: "run-2",
				step: "review",
				data: { prompt: "Need input" },
				createdAt: "2026-04-14T00:03:00.000Z",
			}),
		);
		const thirdEvent = index.applyEvent(
			buildEvent({
				eventId: 33,
				eventType: "artifact_registered",
				runId: "run-2",
				data: { docId: "doc-2", path: "summary.md" },
				createdAt: "2026-04-14T00:04:00.000Z",
			}),
		);

		expect(fetchCount).toBe(1);
		expect(index.getRun("run-2")).toBeUndefined();
		expect(index.getLastEventId("proj-1")).toBe(33);
		expect(index.getLastActivityAt("proj-1")).toBe("2026-04-14T00:04:00.000Z");

		resolveFetch(
			buildRun({
				id: "run-2",
				name: "Hydrated Run",
				lastEventAt: "2026-04-14T00:01:30.000Z",
			}),
		);

		await Promise.all([firstEvent, secondEvent, thirdEvent]);

		expect(fetchCount).toBe(1);
		expect(index.getProjectRunIds("proj-1")).toEqual(["run-2"]);
		expect(index.getRunsForProject("proj-1")).toHaveLength(1);
		expect(index.getRun("run-2")).toMatchObject({
			status: "waiting",
			currentStep: "review",
			lastEventAt: "2026-04-14T00:04:00.000Z",
			completedAt: null,
		});
	});

	test("reconciles the project's active-run subset on snapshot recovery", () => {
		const index = createLiveRunIndex();
		index.upsertRuns([
			buildRun({
				id: "run-stale",
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:02:00.000Z",
			}),
			buildRun({
				id: "run-keep",
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:03:00.000Z",
			}),
			buildRun({
				id: "run-terminal",
				status: "completed",
				currentStep: "ship",
				lastEventAt: "2026-04-14T00:01:00.000Z",
				completedAt: "2026-04-14T00:01:00.000Z",
			}),
		]);

		index.applySnapshot(
			"proj-1",
			buildSnapshot({
				lastEventId: 44,
				runs: [
					{
						id: "run-keep",
						flow: "build",
						featureId: "emit-daemon",
						projectPath: "/tmp/project",
						status: "waiting",
						steps: [
							{ step: "build", status: "completed" },
							{ step: "review", status: "waiting" },
						],
						artifacts: [],
					},
				],
			}),
		);

		expect(index.getLastEventId("proj-1")).toBe(44);
		expect(index.getRun("run-stale")).toBeUndefined();
		expect(index.getRun("run-terminal")).toMatchObject({
			status: "completed",
			currentStep: "ship",
		});
		expect(index.getRun("run-keep")).toMatchObject({
			status: "waiting",
			currentStep: "review",
			completedAt: null,
		});
		expect(new Set(index.getProjectRunIds("proj-1"))).toEqual(
			new Set(["run-keep", "run-terminal"]),
		);
	});

	test("applies global snapshots without pruning unrelated project runs", () => {
		let fetchCount = 0;
		const index = createLiveRunIndex({
			fetchRunSummary: (runId) => {
				fetchCount += 1;
				return Promise.resolve(
					buildRun({
						id: runId,
						projectId: "proj-2",
						projectName: "Project Two",
					}),
				);
			},
		});

		index.upsertRuns([
			buildRun({
				id: "run-keep",
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:03:00.000Z",
			}),
			buildRun({
				id: "run-other-project",
				projectId: "proj-2",
				projectName: "Project Two",
				status: "running",
				currentStep: "build",
				lastEventAt: "2026-04-14T00:04:00.000Z",
			}),
		]);

		index.applyGlobalSnapshot(
			buildSnapshot({
				scope: "global",
				projectId: null,
				lastEventId: 50,
				runs: [
					{
						id: "run-keep",
						projectId: "proj-1",
						flow: "build",
						featureId: "emit-daemon",
						projectPath: "/tmp/project",
						status: "waiting",
						steps: [{ step: "review", status: "waiting" }],
						artifacts: [],
					},
					{
						id: "run-new",
						projectId: "proj-2",
						flow: "build",
						featureId: "emit-daemon",
						projectPath: "/tmp/other-project",
						status: "running",
						steps: [{ step: "build", status: "running" }],
						artifacts: [],
					},
				],
			}),
		);

		expect(index.getRun("run-keep")).toMatchObject({
			status: "waiting",
			currentStep: "review",
		});
		expect(index.getRun("run-other-project")).toMatchObject({
			status: "running",
			currentStep: "build",
		});
		expect(index.getProjectRunIds("proj-2")).toContain("run-other-project");
		expect(fetchCount).toBe(1);
	});
});
