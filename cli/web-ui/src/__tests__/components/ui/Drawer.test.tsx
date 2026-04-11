import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";
import { Drawer } from "../../../components/ui/drawer";

describe("Drawer", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
	});

	afterEach(() => {
		cleanup();
	});

	test("keeps an open right-side drawer onscreen", () => {
		render(
			<Drawer open={true} onClose={() => {}} side="right" title="Notifications">
				<div>Drawer content</div>
			</Drawer>,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Notifications",
		}) as HTMLDivElement;

		expect(dialog.style.transform).toBe("translateX(0)");
	});

	test("moves a closed right-side drawer fully offscreen", () => {
		render(
			<Drawer
				open={false}
				onClose={() => {}}
				side="right"
				title="Notifications"
			>
				<div>Drawer content</div>
			</Drawer>,
		);

		const dialog = screen.getByRole("dialog", {
			name: "Notifications",
		}) as HTMLDivElement;

		expect(dialog.style.transform).toBe("translateX(100%)");
	});
});
