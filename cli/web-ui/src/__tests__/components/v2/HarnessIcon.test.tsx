import { beforeAll, describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { createElement } from "react";

// Sibling suites (e.g. V2Layout) register `mock.module("@/components/v2/HarnessIcon")`
// at runtime, and bun never un-registers module mocks across files — so when one
// of them runs before this file, the static import resolves to their stub and every
// assertion below fails. Load an unmocked copy via a query suffix: a distinct module
// key that no `mock.module` targets, keeping these tests order-independent.
let HarnessIcon: typeof import("../../../components/v2/HarnessIcon").HarnessIcon;

// Passed as a variable (not an inline string literal) so TypeScript skips
// compile-time module resolution on the `?real-icons` query — which has no type
// declaration — and resolves it at runtime only. The real type comes from the
// query-free `typeof import(...)` annotation above.
const realIconModule = "../../../components/v2/HarnessIcon.tsx?real-icons";

beforeAll(async () => {
	({ HarnessIcon } = await import(realIconModule));
});

describe("HarnessIcon", () => {
	test("renders the Antigravity mono icon for Antigravity harnesses", () => {
		const { container } = render(
			createElement(HarnessIcon, { harness: "antigravity", size: 20 }),
		);

		const wrapper = container.querySelector('span[title="Antigravity"]');
		expect(wrapper).toBeTruthy();
		const icon = container.querySelector("svg");
		expect(icon).toBeTruthy();
		expect(icon?.getAttribute("fill")).toBe("currentColor");
		expect(icon?.querySelector("title")?.textContent).toBe("Antigravity");
	});

	test("renders the GithubCopilot mono icon for copilot harnesses", () => {
		const { container } = render(
			createElement(HarnessIcon, { harness: "copilot", size: 16 }),
		);

		const wrapper = container.querySelector('span[title="copilot"]');
		expect(wrapper).toBeTruthy();
		expect(container.querySelector("svg title")?.textContent).toBe(
			"GithubCopilot",
		);
	});

	test("renders the LobeHub Gemini mono icon for Gemini CLI harnesses", () => {
		const { container } = render(
			createElement(HarnessIcon, { harness: "gemini-cli", size: 18 }),
		);

		const wrapper = container.querySelector('span[title="gemini-cli"]');
		expect(wrapper).toBeTruthy();
		const icon = container.querySelector("svg");
		expect(icon).toBeTruthy();
		expect(icon?.getAttribute("fill")).toBe("currentColor");
		expect(icon?.querySelector("title")?.textContent).toBe("Gemini");
	});
});
