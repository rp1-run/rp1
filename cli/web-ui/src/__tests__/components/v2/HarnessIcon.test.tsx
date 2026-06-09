import { describe, expect, test } from "bun:test";
import { render } from "@testing-library/react";
import { createElement } from "react";
import { HarnessIcon } from "../../../components/v2/HarnessIcon";

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

	test("renders the LobeHub Goose mono icon for Goose harnesses", () => {
		const { container } = render(
			createElement(HarnessIcon, { harness: "goose", size: 18 }),
		);

		const wrapper = container.querySelector('span[title="Goose"]');
		expect(wrapper).toBeTruthy();
		const icon = container.querySelector("svg");
		expect(icon).toBeTruthy();
		expect(icon?.getAttribute("fill")).toBe("currentColor");
		expect(icon?.querySelector("title")?.textContent).toBe("Goose");
	});
});
