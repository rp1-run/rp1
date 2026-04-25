import { describe, expect, test } from "bun:test";
import { VALID_STATUSES } from "../../../../shared/events";
import {
	getRunStatusLabel,
	getStatusLabel,
	STATUS_LABELS,
} from "../../lib/status-labels";

describe("STATUS_LABELS", () => {
	test("covers all canonical statuses", () => {
		expect(Object.keys(STATUS_LABELS).sort()).toEqual(
			[...VALID_STATUSES].sort(),
		);
	});

	test("maps each status to expected human-readable label", () => {
		expect(STATUS_LABELS.not_started).toBe("Not Started");
		expect(STATUS_LABELS.running).toBe("Running");
		expect(STATUS_LABELS.waiting).toBe("Waiting");
		expect(STATUS_LABELS.inactive).toBe("Inactive");
		expect(STATUS_LABELS.completed).toBe("Completed");
		expect(STATUS_LABELS.failed).toBe("Failed");
		expect(STATUS_LABELS.cancelled).toBe("Cancelled");
		expect(STATUS_LABELS.abandoned).toBe("Abandoned");
		expect(STATUS_LABELS.skipped).toBe("Skipped");
	});
});

describe("getStatusLabel", () => {
	test("returns correct label for each status", () => {
		for (const status of VALID_STATUSES) {
			expect(getStatusLabel(status)).toBe(STATUS_LABELS[status]);
		}
	});
});

describe("getRunStatusLabel", () => {
	const buildSocraticRun = (
		overrides: Partial<Parameters<typeof getRunStatusLabel>[0]> = {},
	): Parameters<typeof getRunStatusLabel>[0] => ({
		command: "/socratic-duel",
		currentStep: "preparing",
		events: [],
		status: "running",
		statusMessage: null,
		...overrides,
	});

	test("shows Socratic active step labels instead of generic run statuses", () => {
		expect(
			getRunStatusLabel(buildSocraticRun({ currentStep: "preparing" })),
		).toBe("Preparing");
		expect(
			getRunStatusLabel(
				buildSocraticRun({ currentStep: "waiting_for_participant" }),
			),
		).toBe("Waiting for participant");
		expect(
			getRunStatusLabel(buildSocraticRun({ currentStep: "debating" })),
		).toBe("Debating");
		expect(
			getRunStatusLabel(buildSocraticRun({ currentStep: "closing" })),
		).toBe("Closing");
	});

	test("shows Socratic terminal outcome labels from event metadata", () => {
		for (const [outcome, label] of [
			["ACCEPTED_CONSENSUS", "Completed"],
			["DISSENT", "Dissent"],
			["MAX_TURNS", "Max turns"],
			["TIMEOUT", "Timed out"],
			["INVALIDATED", "Invalidated"],
		] as const) {
			expect(
				getRunStatusLabel(
					buildSocraticRun({
						currentStep: "completed",
						events: [
							{
								id: `event-${outcome}`,
								type: "status_change",
								message: label,
								timestamp: "2026-04-14T00:00:00.000Z",
								stepId: "completed",
								metadata: { outcome },
							},
						],
						status: outcome === "INVALIDATED" ? "failed" : "completed",
					}),
				),
			).toBe(label);
		}
	});
});
