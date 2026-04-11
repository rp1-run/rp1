import { describe, expect, test } from "bun:test";
import { formatRelativeTime } from "../../lib/time";

function dateMinusSeconds(seconds: number): string {
	return new Date(Date.now() - seconds * 1000).toISOString();
}

function dateMinusMinutes(minutes: number): string {
	return dateMinusSeconds(minutes * 60);
}

function dateMinusHours(hours: number): string {
	return dateMinusMinutes(hours * 60);
}

function dateMinusDays(days: number): string {
	return dateMinusHours(days * 24);
}

describe("formatRelativeTime", () => {
	test("returns 'just now' for less than 60 seconds ago", () => {
		expect(formatRelativeTime(dateMinusSeconds(0))).toBe("just now");
		expect(formatRelativeTime(dateMinusSeconds(30))).toBe("just now");
		expect(formatRelativeTime(dateMinusSeconds(59))).toBe("just now");
	});

	test("returns minutes ago at the 60-second boundary", () => {
		expect(formatRelativeTime(dateMinusSeconds(60))).toBe("1m ago");
		expect(formatRelativeTime(dateMinusSeconds(90))).toBe("1m ago");
		expect(formatRelativeTime(dateMinusMinutes(30))).toBe("30m ago");
		expect(formatRelativeTime(dateMinusMinutes(59))).toBe("59m ago");
	});

	test("returns hours ago at the 60-minute boundary", () => {
		expect(formatRelativeTime(dateMinusMinutes(60))).toBe("1h ago");
		expect(formatRelativeTime(dateMinusHours(12))).toBe("12h ago");
		expect(formatRelativeTime(dateMinusHours(23))).toBe("23h ago");
	});

	test("returns '1d ago' at the 24-hour boundary", () => {
		expect(formatRelativeTime(dateMinusHours(24))).toBe("1d ago");
		expect(formatRelativeTime(dateMinusDays(1))).toBe("1d ago");
	});

	test("returns days ago for 2-6 days", () => {
		expect(formatRelativeTime(dateMinusDays(2))).toBe("2d ago");
		expect(formatRelativeTime(dateMinusDays(6))).toBe("6d ago");
	});

	test("returns locale date string at 7-day boundary", () => {
		const sevenDaysAgo = dateMinusDays(7);
		const expected = new Date(sevenDaysAgo).toLocaleDateString();
		expect(formatRelativeTime(sevenDaysAgo)).toBe(expected);
	});

	test("returns locale date string for dates older than 7 days", () => {
		const thirtyDaysAgo = dateMinusDays(30);
		const expected = new Date(thirtyDaysAgo).toLocaleDateString();
		expect(formatRelativeTime(thirtyDaysAgo)).toBe(expected);
	});
});
