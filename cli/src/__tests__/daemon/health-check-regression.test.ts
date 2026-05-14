import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	mock,
	test,
} from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ApiContext } from "../../../web-ui/src/server/routes/content-utils.js";

type V2ApiModule = typeof import("../../../web-ui/src/server/routes/v2-api.js");

const events: Array<{ event: string; data: Record<string, unknown> }> = [];

const loadV2Api = async (): Promise<V2ApiModule> =>
	(await import(
		`../../../web-ui/src/server/routes/v2-api.ts?health-regression=${Date.now()}-${Math.random()}`
	)) as V2ApiModule;

const apiContext = (webUIDir: string): ApiContext => ({
	port: 7710,
	startTime: Date.now(),
	isDev: false,
	webUIDir,
});

describe("health-check regression behavior", () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-health-regression-"));
		const diagnosticsMock = {
			logDaemonEvent: (event: string, data: Record<string, unknown> = {}) => {
				events.push({ event, data });
			},
		};
		mock.module(
			"../../../web-ui/src/daemon/diagnostics",
			() => diagnosticsMock,
		);
		mock.module(
			"../../../web-ui/src/daemon/diagnostics.js",
			() => diagnosticsMock,
		);
	});

	beforeEach(() => {
		events.length = 0;
	});

	afterAll(async () => {
		mock.restore();
		await rm(tempDir, { recursive: true, force: true });
	});

	test("asset-not-ready health response includes bounded retry timing and completion diagnostics", async () => {
		const { handleV2HealthRequest } = await loadV2Api();
		const webUIDir = join(tempDir, `missing-${Date.now()}`);

		const response = await handleV2HealthRequest(apiContext(webUIDir));
		const body = (await response.json()) as {
			status: string;
			reason: string;
			timing: { asset_check_ms: number; total_ms: number };
		};

		expect(response.status).toBe(503);
		expect(body.status).toBe("starting");
		expect(body.reason).toBe("assets not ready");
		expect(body.timing.asset_check_ms).toBeGreaterThanOrEqual(380);
		expect(
			Number(response.headers.get("X-Asset-Check-Time")),
		).toBeGreaterThanOrEqual(380);
		expect(Number(response.headers.get("X-Database-Init-Time"))).toBe(0);
		expect(events).toContainEqual(
			expect.objectContaining({
				event: "health_check_complete",
				data: expect.objectContaining({
					status: "starting",
					reason: "assets not ready",
				}),
			}),
		);
	});
});
