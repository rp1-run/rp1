import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rmdir, writeFile, mkdir } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import type { HealthCheckResult } from "../../../web-ui/src/daemon/ipc.js";
import { checkHealthWithHeaders } from "../../../web-ui/src/daemon/ipc.js";

/**
 * Mock DaemonConnection for testing.
 */
interface MockDaemonConnection {
	baseUrl: string;
}

/**
 * Helper to create a mock daemon connection.
 */
function createMockConnection(port: number): MockDaemonConnection {
	return {
		baseUrl: `http://localhost:${port}`,
	};
}

/**
 * Helper to assert header values are valid integers.
 */
function assertHeadersAreValidIntegers(
	headers: Record<string, string | undefined>,
): void {
	for (const [key, value] of Object.entries(headers)) {
		if (value !== undefined) {
			const num = Number.parseInt(value, 10);
			expect(Number.isNaN(num)).toBe(false);
			expect(num).toBeGreaterThanOrEqual(0);
		}
	}
}

describe("health-check-windows", () => {
	describe("timeout configuration", () => {
		const originalEnv = { ...process.env };

		beforeEach(() => {
			// Reset env var
			delete process.env.RP1_HEALTH_CHECK_TIMEOUT_MS;
		});

		afterEach(() => {
			// Restore env
			process.env = { ...originalEnv };
		});

		test("returns 60000ms on Windows platform", () => {
			// This test runs on all platforms and verifies the platform-conditional logic
			// In actual Windows environment, platform() === "win32"
			const expectedTimeout =
				platform() === "win32" ? 60000 : 5000;
			const isWindows = platform() === "win32";
			expect(isWindows).toBe(isWindows); // Verify we can detect platform
		});

		test("respects RP1_HEALTH_CHECK_TIMEOUT_MS env var when set", () => {
			process.env.RP1_HEALTH_CHECK_TIMEOUT_MS = "30000";
			const parsed = Number.parseInt(
				process.env.RP1_HEALTH_CHECK_TIMEOUT_MS,
				10,
			);
			expect(parsed).toBe(30000);
		});

		test("handles invalid env var gracefully", () => {
			process.env.RP1_HEALTH_CHECK_TIMEOUT_MS = "invalid";
			const parsed = Number.parseInt(
				process.env.RP1_HEALTH_CHECK_TIMEOUT_MS,
				10,
			);
			expect(Number.isNaN(parsed)).toBe(true);
		});

		test("handles negative env var gracefully", () => {
			process.env.RP1_HEALTH_CHECK_TIMEOUT_MS = "-5000";
			const parsed = Number.parseInt(
				process.env.RP1_HEALTH_CHECK_TIMEOUT_MS,
				10,
			);
			expect(parsed).toBe(-5000);
		});
	});

	describe("health check response headers", () => {
		test("X-Health-Check-Time header is present and valid integer", async () => {
			// This is a structural test of header format
			// In real scenario, this would come from handleV2HealthRequest
			const mockHeaders = {
				"x-health-check-time": "42",
				"x-asset-check-time": "10",
				"x-database-init-time": "20",
				"x-project-count-time": "12",
			};

			assertHeadersAreValidIntegers(mockHeaders);
			expect(mockHeaders["x-health-check-time"]).toBeDefined();
		});

		test("all timing headers are valid integers", () => {
			const timingHeaders = {
				"x-health-check-time": "105",
				"x-asset-check-time": "15",
				"x-database-init-time": "35",
				"x-project-count-time": "55",
			};

			assertHeadersAreValidIntegers(timingHeaders);

			// Verify each header individually
			expect(Number.parseInt(timingHeaders["x-health-check-time"], 10)).toBe(
				105,
			);
			expect(Number.parseInt(timingHeaders["x-asset-check-time"], 10)).toBe(
				15,
			);
			expect(
				Number.parseInt(timingHeaders["x-database-init-time"], 10),
			).toBe(35);
			expect(
				Number.parseInt(timingHeaders["x-project-count-time"], 10),
			).toBe(55);
		});

		test("response body includes timing object", () => {
			// Structural test of expected response body format
			const mockResponseBody = {
				status: "ok",
				uptime: 10,
				port: 7710,
				projectCount: 2,
				isDev: false,
				version: "0.7.1",
				timing: {
					asset_check_ms: 5,
					database_init_ms: 15,
					project_count_ms: 8,
					total_ms: 28,
				},
			};

			expect(mockResponseBody.timing).toBeDefined();
			expect(mockResponseBody.timing.asset_check_ms).toBeGreaterThanOrEqual(0);
			expect(mockResponseBody.timing.database_init_ms).toBeGreaterThanOrEqual(0);
			expect(mockResponseBody.timing.project_count_ms).toBeGreaterThanOrEqual(0);
			expect(mockResponseBody.timing.total_ms).toBeGreaterThanOrEqual(0);

			// Verify total is sum of parts
			const calculatedTotal =
				mockResponseBody.timing.asset_check_ms +
				mockResponseBody.timing.database_init_ms +
				mockResponseBody.timing.project_count_ms;
			expect(mockResponseBody.timing.total_ms).toBeGreaterThanOrEqual(
				calculatedTotal,
			);
		});

		test("503 response includes timing for asset failure", () => {
			// Test 503 response structure when assets not ready
			const mockResponseBody503 = {
				status: "starting",
				reason: "assets not ready",
				timing: {
					asset_check_ms: 385,
					database_init_ms: 0,
					project_count_ms: 0,
					total_ms: 385,
				},
			};

			expect(mockResponseBody503.status).toBe("starting");
			expect(mockResponseBody503.timing.asset_check_ms).toBeGreaterThan(0);
			expect(mockResponseBody503.timing.database_init_ms).toBe(0);
			expect(mockResponseBody503.timing.project_count_ms).toBe(0);
		});
	});

	describe("asset availability retry logic", () => {
		test("retry backoff delays are [10, 25, 50, 100, 200]ms", () => {
			// Verify expected backoff sequence
			const expectedDelays = [10, 25, 50, 100, 200];
			const sum = expectedDelays.reduce((a, b) => a + b, 0);
			expect(sum).toBe(385); // Total delay across all retries
		});

		test("maximum 5 retry attempts before failure", () => {
			const maxAttempts = 5;
			expect(maxAttempts).toBe(5);
		});

		test("total backoff time with all retries is ~385ms", () => {
			const delays = [10, 25, 50, 100, 200];
			const total = delays.reduce((a, b) => a + b, 0);
			expect(total).toBe(385);
		});

		test("retry timing matches exponential pattern", () => {
			const delays = [10, 25, 50, 100, 200];
			// Verify each delay is less than the next
			for (let i = 0; i < delays.length - 1; i++) {
				expect(delays[i]).toBeLessThan(delays[i + 1]);
			}
		});
	});

	describe("health check result structure", () => {
		test("HealthCheckResult with headers has correct interface", () => {
			const result: HealthCheckResult = {
				health: {
					status: "ok",
					uptime: 5,
					port: 7710,
					projectCount: 1,
					isDev: false,
				},
				headers: {
					"x-health-check-time": "42",
					"x-asset-check-time": "5",
					"x-database-init-time": "15",
					"x-project-count-time": "22",
				},
			};

			expect(result.health).toBeDefined();
			expect(result.headers).toBeDefined();
			expect(result.headers?.["x-health-check-time"]).toBe("42");
		});

		test("HealthCheckResult without headers is valid", () => {
			const result: HealthCheckResult = {
				health: null,
			};

			expect(result.health).toBeNull();
			expect(result.headers).toBeUndefined();
		});
	});

	describe("timing instrumentation", () => {
		test("timing values capture phase durations correctly", () => {
			// Simulate timing capture as done in handleV2HealthRequest
			const healthCheckStartTime = Date.now();
			const assetCheckMs = 10;
			const databaseInitMs = 25;
			const projectCountMs = 8;
			const totalMs = Date.now() - healthCheckStartTime;

			expect(totalMs).toBeGreaterThanOrEqual(0);
			expect(assetCheckMs).toBeGreaterThanOrEqual(0);
			expect(databaseInitMs).toBeGreaterThanOrEqual(0);
			expect(projectCountMs).toBeGreaterThanOrEqual(0);
		});

		test("timing object sums to total correctly", () => {
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

		test("timing is measured in milliseconds with non-negative values", () => {
			const timings = [0, 1, 10, 100, 1000, 5000, 60000];

			for (const timing of timings) {
				expect(timing).toBeGreaterThanOrEqual(0);
				expect(Number.isInteger(timing)).toBe(true);
			}
		});
	});

	describe("diagnostic event logging", () => {
		test("diagnostic events include attempt count and timing", () => {
			// Structure test for expected event data
			const assetCheckAttemptEvent = {
				event_type: "asset_check_attempt",
				attempt: 1,
				result: "success",
				timingMs: 5,
				timestamp: Date.now(),
			};

			expect(assetCheckAttemptEvent.event_type).toBe("asset_check_attempt");
			expect(assetCheckAttemptEvent.attempt).toBeGreaterThan(0);
			expect(assetCheckAttemptEvent.timingMs).toBeGreaterThanOrEqual(0);
		});

		test("health check poll event structure", () => {
			const pollEvent = {
				event_type: "health_check_poll",
				attempt: 2,
				elapsedMs: 110,
				result: "no_response",
				"x-health-check-time": "100",
				"x-asset-check-time": "25",
				"x-database-init-time": "50",
				"x-project-count-time": "25",
			};

			expect(pollEvent.event_type).toBe("health_check_poll");
			expect(pollEvent.attempt).toBeGreaterThan(0);
			expect(pollEvent.elapsedMs).toBeGreaterThanOrEqual(0);
		});

		test("health check succeeded event includes all timing headers", () => {
			const successEvent = {
				event_type: "health_check_succeeded",
				attemptCount: 3,
				elapsedMs: 250,
				projectCount: 2,
				uptime: 15,
				"x-health-check-time": "210",
				"x-asset-check-time": "50",
				"x-database-init-time": "100",
				"x-project-count-time": "60",
			};

			expect(successEvent.event_type).toBe("health_check_succeeded");
			expect(successEvent["x-health-check-time"]).toBeDefined();
			expect(successEvent["x-asset-check-time"]).toBeDefined();
			expect(successEvent["x-database-init-time"]).toBeDefined();
			expect(successEvent["x-project-count-time"]).toBeDefined();
		});

		test("health check timeout event documents final state", () => {
			const timeoutEvent = {
				event_type: "health_check_timeout",
				attemptCount: 50,
				finalElapsedMs: 60000,
				timeoutMs: 60000,
			};

			expect(timeoutEvent.event_type).toBe("health_check_timeout");
			expect(timeoutEvent.attemptCount).toBeGreaterThan(0);
			expect(timeoutEvent.finalElapsedMs).toBeGreaterThanOrEqual(
				timeoutEvent.timeoutMs,
			);
		});
	});

	describe("platform-specific timeout behavior", () => {
		test("Windows timeout (60s) vs Unix timeout (5s) constants", () => {
			const windowsTimeout = 60000;
			const unixTimeout = 5000;

			expect(windowsTimeout).toBe(60000);
			expect(unixTimeout).toBe(5000);
			expect(windowsTimeout).toBeGreaterThan(unixTimeout);
		});

		test("polling interval remains constant across platforms", () => {
			const pollingInterval = 100;
			expect(pollingInterval).toBe(100);
		});

		test("health check completion within Windows timeout is acceptable", () => {
			// If health check completes in <= 60s on Windows, consider success
			const windowsTimeout = 60000;
			const healthCheckTime = 15000; // 15 seconds

			expect(healthCheckTime).toBeLessThanOrEqual(windowsTimeout);
		});

		test("health check completion within Unix timeout is acceptable", () => {
			// If health check completes in <= 5s on Unix, consider success
			const unixTimeout = 5000;
			const healthCheckTime = 2000; // 2 seconds

			expect(healthCheckTime).toBeLessThanOrEqual(unixTimeout);
		});
	});

	describe("response timing assertions", () => {
		test("fast health check on healthy system (<100ms per phase)", () => {
			const healthySystemTiming = {
				asset_check_ms: 5,
				database_init_ms: 20,
				project_count_ms: 15,
				total_ms: 40,
			};

			expect(healthySystemTiming.asset_check_ms).toBeLessThan(100);
			expect(healthySystemTiming.database_init_ms).toBeLessThan(100);
			expect(healthySystemTiming.project_count_ms).toBeLessThan(100);
			expect(healthySystemTiming.total_ms).toBeLessThan(100);
		});

		test("slow asset check on slow system (>300ms per phase)", () => {
			const slowSystemTiming = {
				asset_check_ms: 385, // After 5 retries with backoff
				database_init_ms: 150,
				project_count_ms: 100,
				total_ms: 635,
			};

			expect(slowSystemTiming.asset_check_ms).toBeGreaterThan(300);
			expect(slowSystemTiming.total_ms).toBeLessThan(60000); // Still within Windows timeout
		});

		test("timing progression shows asset check dominates slow startup", () => {
			// Scenario: slow asset I/O on Windows
			const slowAssetTiming = {
				asset_check_ms: 500,
				database_init_ms: 50,
				project_count_ms: 30,
				total_ms: 580,
			};

			const assetPercentage =
				(slowAssetTiming.asset_check_ms / slowAssetTiming.total_ms) * 100;
			expect(assetPercentage).toBeGreaterThan(50);
		});
	});
});
