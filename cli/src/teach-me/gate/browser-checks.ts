/**
 * Dynamic, browser-backed gate for a rendered `lesson.html` (T6).
 *
 * Loads the artifact over `file://` in a headless Puppeteer page (the same
 * lifecycle pattern as the Mermaid pre-renderer and `mmd-validate`) and asserts
 * the runtime guarantees the static gate cannot see (REQ-008, REQ-005):
 *
 * - Zero external network: every request the page issues must be a local scheme
 *   (`file:`/`data:`/`blob:`/`about:`); any `http(s)` request fails the gate.
 * - No console errors / uncaught page errors during load and widget hydration.
 * - Interactive controls are real, labelled `<button>`s (when the lesson has
 *   interactive widgets), so every control is operable and named.
 * - Diagrams expose their text equivalent as an accessible name (`<tm-diagram>`
 *   promotes its `data-alt` to `aria-label` on hydration), when present.
 *
 * Running the gate at all requires a launchable Puppeteer-pinned Chrome.
 * `bun build --compile` does not bundle Chromium, so a missing browser is a
 * runtime prerequisite (HYP-001): it surfaces as the same actionable
 * {@link prerequisiteError} the pre-renderer uses, not a raw launch crash, and
 * is distinct from a gate *failure* (which returns a `Right(GateResult)`).
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import type { Browser, ConsoleMessage, HTTPRequest, Page } from "puppeteer";
import puppeteer from "puppeteer";
import type { CLIError } from "../../../shared/errors.js";
import { prerequisiteError, runtimeError } from "../../../shared/errors.js";
import { type GateResult, gateResult } from "./types.js";

/** What the artifact should contain at runtime, derived from the rendered HTML. */
export interface BrowserGateExpectations {
	/** The lesson has interactive widgets, so real labelled buttons must hydrate. */
	readonly expectInteractive: boolean;
	/** The lesson has diagrams, so an accessible diagram name must be present. */
	readonly expectDiagram: boolean;
}

/** Local URL schemes a self-contained artifact may legitimately request. */
const LOCAL_SCHEMES = ["file:", "data:", "blob:", "about:"];

const isLocalRequest = (url: string): boolean =>
	LOCAL_SCHEMES.some((scheme) => url.startsWith(scheme));

const isCLIError = (value: unknown): value is CLIError =>
	typeof value === "object" && value !== null && "_tag" in value;

/** The accessibility/structure observations collected from the loaded page. */
interface PageProbe {
	readonly buttonCount: number;
	readonly unlabelledButtons: number;
	readonly diagramCount: number;
	readonly diagramsMissingLabel: number;
}

/** Read button/diagram accessibility state from the live, hydrated DOM. */
const probePage = (page: Page): Promise<PageProbe> =>
	page.evaluate(() => {
		const buttons = Array.from(document.querySelectorAll("button"));
		const labelled = (el: Element): boolean => {
			const text = (el.textContent ?? "").trim();
			const aria = (el.getAttribute("aria-label") ?? "").trim();
			return text.length > 0 || aria.length > 0;
		};
		const diagrams = Array.from(document.querySelectorAll("tm-diagram"));
		const diagramLabelled = (el: Element): boolean => {
			const aria = (el.getAttribute("aria-label") ?? "").trim();
			const alt = (el.getAttribute("data-alt") ?? "").trim();
			return aria.length > 0 || alt.length > 0;
		};
		return {
			buttonCount: buttons.length,
			unlabelledButtons: buttons.filter((b) => !labelled(b)).length,
			diagramCount: diagrams.length,
			diagramsMissingLabel: diagrams.filter((d) => !diagramLabelled(d)).length,
		};
	});

/**
 * Launch a headless browser, mapping a launch failure to the actionable
 * Puppeteer-Chrome prerequisite error rather than a raw crash (HYP-001). Mirrors
 * the pre-renderer's launch args.
 */
const launchBrowser = (): TE.TaskEither<CLIError, Browser> =>
	TE.tryCatch(
		() =>
			puppeteer.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
			}),
		(error) =>
			prerequisiteError(
				"puppeteer-chrome",
				`Failed to launch the headless browser used to validate the lesson: ${error instanceof Error ? error.message : String(error)}`,
				"Install the Puppeteer-pinned browser with `npx puppeteer browsers install chrome`.",
			),
	);

/**
 * Load `fileUrl`, observe its network/console behavior and DOM, and report the
 * dynamic checks. Wraps the post-launch work so any failure becomes a
 * `runtimeError` (an already-typed prerequisite error from launch is preserved).
 */
const runChecks = (
	browser: Browser,
	fileUrl: string,
	expectations: BrowserGateExpectations,
): TE.TaskEither<CLIError, GateResult> =>
	TE.tryCatch(
		async () => {
			const page = await browser.newPage();
			const externalRequests: string[] = [];
			const consoleErrors: string[] = [];

			page.on("request", (request: HTTPRequest) => {
				const url = request.url();
				if (!isLocalRequest(url)) {
					externalRequests.push(url);
				}
			});
			page.on("requestfailed", (request: HTTPRequest) => {
				const url = request.url();
				if (!isLocalRequest(url)) {
					externalRequests.push(url);
				}
			});
			page.on("console", (message: ConsoleMessage) => {
				if (message.type() === "error") {
					consoleErrors.push(message.text());
				}
			});
			page.on("pageerror", (error: unknown) => {
				consoleErrors.push(
					error instanceof Error ? error.message : String(error),
				);
			});

			await page.goto(fileUrl, { waitUntil: "networkidle0" });
			const probe = await probePage(page);

			return assembleDynamicChecks(
				externalRequests,
				consoleErrors,
				probe,
				expectations,
			);
		},
		(error) =>
			isCLIError(error)
				? error
				: runtimeError(
						`Failed to run the browser validation gate: ${error instanceof Error ? error.message : String(error)}`,
					),
	);

/** Assemble the dynamic checks from the observed network/console/DOM state. */
function assembleDynamicChecks(
	externalRequests: readonly string[],
	consoleErrors: readonly string[],
	probe: PageProbe,
	expectations: BrowserGateExpectations,
): GateResult {
	const checks = [
		{
			name: "zero-external-network",
			passed: externalRequests.length === 0,
			detail:
				externalRequests.length === 0
					? undefined
					: `Page requested external resource(s): ${externalRequests.join(", ")}.`,
		},
		{
			name: "no-console-errors",
			passed: consoleErrors.length === 0,
			detail:
				consoleErrors.length === 0
					? undefined
					: `Console/page errors during load: ${consoleErrors.join(" | ")}.`,
		},
	];

	if (expectations.expectInteractive) {
		checks.push({
			name: "interactive-controls-present",
			passed: probe.buttonCount > 0 && probe.unlabelledButtons === 0,
			detail:
				probe.buttonCount === 0
					? "Expected interactive widgets but found no <button> controls after hydration."
					: probe.unlabelledButtons > 0
						? `${probe.unlabelledButtons} button control(s) have no accessible label.`
						: undefined,
		});
	}

	if (expectations.expectDiagram) {
		checks.push({
			name: "diagram-text-equivalents-present",
			passed: probe.diagramCount > 0 && probe.diagramsMissingLabel === 0,
			detail:
				probe.diagramCount === 0
					? "Expected diagrams but found no <tm-diagram> elements."
					: probe.diagramsMissingLabel > 0
						? `${probe.diagramsMissingLabel} diagram(s) lack a text equivalent (aria-label/data-alt).`
						: undefined,
		});
	}

	return gateResult(checks);
}

/**
 * Run the dynamic gate against a rendered lesson served from `fileUrl` (a
 * `file://` URL). Closes the browser regardless of outcome.
 *
 * Returns `Left(prerequisiteError)` when Chrome cannot launch (HYP-001) and
 * `Right(GateResult)` once the gate runs — even when checks fail — so the
 * command can name failing checks and exit non-zero.
 */
export const runBrowserGate = (
	fileUrl: string,
	expectations: BrowserGateExpectations,
): TE.TaskEither<CLIError, GateResult> =>
	TE.bracket(
		launchBrowser(),
		(browser) => runChecks(browser, fileUrl, expectations),
		(browser) =>
			TE.tryCatch(
				() => browser.close(),
				(error) =>
					runtimeError(
						`Failed to close the validation browser: ${error instanceof Error ? error.message : String(error)}`,
					),
			),
	);
