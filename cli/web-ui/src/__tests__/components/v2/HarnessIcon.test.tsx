import { beforeEach, describe, expect, mock, test } from "bun:test";
import { render } from "@testing-library/react";
import { createElement } from "react";

let harnessIconImportVersion = 0;

async function loadHarnessIcon() {
	mock.module("@lobehub/icons", () => ({
		Claude: ({ size }: { size?: number }) =>
			createElement("svg", { "data-icon": "Claude", "data-size": size }),
		Gemini: ({ size }: { size?: number }) =>
			createElement("svg", { "data-icon": "Gemini", "data-size": size }),
		GithubCopilot: ({ size }: { size?: number }) =>
			createElement("svg", {
				"data-icon": "GithubCopilot",
				"data-size": size,
			}),
		OpenAI: ({ size }: { size?: number }) =>
			createElement("svg", { "data-icon": "OpenAI", "data-size": size }),
		OpenCode: ({ size }: { size?: number }) =>
			createElement("svg", { "data-icon": "OpenCode", "data-size": size }),
	}));

	const { HarnessIcon } = await import(
		`../../../components/v2/HarnessIcon.tsx?harness-icon-test=${++harnessIconImportVersion}`
	);

	return HarnessIcon as (props: {
		harness: string;
		size?: number;
	}) => JSX.Element;
}

describe("HarnessIcon", () => {
	beforeEach(() => {
		mock.restore();
	});

	test("renders the GithubCopilot icon for copilot harnesses", async () => {
		const HarnessIcon = await loadHarnessIcon();
		const { container } = render(
			createElement(HarnessIcon, { harness: "copilot", size: 16 }),
		);

		const wrapper = container.querySelector('span[title="copilot"]');
		expect(wrapper).toBeTruthy();
		expect(
			container.querySelector('svg[data-icon="GithubCopilot"]'),
		).toBeTruthy();
	});

	test("renders the LobeHub Gemini mono icon for Gemini CLI harnesses", async () => {
		const HarnessIcon = await loadHarnessIcon();
		const { container } = render(
			createElement(HarnessIcon, { harness: "gemini-cli", size: 18 }),
		);

		const wrapper = container.querySelector('span[title="gemini-cli"]');
		expect(wrapper).toBeTruthy();
		expect(container.querySelector('svg[data-icon="Gemini"]')).toBeTruthy();
	});
});
