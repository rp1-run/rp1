import { describe, expect, test } from "bun:test";
import { checkHealthWithHeaders } from "../../../web-ui/src/daemon/ipc.js";
import { getHealthCheckTimeoutMs } from "../../../web-ui/src/daemon/manager.js";

describe("health-check windows behavior", () => {
	test("uses Windows default timeout and honors valid overrides", () => {
		expect(getHealthCheckTimeoutMs("win32")).toBe(60_000);
		expect(getHealthCheckTimeoutMs("darwin")).toBe(5_000);
		expect(getHealthCheckTimeoutMs("linux", "30000")).toBe(30_000);
		expect(getHealthCheckTimeoutMs("win32", "invalid")).toBe(60_000);
		expect(getHealthCheckTimeoutMs("win32", "-5000")).toBe(60_000);
	});

	test("preserves health timing headers from startup responses", async () => {
		const server = Bun.serve({
			port: 0,
			fetch() {
				return new Response(
					JSON.stringify({
						status: "starting",
						reason: "assets not ready",
						timing: {
							asset_check_ms: 385,
							database_init_ms: 0,
							project_count_ms: 0,
							total_ms: 385,
						},
					}),
					{
						status: 503,
						headers: {
							"Content-Type": "application/json",
							"X-Health-Check-Time": "385",
							"X-Asset-Check-Time": "385",
							"X-Database-Init-Time": "0",
							"X-Project-Count-Time": "0",
						},
					},
				);
			},
		});

		try {
			const port = server.port;
			if (port === undefined) {
				throw new Error("Expected Bun.serve to assign a port");
			}

			const result = await checkHealthWithHeaders({
				port,
				baseUrl: `http://127.0.0.1:${port}`,
			});

			expect(result.health).toBeNull();
			expect(result.headers?.["x-health-check-time"]).toBe("385");
			expect(result.headers?.["x-asset-check-time"]).toBe("385");
			expect(result.headers?.["x-database-init-time"]).toBe("0");
			expect(result.headers?.["x-project-count-time"]).toBe("0");
		} finally {
			server.stop(true);
		}
	});
});
