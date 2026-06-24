import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

const PROBE = "__sandboxProbe";

let importVersion = 0;

async function loadComponent() {
	return await import(
		`../../../components/v2/SandboxedHtmlArtifact.tsx?sandboxed-html-artifact-test=${++importVersion}`
	);
}

describe("SandboxedHtmlArtifact", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	afterEach(() => {
		cleanup();
	});

	test("sandboxes the iframe with allow-scripts only and feeds content via srcDoc", async () => {
		const { SandboxedHtmlArtifact } = await loadComponent();
		const content =
			"<!doctype html><html><body><button>Run</button></body></html>";

		const { container } = render(
			<SandboxedHtmlArtifact content={content} title="lesson.html" />,
		);

		const iframe = container.querySelector("iframe");
		expect(iframe).not.toBeNull();
		expect(iframe?.getAttribute("sandbox")).toBe("allow-scripts");
		expect(iframe?.getAttribute("srcdoc")).toBe(content);
		expect(iframe?.getAttribute("title")).toBe("lesson.html");
	});

	test("remounts the iframe when content changes so srcDoc is reloaded", async () => {
		// A browser does not reliably reload an <iframe> when its srcDoc is mutated
		// on an existing element. The component keys the iframe by content so a
		// changed document forces a fresh element — preventing the tab-switch
		// "stale content" leak where the iframe keeps its previous document.
		const { SandboxedHtmlArtifact } = await loadComponent();
		const first = "<!doctype html><html><body>FIRST</body></html>";
		const second = "<!doctype html><html><body>SECOND</body></html>";

		const view = render(
			<SandboxedHtmlArtifact content={first} title="lesson.html" />,
		);
		const firstIframe = view.container.querySelector(
			"iframe",
		) as HTMLElement & {
			[PROBE]?: boolean;
		};
		firstIframe[PROBE] = true;

		view.rerender(
			<SandboxedHtmlArtifact content={second} title="lesson.html" />,
		);
		const secondIframe = view.container.querySelector(
			"iframe",
		) as HTMLElement & { [PROBE]?: boolean };

		// New DOM node (remounted), and the new document is the new content.
		expect(secondIframe[PROBE]).toBeUndefined();
		expect(secondIframe.getAttribute("srcdoc")).toBe(second);
	});

	test("reuses the iframe element when content is unchanged (no churn)", async () => {
		// Stable content must keep the same element so unrelated parent re-renders
		// do not needlessly reload (and re-parse) the sandboxed document.
		const { SandboxedHtmlArtifact } = await loadComponent();
		const content = "<!doctype html><html><body>STABLE</body></html>";

		const view = render(
			<SandboxedHtmlArtifact content={content} title="lesson.html" />,
		);
		const iframe = view.container.querySelector("iframe") as HTMLElement & {
			[PROBE]?: boolean;
		};
		iframe[PROBE] = true;

		view.rerender(
			<SandboxedHtmlArtifact content={content} title="lesson-renamed.html" />,
		);
		const sameIframe = view.container.querySelector("iframe") as HTMLElement & {
			[PROBE]?: boolean;
		};

		expect(sameIframe[PROBE]).toBe(true);
	});

	test("never grants same-origin or top-navigation escape tokens", async () => {
		const { SandboxedHtmlArtifact } = await loadComponent();

		const { container } = render(
			<SandboxedHtmlArtifact content="<p>hi</p>" title="lesson.html" />,
		);

		const sandbox = container.querySelector("iframe")?.getAttribute("sandbox");
		expect(sandbox).not.toContain("allow-same-origin");
		expect(sandbox).not.toContain("allow-top-navigation");
	});
});
