import { describe, expect, test } from "bun:test";
import { formatCheckOutputHookText } from "../../commands/update/index.js";

describe("formatCheckOutputHookText", () => {
	test("returns a message when an update is available", () => {
		const result = formatCheckOutputHookText({
			currentVersion: "0.6.5",
			latestVersion: "0.6.6",
			updateAvailable: true,
			releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v0.6.6",
			error: null,
			cached: true,
			cacheAgeHours: 0.5,
			cacheExpiresInHours: 23.5,
		});

		expect(result).toBe(
			"rp1 update available: v0.6.5 -> v0.6.6 | Run /self-update to update",
		);
	});

	test("returns null when no update is available", () => {
		const result = formatCheckOutputHookText({
			currentVersion: "0.6.5",
			latestVersion: "0.6.5",
			updateAvailable: false,
			releaseUrl: "https://github.com/rp1-run/rp1/releases/tag/v0.6.5",
			error: null,
			cached: true,
			cacheAgeHours: 0.5,
			cacheExpiresInHours: 23.5,
		});

		expect(result).toBeNull();
	});

	test("returns null when the check errored", () => {
		const result = formatCheckOutputHookText({
			currentVersion: "0.6.5",
			latestVersion: null,
			updateAvailable: false,
			releaseUrl: null,
			error: "network error",
			cached: false,
			cacheAgeHours: null,
			cacheExpiresInHours: null,
		});

		expect(result).toBeNull();
	});
});
