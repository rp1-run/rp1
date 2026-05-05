import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { handleV2RuntimeRequest } from "../../server/routes/v2-api";
import { RUNTIME_CACHE_CONTROL } from "../../server/runtime-contract";
import {
	ARCADE_RUNTIME_MANIFEST_FILENAME,
	type ArcadeRuntimeContract,
	type ArcadeRuntimeManifest,
	DEFAULT_ARCADE_RECONNECT_POLICY,
} from "../../types/runtime";

const manifest: ArcadeRuntimeManifest = {
	version: "0.7.6",
	gitCommit: "abc1234",
	buildTime: "2026-05-04T00:00:00.000Z",
	buildId: "build-abc1234",
};

function runtimeRequest(url: string): Request {
	return new Request(url);
}

async function writeRuntimeManifest(root: string): Promise<void> {
	const clientDir = join(root, "client");
	await mkdir(clientDir, { recursive: true });
	await Bun.write(
		join(clientDir, ARCADE_RUNTIME_MANIFEST_FILENAME),
		`${JSON.stringify(manifest)}\n`,
	);
}

describe("Arcade runtime contract API", () => {
	let tempDir: string;
	let webUIDir: string;

	beforeAll(async () => {
		tempDir = await mkdtemp(join(tmpdir(), "rp1-runtime-contract-"));
		webUIDir = join(tempDir, "web-ui");
		await writeRuntimeManifest(webUIDir);
	});

	afterAll(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	test("returns browser host contract fields from the runtime manifest", async () => {
		const response = await handleV2RuntimeRequest(
			runtimeRequest("http://127.0.0.1:7710/api/v2/runtime"),
			{
				port: 7710,
				startTime: 0,
				webUIDir,
				version: "fallback-version",
			},
		);

		const body = (await response.json()) as ArcadeRuntimeContract;

		expect(response.status).toBe(200);
		expect(response.headers.get("Cache-Control")).toBe(RUNTIME_CACHE_CONTROL);
		expect(body).toEqual({
			schemaVersion: 1,
			baseUrl: "http://127.0.0.1:7710",
			hostMode: "browser",
			version: manifest.version,
			buildId: manifest.buildId,
			cacheBust: manifest.buildId,
			reconnectPolicy: DEFAULT_ARCADE_RECONNECT_POLICY,
		});
	});

	test("returns native host mode and explicit cache bust query metadata", async () => {
		const response = await handleV2RuntimeRequest(
			runtimeRequest(
				"http://127.0.0.1:7710/api/v2/runtime?hostMode=native&cacheBust=native-load-1",
			),
			{
				port: 7710,
				startTime: 0,
				webUIDir,
			},
		);

		const body = (await response.json()) as ArcadeRuntimeContract;

		expect(response.status).toBe(200);
		expect(body.hostMode).toBe("native");
		expect(body.cacheBust).toBe("native-load-1");
		expect(body.buildId).toBe(manifest.buildId);
	});

	test("rejects unsupported host mode inputs", async () => {
		const response = await handleV2RuntimeRequest(
			runtimeRequest("http://127.0.0.1:7710/api/v2/runtime?hostMode=mobile"),
			{
				port: 7710,
				startTime: 0,
				webUIDir,
			},
		);

		const body = (await response.json()) as { error: string };

		expect(response.status).toBe(400);
		expect(response.headers.get("Cache-Control")).toBe(RUNTIME_CACHE_CONTROL);
		expect(body.error).toBe("Unsupported Arcade host mode: mobile");
	});
});
