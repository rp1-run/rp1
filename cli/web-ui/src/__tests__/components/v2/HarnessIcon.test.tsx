import { describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { createElement } from "react";

mock.module("@lobehub/icons", () => ({
	Claude: ({ size }: { size?: number }) =>
		createElement("svg", { "data-icon": "Claude", "data-size": size }),
	GithubCopilot: ({ size }: { size?: number }) =>
		createElement("svg", { "data-icon": "GithubCopilot", "data-size": size }),
	OpenAI: ({ size }: { size?: number }) =>
		createElement("svg", { "data-icon": "OpenAI", "data-size": size }),
	OpenCode: ({ size }: { size?: number }) =>
		createElement("svg", { "data-icon": "OpenCode", "data-size": size }),
}));

const { HarnessIcon } = await import("../../../components/v2/HarnessIcon");

describe("HarnessIcon", () => {
	test("renders the GithubCopilot icon for copilot harnesses", () => {
		const { container } = render(
			createElement(HarnessIcon, { harness: "copilot", size: 16 }),
		);

		const wrapper = container.querySelector('span[title="copilot"]');
		expect(wrapper).toBeTruthy();
		expect(
			container.querySelector('svg[data-icon="GithubCopilot"]'),
		).toBeTruthy();
	});
});
