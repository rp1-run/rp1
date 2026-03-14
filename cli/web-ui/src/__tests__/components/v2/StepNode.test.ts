import { describe, expect, test } from "bun:test";
import { formatDuration, statusStyles } from "../../../components/v2/StepNode";
import type { StepStatus } from "../../../types/runs";

describe("StepNode", () => {
	describe("statusStyles mapping", () => {
		test("covers all StepStatus values", () => {
			const allStatuses: StepStatus[] = [
				"pending",
				"running",
				"completed",
				"failed",
				"skipped",
				"waiting-input",
				"needs-review",
			];
			for (const status of allStatuses) {
				expect(statusStyles[status]).toBeDefined();
				expect(statusStyles[status].border).toBeTruthy();
				expect(statusStyles[status].bg).toBeTruthy();
			}
		});

		test("pending uses dashed border and card background", () => {
			expect(statusStyles.pending.border).toContain("border-dashed");
			expect(statusStyles.pending.border).toContain("border-border");
			expect(statusStyles.pending.bg).toBe("bg-card");
			expect(statusStyles.pending.animation).toBeUndefined();
		});

		test("running uses solid border with glow-pulse animation", () => {
			expect(statusStyles.running.border).toContain("border-solid");
			expect(statusStyles.running.border).toContain("border-status-running");
			expect(statusStyles.running.bg).toBe("bg-status-running/10");
			expect(statusStyles.running.animation).toBe("animate-glow-pulse");
		});

		test("completed uses solid border and green background", () => {
			expect(statusStyles.completed.border).toContain("border-solid");
			expect(statusStyles.completed.border).toContain(
				"border-status-completed",
			);
			expect(statusStyles.completed.bg).toBe("bg-status-completed/10");
			expect(statusStyles.completed.animation).toBeUndefined();
		});

		test("failed uses solid border and red background", () => {
			expect(statusStyles.failed.border).toContain("border-solid");
			expect(statusStyles.failed.border).toContain("border-status-failed");
			expect(statusStyles.failed.bg).toBe("bg-status-failed/10");
		});

		test("waiting-input uses solid border and waiting background", () => {
			expect(statusStyles["waiting-input"].border).toContain("border-solid");
			expect(statusStyles["waiting-input"].border).toContain(
				"border-status-waiting",
			);
			expect(statusStyles["waiting-input"].bg).toBe("bg-status-waiting/10");
		});

		test("needs-review uses solid border and needs-review background", () => {
			expect(statusStyles["needs-review"].border).toContain("border-solid");
			expect(statusStyles["needs-review"].border).toContain(
				"border-status-needs-review",
			);
			expect(statusStyles["needs-review"].bg).toBe("bg-status-needs-review/10");
		});

		test("skipped uses dashed border and muted background", () => {
			expect(statusStyles.skipped.border).toContain("border-dashed");
			expect(statusStyles.skipped.border).toContain(
				"border-muted-foreground/40",
			);
			expect(statusStyles.skipped.bg).toBe("bg-muted/30");
		});

		test("only running status has animation", () => {
			for (const [status, style] of Object.entries(statusStyles)) {
				if (status === "running") {
					expect(style.animation).toBeTruthy();
				} else {
					expect(style.animation).toBeUndefined();
				}
			}
		});
	});

	describe("formatDuration", () => {
		test("formats seconds-only duration", () => {
			const start = "2026-03-14T10:00:00Z";
			const end = "2026-03-14T10:00:45Z";
			expect(formatDuration(start, end)).toBe("45s");
		});

		test("formats minutes and seconds", () => {
			const start = "2026-03-14T10:00:00Z";
			const end = "2026-03-14T10:05:30Z";
			expect(formatDuration(start, end)).toBe("5m 30s");
		});

		test("formats hours and minutes", () => {
			const start = "2026-03-14T10:00:00Z";
			const end = "2026-03-14T12:15:00Z";
			expect(formatDuration(start, end)).toBe("2h 15m");
		});

		test("uses current time when completedAt is null", () => {
			const now = new Date();
			const tenSecondsAgo = new Date(now.getTime() - 10_000).toISOString();
			const result = formatDuration(tenSecondsAgo, null);
			expect(result).toMatch(/^\d+s$/);
		});

		test("returns 0s for zero duration", () => {
			const start = "2026-03-14T10:00:00Z";
			expect(formatDuration(start, start)).toBe("0s");
		});
	});
});
