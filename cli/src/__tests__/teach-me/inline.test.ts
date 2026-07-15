/**
 * Tests for the teach-me theme-sync script injected by `inlineDocument`.
 *
 * Validates:
 * 1. The theme-sync `<script>` is present in the inlined HTML output,
 *    separate from the widget bundle script.
 * 2. When a valid `MessageEvent` with `{type:'rp1-teach-me-theme', theme}`
 *    is dispatched, the script sets `document.documentElement.dataset.theme`.
 * 3. Malformed, missing, or unrelated messages are silently ignored.
 */

import { afterEach, describe, expect, it } from "bun:test";
import type { AssembledLesson } from "../../teach-me/assemble.js";
import type { WidgetBundle } from "../../teach-me/assets.js";
import { inlineDocument, THEME_SYNC_SCRIPT } from "../../teach-me/inline.js";

const STUB_BUNDLE: WidgetBundle = {
	js: "/*__WIDGETS__*/",
	css: "/*__BASE__*/",
};

const minimalLesson: AssembledLesson = {
	title: "Theme Sync Test",
	themeAttr: "light",
	bodyHtml: "<p>Hello</p>",
	hasMath: false,
};

describe("theme-sync script injection", () => {
	it("injects the theme-sync script as a separate tag after the widget bundle", () => {
		const html = inlineDocument(minimalLesson, STUB_BUNDLE);

		const widgetScriptIdx = html.indexOf(`<script>${STUB_BUNDLE.js}</script>`);
		const themeSyncIdx = html.indexOf(`<script>${THEME_SYNC_SCRIPT}</script>`);

		expect(widgetScriptIdx).toBeGreaterThan(-1);
		expect(themeSyncIdx).toBeGreaterThan(-1);
		expect(themeSyncIdx).toBeGreaterThan(widgetScriptIdx);
	});

	it("injects the theme-sync script exactly once", () => {
		const html = inlineDocument(minimalLesson, STUB_BUNDLE);
		const count =
			html.split(`<script>${THEME_SYNC_SCRIPT}</script>`).length - 1;
		expect(count).toBe(1);
	});
});

/**
 * Behavioral tests for the theme-sync listener script. Since CLI tests run
 * without a DOM, we set up a minimal mock environment (window, document) that
 * the script binds to, execute the script via `new Function`, and inspect
 * the resulting `dataset.theme` after dispatching simulated messages.
 */
describe("theme-sync listener behavior", () => {
	type MessageHandler = (event: { data: unknown }) => void;

	let listeners: MessageHandler[];
	let dataset: Record<string, string>;
	let origWindow: typeof globalThis.window;
	let origDocument: typeof globalThis.document;

	afterEach(() => {
		// Restore originals (they may be undefined in Node-like envs)
		if (origWindow !== undefined) {
			globalThis.window = origWindow;
		} else {
			delete (globalThis as Record<string, unknown>).window;
		}
		if (origDocument !== undefined) {
			globalThis.document = origDocument;
		} else {
			delete (globalThis as Record<string, unknown>).document;
		}
	});

	function setup(): void {
		listeners = [];
		dataset = {};
		origWindow = globalThis.window;
		origDocument = globalThis.document;

		(globalThis as Record<string, unknown>).window = {
			addEventListener: (type: string, handler: MessageHandler) => {
				if (type === "message") listeners.push(handler);
			},
		};
		(globalThis as Record<string, unknown>).document = {
			documentElement: { dataset },
		};

		// Execute the script — it registers the message listener
		new Function(THEME_SYNC_SCRIPT)();
	}

	function dispatch(data: unknown): string | undefined {
		for (const handler of listeners) {
			handler({ data });
		}
		return dataset.theme;
	}

	it("sets data-theme to 'dark' on valid dark message", () => {
		setup();
		const result = dispatch({
			type: "rp1-teach-me-theme",
			theme: "dark",
		});
		expect(result).toBe("dark");
	});

	it("sets data-theme to 'light' on valid light message", () => {
		setup();
		const result = dispatch({
			type: "rp1-teach-me-theme",
			theme: "light",
		});
		expect(result).toBe("light");
	});

	it("ignores a message with wrong type string", () => {
		setup();
		const result = dispatch({
			type: "some-other-type",
			theme: "dark",
		});
		expect(result).toBeUndefined();
	});

	it("ignores a message with invalid theme value", () => {
		setup();
		const result = dispatch({
			type: "rp1-teach-me-theme",
			theme: "blue",
		});
		expect(result).toBeUndefined();
	});

	it("ignores a non-object message (string)", () => {
		setup();
		const result = dispatch("rp1-teach-me-theme");
		expect(result).toBeUndefined();
	});

	it("ignores a null message", () => {
		setup();
		const result = dispatch(null);
		expect(result).toBeUndefined();
	});

	it("ignores a message missing the type field", () => {
		setup();
		const result = dispatch({ theme: "dark" });
		expect(result).toBeUndefined();
	});

	it("ignores a message missing the theme field", () => {
		setup();
		const result = dispatch({ type: "rp1-teach-me-theme" });
		expect(result).toBeUndefined();
	});
});
