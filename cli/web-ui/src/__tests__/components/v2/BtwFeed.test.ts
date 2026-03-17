import { describe, expect, test } from "bun:test";
import type { RunEvent } from "../../../types/runs";

function makeBtwEvent(
	id: string,
	message: string,
	timestamp: string,
): RunEvent {
	return {
		id,
		type: "btw_update",
		message,
		timestamp,
		stepId: null,
		metadata: null,
	};
}

function makeStatusEvent(id: string, timestamp: string): RunEvent {
	return {
		id,
		type: "status_change",
		message: "Step transitioned to running",
		timestamp,
		stepId: "step-1",
		metadata: { status: "running" },
	};
}

function filterBtwEvents(events: readonly RunEvent[]): RunEvent[] {
	return events
		.filter((e) => e.type === "btw_update")
		.sort(
			(a, b) =>
				new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
		);
}

describe("BtwFeed filtering logic", () => {
	test("filters only btw_update events from mixed event list", () => {
		const events: RunEvent[] = [
			makeBtwEvent("1", "Found unused imports", "2026-03-15T10:00:00Z"),
			makeStatusEvent("2", "2026-03-15T10:01:00Z"),
			makeBtwEvent("3", "Discovered dead code", "2026-03-15T10:02:00Z"),
			makeStatusEvent("4", "2026-03-15T10:03:00Z"),
		];

		const filtered = filterBtwEvents(events);

		expect(filtered).toHaveLength(2);
		expect(filtered.every((e) => e.type === "btw_update")).toBe(true);
	});

	test("returns empty array when no btw_update events exist", () => {
		const events: RunEvent[] = [
			makeStatusEvent("1", "2026-03-15T10:00:00Z"),
			makeStatusEvent("2", "2026-03-15T10:01:00Z"),
		];

		const filtered = filterBtwEvents(events);

		expect(filtered).toHaveLength(0);
	});

	test("returns empty array for empty events list", () => {
		expect(filterBtwEvents([])).toHaveLength(0);
	});

	test("sorts btw events in reverse chronological order", () => {
		const events: RunEvent[] = [
			makeBtwEvent("1", "First", "2026-03-15T10:00:00Z"),
			makeBtwEvent("2", "Third", "2026-03-15T10:30:00Z"),
			makeBtwEvent("3", "Second", "2026-03-15T10:15:00Z"),
		];

		const filtered = filterBtwEvents(events);

		expect(filtered[0].message).toBe("Third");
		expect(filtered[1].message).toBe("Second");
		expect(filtered[2].message).toBe("First");
	});
});
