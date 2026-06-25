/**
 * Offline Mermaid -> static SVG pre-rendering for the teach-me render pipeline
 * (T4).
 *
 * Diagram blocks are pre-rendered to a self-contained `<svg>` at assembly time
 * so the produced lesson artifact ships no runtime diagram library (REQ-007) and
 * makes zero external requests (HYP-002). This extends the `mmd-validate`
 * browser lifecycle (a single reused Puppeteer page) but differs in two
 * load-bearing ways:
 *
 * - The Mermaid engine is injected from the locally installed package
 *   (`mermaid/dist/mermaid.min.js`), never a CDN. The repo also ships
 *   `mermaid-ast`, which cannot render; this module depends on the full engine.
 * - It calls `mermaid.render()` (not `parse()`) to emit static SVG markup, with
 *   `securityLevel: "strict"` so the output is sandbox-safe.
 *
 * `bun build --compile` does not bundle Chromium, so a launchable
 * Puppeteer-pinned Chrome is a runtime prerequisite; a missing browser surfaces
 * as an actionable {@link prerequisiteError} rather than a raw launch crash.
 */

import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError, runtimeError } from "../../../shared/errors.js";

/** Resolve the local Mermaid UMD bundle path (defines `globalThis.mermaid`). */
const mermaidBundlePath = (): string =>
	createRequire(import.meta.url).resolve("mermaid/dist/mermaid.min.js");

/** Minimal HTML shell the Mermaid engine is injected into. */
const RENDER_PAGE = `<!DOCTYPE html><html><head></head><body><div id="tm-mermaid-host"></div></body></html>`;

/** Reused browser/page, mirroring the mmd-validate singleton lifecycle. */
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;
/** Monotonic id so each `mermaid.render()` call uses a unique element id. */
let renderCounter = 0;
/**
 * Memoized in-flight init promise: concurrent first-callers share a single
 * browser launch rather than racing to create two. Cleared on failure and
 * in `closeMermaidBrowser`.
 */
let initPromise: Promise<Page> | null = null;

/**
 * Launch the browser, load the offline Mermaid engine, and return a ready page.
 * The check-then-launch is atomic: concurrent first-callers share a single
 * `initPromise` so only one browser is ever launched. A launch failure
 * (typically a missing Puppeteer-pinned Chrome) is mapped to an actionable
 * prerequisite error; any other failure is a runtime error.
 */
const initPage = (): TE.TaskEither<CLIError, Page> =>
	TE.tryCatch(
		async () => {
			if (pageInstance) return pageInstance;
			if (!initPromise) {
				initPromise = launchAndSetup();
			}
			return initPromise;
		},
		(error) =>
			// Preserve an already-typed CLIError (the prerequisite case above).
			isCLIError(error)
				? error
				: runtimeError(
						`Failed to initialize the Mermaid pre-render browser: ${error instanceof Error ? error.message : String(error)}`,
					),
	);

/** Launch Puppeteer, inject Mermaid, and return the ready page singleton. */
const launchAndSetup = async (): Promise<Page> => {
	let browser: Browser;
	try {
		browser = await puppeteer.launch({
			headless: true,
			args: ["--no-sandbox", "--disable-setuid-sandbox"],
		});
	} catch (error) {
		initPromise = null;
		throw prerequisiteError(
			"puppeteer-chrome",
			`Failed to launch the headless browser used to pre-render Mermaid diagrams: ${error instanceof Error ? error.message : String(error)}`,
			"Install the Puppeteer-pinned browser with `npx puppeteer browsers install chrome`.",
		);
	}

	browserInstance = browser;
	try {
		const page = await browser.newPage();
		await page.setContent(RENDER_PAGE);

		const mermaidSource = await readFile(mermaidBundlePath(), "utf8");
		await page.addScriptTag({ content: mermaidSource });
		await page.waitForFunction("typeof window.mermaid !== 'undefined'", {
			timeout: 10000,
		});
		await page.evaluate(() => {
			const win = globalThis as unknown as {
				mermaid: { initialize: (config: unknown) => void };
			};
			win.mermaid.initialize({
				startOnLoad: false,
				securityLevel: "strict",
				deterministicIds: true,
			});
		});

		pageInstance = page;
		return page;
	} catch (initError) {
		await browser.close().catch(() => {});
		browserInstance = null;
		pageInstance = null;
		initPromise = null;
		throw initError;
	}
};

const isCLIError = (value: unknown): value is CLIError =>
	typeof value === "object" && value !== null && "_tag" in value;

/** @internal Expose browser singleton state for tests. */
export const _testInternals = {
	getBrowserInstance: (): Browser | null => browserInstance,
	getPageInstance: (): Page | null => pageInstance,
};

/**
 * Render Mermaid `source` to a static, self-contained `<svg>` string.
 *
 * The engine runs offline inside the shared Puppeteer page; the returned markup
 * references no runtime library and makes no external request. Invalid Mermaid
 * source yields `Left(RuntimeError)` carrying Mermaid's own parse message.
 *
 * Callers must render serially (e.g. via `TE.chain` sequences) and call
 * `closeMermaidBrowser` only after a batch completes. The shared page's init
 * is atomic — concurrent first-callers share one browser launch — but the
 * render itself is not serialized internally.
 *
 * @param source - Mermaid diagram source (e.g. a `flowchart`).
 */
export const renderMermaid = (
	source: string,
): TE.TaskEither<CLIError, string> =>
	TE.chain((page: Page) => renderOnPage(page, source))(initPage());

const renderOnPage = (
	page: Page,
	source: string,
): TE.TaskEither<CLIError, string> =>
	TE.tryCatch(
		async () => {
			renderCounter += 1;
			const id = `tm-mermaid-${renderCounter}`;
			return page.evaluate(
				async (renderId, diagram) => {
					const win = globalThis as unknown as {
						mermaid: {
							render: (id: string, text: string) => Promise<{ svg: string }>;
						};
					};
					const { svg } = await win.mermaid.render(renderId, diagram);
					return svg;
				},
				id,
				source,
			);
		},
		(error) =>
			runtimeError(
				`Failed to render Mermaid diagram: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Close the shared Mermaid pre-render browser and release its resources. Safe to
 * call when no browser is running; callers (e.g. `render`) invoke this once
 * after a batch of diagrams.
 */
export const closeMermaidBrowser = (): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			if (browserInstance) {
				await browserInstance.close();
				browserInstance = null;
				pageInstance = null;
			}
			initPromise = null;
		},
		(error) =>
			runtimeError(
				`Failed to close the Mermaid pre-render browser: ${error instanceof Error ? error.message : String(error)}`,
			),
	);
