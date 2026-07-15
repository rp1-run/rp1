/**
 * Tests for the teach-me browser gate (T6 / browser-checks.ts).
 *
 * Validates the dynamic Puppeteer gate: page.goto timeout surfaces as a
 * distinct, actionable RuntimeError (not a generic crash), and the page is
 * closed in a finally block so slow loads do not leak.
 *
 * Browser-gated: skipped when the Puppeteer-pinned Chrome is not installed.
 */

import { afterAll, describe, expect, it } from "bun:test";
import * as E from "fp-ts/lib/Either.js";
import { runBrowserGate } from "../../teach-me/gate/browser-checks.js";

const canLaunchBrowser = await (async (): Promise<boolean> => {
	try {
		const { default: puppeteer } = await import("puppeteer");
		const browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
		await browser.close();
		return true;
	} catch {
		return false;
	}
})();

const describeBrowser = canLaunchBrowser ? describe : describe.skip;

describeBrowser("runBrowserGate", () => {
	let hangServer: ReturnType<typeof Bun.serve> | undefined;

	afterAll(() => {
		hangServer?.stop(true);
	});

	it("surfaces a goto timeout as a distinct actionable RuntimeError", async () => {
		hangServer = Bun.serve({
			port: 0,
			idleTimeout: 30,
			fetch: () => new Promise<Response>(() => {}),
		});
		const url = `http://localhost:${hangServer.port}/`;

		const result = await runBrowserGate(url, {
			expectInteractive: false,
			expectDiagram: false,
			expectMath: false,
		})();

		expect(E.isLeft(result)).toBe(true);
		if (!E.isLeft(result)) return;

		const error = result.left;
		expect(error._tag).toBe("RuntimeError");
		if (error._tag !== "RuntimeError") return;
		expect(error.message).toContain("did not finish loading within");
		expect(error.message).toContain(url);
	}, 30_000);
});
