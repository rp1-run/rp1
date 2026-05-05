#!/usr/bin/env bun

import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import puppeteer, { type Browser } from "puppeteer";
import { startServer } from "../web-ui/src/server/http";
import { WebSocketHub } from "../web-ui/src/server/websocket";
import {
	ARCADE_RUNTIME_MANIFEST_FILENAME,
	type ArcadeRuntimeManifest,
	DEFAULT_ARCADE_RECONNECT_POLICY,
} from "../web-ui/src/types/runtime";

const SMOKE_POLICY = {
	...DEFAULT_ARCADE_RECONNECT_POLICY,
	heartbeatIntervalMs: 100,
	heartbeatMissThreshold: 5,
};

interface SmokeState {
	readonly done: boolean;
	readonly error: string | null;
	readonly result: SmokeResult | null;
}

interface SmokeResult {
	readonly runtime: {
		readonly hostMode?: string;
		readonly buildId?: string;
		readonly reconnectPolicy?: {
			readonly activityRecoveryLimit?: number;
		};
	};
	readonly missingStatus: number;
	readonly missingHeader: string | null;
	readonly replay: {
		readonly type?: string;
		readonly scope?: string;
		readonly event?: {
			readonly id?: number;
			readonly projectId?: string;
			readonly featureId?: string;
		};
	};
	readonly live: {
		readonly type?: string;
		readonly eventId?: number;
		readonly projectId?: string;
	};
	readonly rootText: string | null;
}

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) {
		throw new Error(message);
	}
}

async function findAvailablePort(): Promise<number> {
	for (let attempt = 0; attempt < 20; attempt += 1) {
		const port = 24000 + Math.floor(Math.random() * 20000);
		try {
			const probe = Bun.serve({
				port,
				hostname: "127.0.0.1",
				fetch() {
					return new Response("ok");
				},
			});
			probe.stop();
			return port;
		} catch {}
	}

	throw new Error("Could not find an available port for smoke coverage");
}

async function writeSmokeAssets(webUIDir: string): Promise<void> {
	const clientDir = join(webUIDir, "client");
	await mkdir(join(clientDir, "assets"), { recursive: true });
	await Bun.write(join(clientDir, "index.html"), smokeHarnessHtml());

	const manifest: ArcadeRuntimeManifest = {
		version: "0.7.6-smoke",
		gitCommit: "smoke",
		buildTime: "2026-05-04T00:00:00.000Z",
		buildId: "smoke-build",
	};
	await Bun.write(
		join(clientDir, ARCADE_RUNTIME_MANIFEST_FILENAME),
		`${JSON.stringify(manifest)}\n`,
	);
}

function smokeHarnessHtml(): string {
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>rp1 Arcade smoke</title>
</head>
<body>
  <div id="root">Arcade runtime smoke ready</div>
  <script>
    (() => {
      const state = { done: false, error: null, result: null };
      window.__rp1Smoke = state;
      window.__rp1SmokeLiveReady = false;

      const fail = (error) => {
        state.done = true;
        state.error = error instanceof Error ? error.message : String(error);
      };

      const socketUrl = (lastEventId) => {
        const url = new URL("/ws", location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.searchParams.set("scope", "global");
        url.searchParams.set("lastEventId", String(lastEventId));
        return url.toString();
      };

      const ackHeartbeat = (socket, message) => {
        if (message.type !== "heartbeat" || !message.heartbeatId) return;
        socket.send(JSON.stringify({
          type: "heartbeat:ack",
          heartbeatId: message.heartbeatId,
          receivedAt: new Date().toISOString()
        }));
      };

      const waitForReplay = () => new Promise((resolve, reject) => {
        const socket = new WebSocket(socketUrl(5));
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("Timed out waiting for global replay"));
        }, 4000);

        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          ackHeartbeat(socket, message);
          if (message.type === "event:replay") {
            clearTimeout(timeout);
            socket.close();
            resolve(message);
          }
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Global replay socket failed"));
        };
      });

      const waitForLiveEvent = (lastEventId) => new Promise((resolve, reject) => {
        const socket = new WebSocket(socketUrl(lastEventId));
        const timeout = setTimeout(() => {
          socket.close();
          reject(new Error("Timed out waiting for live reconnect event"));
        }, 4000);

        socket.onopen = () => {
          window.__rp1SmokeLiveReady = true;
        };
        socket.onmessage = (event) => {
          const message = JSON.parse(event.data);
          ackHeartbeat(socket, message);
          if (message.type === "event:notification") {
            clearTimeout(timeout);
            socket.close();
            resolve(message);
          }
        };
        socket.onerror = () => {
          clearTimeout(timeout);
          reject(new Error("Live reconnect socket failed"));
        };
      });

      const run = async () => {
        try {
          const runtime = await fetch("/api/v2/runtime?hostMode=browser", {
            cache: "no-store"
          }).then((response) => response.json());
          const missing = await fetch("/assets/missing-entry.js", {
            headers: { Accept: "*/*" }
          });
          const replay = await waitForReplay();
          const live = await waitForLiveEvent(replay.event.id);

          state.result = {
            runtime,
            missingStatus: missing.status,
            missingHeader: missing.headers.get("X-RP1-Asset-Missing"),
            replay,
            live,
            rootText: document.getElementById("root")?.textContent ?? null
          };
          state.done = true;
        } catch (error) {
          fail(error);
        }
      };

      run();
    })();
  </script>
</body>
</html>`;
}

async function launchBrowser(): Promise<Browser> {
	return puppeteer.launch({
		headless: true,
		args: ["--no-sandbox", "--disable-setuid-sandbox"],
	});
}

async function main(): Promise<void> {
	const tempDir = await mkdtemp(join(tmpdir(), "rp1-runtime-smoke-"));
	const projectDir = join(tempDir, "project");
	const webUIDir = join(tempDir, "web-ui");
	const port = await findAvailablePort();
	const websocketHub = new WebSocketHub(SMOKE_POLICY);
	let browser: Browser | null = null;

	websocketHub.setReplayProvider({
		getEventsSince: (afterId) =>
			afterId < 6
				? [
						{
							id: 6,
							runId: "run-smoke",
							type: "status_change",
							step: "task-builder:building",
							unit: "T8",
							data: JSON.stringify({ status: "running" }),
							createdAt: "2026-05-04T00:00:00.000Z",
						},
					]
				: [],
		getRunContext: (runId) =>
			runId === "run-smoke"
				? {
						projectId: "proj-smoke",
						featureId: "fix-all-ui",
						runStatus: "running",
					}
				: null,
		getRunStatus: () => "running",
		getActiveRunsSnapshot: () => [],
		getMaxEventId: () => 6,
	});

	await mkdir(join(projectDir, ".rp1"), { recursive: true });
	await writeSmokeAssets(webUIDir);

	const server = startServer({
		port,
		projectPath: projectDir,
		websocketHub,
		isDev: false,
		webUIDir,
		version: "0.7.6-smoke",
	});

	try {
		browser = await launchBrowser();
		const page = await browser.newPage();
		await page.goto(`http://127.0.0.1:${port}`, {
			waitUntil: "domcontentloaded",
		});

		await page.waitForFunction(
			"window.__rp1SmokeLiveReady === true || window.__rp1Smoke?.done === true",
			{ timeout: 5000 },
		);

		const readyState = (await page.evaluate("window.__rp1Smoke")) as SmokeState;
		assert(
			readyState.done !== true || readyState.error === null,
			`Chromium smoke failed before live event broadcast: ${readyState.error}`,
		);

		websocketHub.broadcastEvent(
			"proj-smoke",
			7,
			"status_change",
			"run-smoke",
			"fix-all-ui",
			"completed",
			"task-builder:completed",
			"T8",
			{ status: "completed" },
			"2026-05-04T00:00:01.000Z",
		);

		await page.waitForFunction("window.__rp1Smoke?.done === true", {
			timeout: 5000,
		});

		const smokeState = (await page.evaluate("window.__rp1Smoke")) as SmokeState;
		assert(!smokeState.error, `Chromium smoke failed: ${smokeState.error}`);
		assert(smokeState.result, "Chromium smoke finished without a result");

		const { result } = smokeState;
		assert(
			result.rootText === "Arcade runtime smoke ready",
			"HTML shell failed",
		);
		assert(
			result.runtime.hostMode === "browser",
			"Runtime contract did not resolve browser host mode",
		);
		assert(
			result.runtime.buildId === "smoke-build",
			"Runtime contract did not load the smoke build manifest",
		);
		assert(
			typeof result.runtime.reconnectPolicy?.activityRecoveryLimit === "number",
			"Runtime contract did not expose reconnect policy",
		);
		assert(
			result.missingStatus === 404 && result.missingHeader === "true",
			"Missing JavaScript asset was not reported as a structured asset miss",
		);
		assert(
			result.replay.type === "event:replay" &&
				result.replay.scope === "global" &&
				result.replay.event?.id === 6 &&
				result.replay.event.projectId === "proj-smoke" &&
				result.replay.event.featureId === "fix-all-ui",
			"Global reconnect did not replay the missed project event",
		);
		assert(
			result.live.type === "event:notification" &&
				result.live.eventId === 7 &&
				result.live.projectId === "proj-smoke",
			"Live event delivery did not continue after reconnect replay",
		);

		console.log(
			`Chromium ${await browser.version()} smoke passed: runtime loading, structured asset miss, global replay, and live reconnect delivery verified.`,
		);
	} finally {
		await browser?.close();
		server.stop();
		websocketHub.stop();
		await rm(tempDir, { recursive: true, force: true });
	}
}

main().catch((error) => {
	console.error(error instanceof Error ? error.message : String(error));
	process.exit(1);
});
