/**
 * Puppeteer browser manager for Mermaid diagram validation.
 * Manages browser lifecycle and provides validation via mermaid.parse().
 */

import * as TE from "fp-ts/lib/TaskEither.js";
import type { Browser, Page } from "puppeteer";
import puppeteer from "puppeteer";
import type { CLIError } from "../../../shared/errors.js";
import { runtimeError } from "../../../shared/errors.js";

/** Mermaid CDN URL for loading in browser */
const MERMAID_CDN = "https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js";

/** HTML template for validation page */
const getValidationPage = (): string => `
<!DOCTYPE html>
<html>
<head>
  <script src="${MERMAID_CDN}"></script>
</head>
<body>
  <div id="container"></div>
  <script>
    mermaid.initialize({ startOnLoad: false });

    window.validateDiagram = async (diagramCode) => {
      try {
        const result = await mermaid.parse(diagramCode);
        return { valid: true, diagramType: result?.diagramType };
      } catch (error) {
        return {
          valid: false,
          error: {
            message: error.message || String(error),
            hash: error.hash || null
          }
        };
      }
    };
  </script>
</body>
</html>
`;

/** Result from browser-based mermaid validation */
export interface BrowserValidationResult {
	readonly valid: boolean;
	readonly diagramType?: string;
	readonly error?: {
		readonly message: string;
		readonly hash?: unknown;
	};
}

/** Browser instance management */
let browserInstance: Browser | null = null;
let pageInstance: Page | null = null;

/**
 * Launch browser and prepare validation page.
 * Reuses existing browser instance if already initialized.
 * Returns TaskEither with the Page instance for validation.
 */
export const initBrowser = (): TE.TaskEither<CLIError, Page> =>
	TE.tryCatch(
		async () => {
			if (pageInstance) {
				return pageInstance;
			}

			browserInstance = await puppeteer.launch({
				headless: true,
				args: ["--no-sandbox", "--disable-setuid-sandbox"],
			});

			pageInstance = await browserInstance.newPage();
			await pageInstance.setContent(getValidationPage());

			// Wait for mermaid to load and validateDiagram function to be available
			await pageInstance.waitForFunction(
				"typeof window.validateDiagram === 'function'",
				{ timeout: 10000 },
			);

			return pageInstance;
		},
		(error) =>
			runtimeError(
				`Failed to initialize browser: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Close browser instance and clean up resources.
 * Safe to call multiple times; no-op if browser is not running.
 */
export const closeBrowser = (): TE.TaskEither<CLIError, void> =>
	TE.tryCatch(
		async () => {
			if (browserInstance) {
				await browserInstance.close();
				browserInstance = null;
				pageInstance = null;
			}
		},
		(error) =>
			runtimeError(
				`Failed to close browser: ${error instanceof Error ? error.message : String(error)}`,
			),
	);

/**
 * Validate a diagram using the browser context.
 * Executes mermaid.parse() in the browser and returns the result.
 */
export const validateInBrowser = (
	page: Page,
	diagramCode: string,
): TE.TaskEither<CLIError, BrowserValidationResult> =>
	TE.tryCatch(
		async () => {
			// Pass diagram code as argument to the browser-side function
			// The function is serialized and runs in browser context where window.validateDiagram exists
			const result = await page.evaluate(async (code) => {
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const win = globalThis as Record<string, unknown>;
				const validateFn = win.validateDiagram as (
					code: string,
				) => Promise<BrowserValidationResult>;
				return validateFn(code);
			}, diagramCode);
			return result;
		},
		(error) =>
			runtimeError(
				`Browser validation failed: ${error instanceof Error ? error.message : String(error)}`,
			),
	);
