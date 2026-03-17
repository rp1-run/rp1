import { describe, expect, test } from "bun:test";
import { VALID_STATUSES } from "../../../../shared/events";
import { getStatusLabel, STATUS_LABELS } from "../../lib/status-labels";

describe("STATUS_LABELS", () => {
	test("covers all 6 canonical statuses", () => {
		expect(Object.keys(STATUS_LABELS).sort()).toEqual(
			[...VALID_STATUSES].sort(),
		);
	});

	test("maps each status to expected human-readable label", () => {
		expect(STATUS_LABELS.not_started).toBe("Not Started");
		expect(STATUS_LABELS.running).toBe("Running");
		expect(STATUS_LABELS.waiting).toBe("Waiting");
		expect(STATUS_LABELS.completed).toBe("Completed");
		expect(STATUS_LABELS.failed).toBe("Failed");
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
