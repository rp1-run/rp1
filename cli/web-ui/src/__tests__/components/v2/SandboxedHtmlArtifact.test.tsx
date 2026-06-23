import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render } from "@testing-library/react";

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
