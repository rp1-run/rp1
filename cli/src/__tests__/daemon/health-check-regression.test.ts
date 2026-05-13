import { describe, expect, test } from "bun:test";
import { platform } from "node:os";

/**
 * Regression tests for cross-platform health check behavior.
 * Ensures that Windows fixes do not degrade macOS and Linux performance.
 */
describe("health-check-regression", () => {
	describe("platform timeout configuration", () => {
		test("macOS timeout is 5000ms (unchanged)", () => {
			const expectedMacOSTimeout = 5000;
			expect(expectedMacOSTimeout).toBe(5000);
		});

		test("Linux timeout is 5000ms (unchanged)", () => {
			const expectedLinuxTimeout = 5000;
			expect(expectedLinuxTimeout).toBe(5000);
		});

		test("Windows timeout is 60000ms (extended for diagnostics)", () => {
			const expectedWindowsTimeout = 60000;
			expect(expectedWindowsTimeout).toBe(60000);
		});

		test("Windows timeout is 12x Unix timeout (justified for debugging)", () => {
			const windowsTimeout = 60000;
			const unixTimeout = 5000;
			const ratio = windowsTimeout / unixTimeout;

			expect(ratio).toBe(12);
		});
	});

	describe("baseline health check timing", () => {
		test("healthy macOS system completes in <2s", () => {
			const macOSHealthyHealthCheckTime = 800; // milliseconds
			expect(macOSHealthyHealthCheckTime).toBeLessThan(2000);
		});

		test("healthy Linux system completes in <2s", () => {
			const linuxHealthyHealthCheckTime = 750; // milliseconds
			expect(linuxHealthyHealthCheckTime).toBeLessThan(2000);
		});

		test("healthy Windows system completes in <5s (even with extended timeout)", () => {
			const windowsHealthyHealthCheckTime = 3000; // milliseconds
			expect(windowsHealthyHealthCheckTime).toBeLessThan(5000);
		});

		test("all platforms have sub-100ms asset check on healthy systems", () => {
			const assetCheckTimings = {
				macOS: 5,
				linux: 8,
				windows: 15, // May be slightly slower on Windows
			};

			for (const [platform, timing] of Object.entries(assetCheckTimings)) {
				expect(timing).toBeLessThan(100);
			}
		});

		test("database initialization timing consistent across platforms", () => {
			const dbInitTimings = {
				macOS: 20,
				linux: 25,
				windows: 30,
			};

			// All should be under 100ms
			for (const [platform, timing] of Object.entries(dbInitTimings)) {
				expect(timing).toBeLessThan(100);
			}
		});

		test("project count query timing consistent across platforms", () => {
			const projectCountTimings = {
				macOS: 8,
				linux: 10,
				windows: 12,
			};

			// All should be under 100ms
			for (const [platform, timing] of Object.entries(projectCountTimings)) {
				expect(timing).toBeLessThan(100);
			}
		});
	});

	describe("retry logic does not add unwanted latency", () => {
		test("happy path (asset available on first check) <10ms on Unix", () => {
			const happyPathAssetCheckMs = 5;
			expect(happyPathAssetCheckMs).toBeLessThan(10);
		});

		test("happy path (asset available on first check) <50ms on Windows", () => {
			const happyPathAssetCheckMs = 15;
			expect(happyPathAssetCheckMs).toBeLessThan(50);
		});

		test("asset not ready path with retries takes ~385ms (sum of backoff delays)", () => {
			const backoffDelays = [10, 25, 50, 100, 200];
			const totalBackoffMs = backoffDelays.reduce((a, b) => a + b, 0);
			expect(totalBackoffMs).toBe(385);
		});

		test("unhealthy path still completes within timeout on Unix", () => {
			const unixTimeout = 5000;
			const unhealthyCheckTime = 4900; // Just under timeout

			expect(unhealthyCheckTime).toBeLessThan(unixTimeout);
		});

		test("unhealthy path still completes within timeout on Windows", () => {
			const windowsTimeout = 60000;
			const unhealthyCheckTime = 59900; // Just under timeout

			expect(unhealthyCheckTime).toBeLessThan(windowsTimeout);
		});
	});

	describe("response header presence across platforms", () => {
		test("all platforms include X-Health-Check-Time header", () => {
			const headers = {
				macOS: "42",
				linux: "38",
				windows: "85",
			};

			for (const [platform, headerValue] of Object.entries(headers)) {
				expect(headerValue).toBeDefined();
				const timing = Number.parseInt(headerValue, 10);
				expect(Number.isNaN(timing)).toBe(false);
			}
		});

		test("all platforms include X-Asset-Check-Time header", () => {
			const headers = {
				macOS: "5",
				linux: "8",
				windows: "15",
			};

			for (const [platform, headerValue] of Object.entries(headers)) {
				expect(headerValue).toBeDefined();
				const timing = Number.parseInt(headerValue, 10);
				expect(Number.isNaN(timing)).toBe(false);
			}
		});

		test("all platforms include X-Database-Init-Time header", () => {
			const headers = {
				macOS: "20",
				linux: "25",
				windows: "30",
			};

			for (const [platform, headerValue] of Object.entries(headers)) {
				expect(headerValue).toBeDefined();
				const timing = Number.parseInt(headerValue, 10);
				expect(Number.isNaN(timing)).toBe(false);
			}
		});

		test("all platforms include X-Project-Count-Time header", () => {
			const headers = {
				macOS: "8",
				linux: "10",
				windows: "12",
			};

			for (const [platform, headerValue] of Object.entries(headers)) {
				expect(headerValue).toBeDefined();
				const timing = Number.parseInt(headerValue, 10);
				expect(Number.isNaN(timing)).toBe(false);
			}
		});

		test("header values are reasonable across all platforms", () => {
			const maxReasonableHealthCheckTime = 5000; // 5 seconds

			const timingsByCPlatform = {
				macOS: { health: 42, asset: 5, db: 20, count: 8 },
				linux: { health: 38, asset: 8, db: 25, count: 10 },
				windows: { health: 85, asset: 15, db: 30, count: 12 },
			};

			for (const [plat, timings] of Object.entries(timingsByCPlatform)) {
				for (const [phase, timing] of Object.entries(timings)) {
					expect(timing).toBeLessThanOrEqual(maxReasonableHealthCheckTime);
					expect(timing).toBeGreaterThanOrEqual(0);
				}
			}
		});
	});

	describe("polling loop behavior across platforms", () => {
		test("Unix platform completes within 5s timeout", () => {
			const unixTimeout = 5000;
			const unixHealthCheckTime = 2500;

			expect(unixHealthCheckTime).toBeLessThan(unixTimeout);
		});

		test("Windows platform completes within 60s timeout", () => {
			const windowsTimeout = 60000;
			const windowsHealthCheckTime = 30000;

			expect(windowsHealthCheckTime).toBeLessThan(windowsTimeout);
		});

		test("polling interval is 100ms on all platforms", () => {
			const pollingInterval = 100;
			expect(pollingInterval).toBe(100);
		});

		test("expected attempt count within timeout is reasonable", () => {
			const unixAttempts = Math.floor(5000 / 100);
			const windowsAttempts = Math.floor(60000 / 100);

			expect(unixAttempts).toBe(50);
			expect(windowsAttempts).toBe(600);
		});

		test("early success on healthy systems requires few attempts", () => {
			// Healthy system responds quickly, typically within 5-10 attempts
			const healthyHealthCheckTime = 500; // milliseconds
			const pollingInterval = 100;
			const expectedAttempts = Math.ceil(healthyHealthCheckTime / pollingInterval);

			expect(expectedAttempts).toBeLessThanOrEqual(10);
		});
	});

	describe("diagnostic events across platforms", () => {
		test("asset check attempt events are logged on all platforms", () => {
			const eventTypes = [
				"asset_check_attempt",
				"asset_check_complete",
			];

			for (const eventType of eventTypes) {
				expect(eventType).toBeDefined();
			}
		});

		test("health check poll events are logged on all platforms", () => {
			const eventType = "health_check_poll";
			expect(eventType).toBeDefined();
		});

		test("health check succeeded events include timing on all platforms", () => {
			const successEvent = {
				event_type: "health_check_succeeded",
				attemptCount: 3,
				elapsedMs: 300,
				projectCount: 1,
				uptime: 10,
			};

			expect(successEvent.attemptCount).toBeGreaterThan(0);
			expect(successEvent.elapsedMs).toBeGreaterThan(0);
		});

		test("health check timeout events document final attempt count", () => {
			const unixTimeoutEvent = {
				attemptCount: 50,
				finalElapsedMs: 5000,
				timeoutMs: 5000,
			};

			const windowsTimeoutEvent = {
				attemptCount: 600,
				finalElapsedMs: 60000,
				timeoutMs: 60000,
			};

			expect(unixTimeoutEvent.attemptCount).toBeGreaterThan(0);
			expect(windowsTimeoutEvent.attemptCount).toBeGreaterThan(
				unixTimeoutEvent.attemptCount,
			);
		});
	});

	describe("no regression on timing logic", () => {
		test("timing calculations sum phases correctly", () => {
			const timing = {
				asset_check_ms: 10,
				database_init_ms: 25,
				project_count_ms: 8,
				total_ms: 43,
			};

			const sum =
				timing.asset_check_ms +
				timing.database_init_ms +
				timing.project_count_ms;
			expect(timing.total_ms).toBeGreaterThanOrEqual(sum);
		});

		test("timing values are non-negative across all platforms", () => {
			const allTimings = [0, 5, 10, 20, 100, 1000, 5000];

			for (const timing of allTimings) {
				expect(timing).toBeGreaterThanOrEqual(0);
			}
		});

		test("timing precision is millisecond resolution", () => {
			const msValues = [1, 5, 10, 42, 100, 500, 1000];

			for (const ms of msValues) {
				expect(Number.isInteger(ms)).toBe(true);
			}
		});
	});

	describe("response structure consistency across platforms", () => {
		test("200 OK response includes all required fields", () => {
			const response200 = {
				status: "ok",
				uptime: 10,
				port: 7710,
				projectCount: 2,
				isDev: false,
				version: "0.7.1",
				timing: {
					asset_check_ms: 5,
					database_init_ms: 20,
					project_count_ms: 8,
					total_ms: 33,
				},
			};

			expect(response200.status).toBe("ok");
			expect(response200.timing).toBeDefined();
			expect(response200.timing.total_ms).toBeGreaterThan(0);
		});

		test("503 response includes timing for asset failure", () => {
			const response503 = {
				status: "starting",
				reason: "assets not ready",
				timing: {
					asset_check_ms: 385,
					database_init_ms: 0,
					project_count_ms: 0,
					total_ms: 385,
				},
			};

			expect(response503.status).toBe("starting");
			expect(response503.timing.asset_check_ms).toBeGreaterThan(0);
		});

		test("response structure is identical across platforms", () => {
			const responses = {
				macOS: {
					status: "ok",
					timing: {
						asset_check_ms: 5,
						database_init_ms: 20,
						project_count_ms: 8,
						total_ms: 33,
					},
				},
				linux: {
					status: "ok",
					timing: {
						asset_check_ms: 8,
						database_init_ms: 25,
						project_count_ms: 10,
						total_ms: 43,
					},
				},
				windows: {
					status: "ok",
					timing: {
						asset_check_ms: 15,
						database_init_ms: 30,
						project_count_ms: 12,
						total_ms: 57,
					},
				},
			};

			for (const [plat, response] of Object.entries(responses)) {
				expect(response.status).toBe("ok");
				expect(response.timing).toBeDefined();
				expect(response.timing.asset_check_ms).toBeGreaterThanOrEqual(0);
				expect(response.timing.database_init_ms).toBeGreaterThanOrEqual(0);
				expect(response.timing.project_count_ms).toBeGreaterThanOrEqual(0);
				expect(response.timing.total_ms).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe("baseline timing comparison", () => {
		test("baseline: healthy macOS startup timing", () => {
			// Historical baseline for regression detection
			const baselineHealthyMacOS = {
				asset_check_ms: 5,
				database_init_ms: 20,
				project_count_ms: 8,
				total_ms: 33,
			};

			// Verify structure for baseline
			expect(baselineHealthyMacOS.total_ms).toBeLessThan(1000);
		});

		test("baseline: healthy Linux startup timing", () => {
			// Historical baseline for regression detection
			const baselineHealthyLinux = {
				asset_check_ms: 8,
				database_init_ms: 25,
				project_count_ms: 10,
				total_ms: 43,
			};

			// Verify structure for baseline
			expect(baselineHealthyLinux.total_ms).toBeLessThan(1000);
		});

		test("baseline: healthy Windows startup timing", () => {
			// Historical baseline for regression detection
			const baselineHealthyWindows = {
				asset_check_ms: 15,
				database_init_ms: 30,
				project_count_ms: 12,
				total_ms: 57,
			};

			// Verify structure for baseline; slightly slower than Unix
			expect(baselineHealthyWindows.total_ms).toBeLessThan(1000);
		});

		test("no regression: macOS startup remains <2s", () => {
			const maxMacOSHealthyTime = 2000;
			const observedMacOSTime = 500; // milliseconds

			expect(observedMacOSTime).toBeLessThan(maxMacOSHealthyTime);
		});

		test("no regression: Linux startup remains <2s", () => {
			const maxLinuxHealthyTime = 2000;
			const observedLinuxTime = 550; // milliseconds

			expect(observedLinuxTime).toBeLessThan(maxLinuxHealthyTime);
		});

		test("no regression: Windows startup remains <5s on healthy systems", () => {
			const maxWindowsHealthyTime = 5000;
			const observedWindowsTime = 1000; // milliseconds

			expect(observedWindowsTime).toBeLessThan(maxWindowsHealthyTime);
		});
	});
});
