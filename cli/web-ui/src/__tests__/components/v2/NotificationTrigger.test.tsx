import { beforeEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { createElement } from "react";
import { NotificationTrigger } from "../../../components/v2/NotificationTrigger";

describe("NotificationTrigger", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	test("surfaces actionable counts in the badge and accessible label", () => {
		render(
			createElement(NotificationTrigger, {
				summary: {
					totalCount: 3,
					actionRequiredCount: 1,
					attentionCount: 1,
					informationalCount: 1,
				},
			}),
		);

		expect(
			screen.getByRole("button", {
				name: "Open notifications. 1 action required, 1 attention, 1 informational notifications.",
			}),
		).toBeTruthy();
		expect(screen.getByText("2")).toBeTruthy();
	});

	test("shows a neutral informational dot without an actionable badge", () => {
		render(
			createElement(NotificationTrigger, {
				summary: {
					totalCount: 2,
					actionRequiredCount: 0,
					attentionCount: 0,
					informationalCount: 2,
				},
			}),
		);

		expect(
			screen.getByRole("button", {
				name: "Open notifications. 0 action required, 0 attention, 2 informational notifications.",
			}),
		).toBeTruthy();
		expect(screen.queryByText("2")).toBeNull();
	});
});
