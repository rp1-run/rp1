import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

let importVersion = 0;
let prefersReducedMotion = false;

mock.module("@/providers/ThemeProvider", () => ({
	useTheme: () => ({
		theme: "dark",
	}),
}));

mock.module("@/hooks/usePrefersReducedMotion", () => ({
	usePrefersReducedMotion: () => prefersReducedMotion,
}));

async function loadComponent() {
	return await import(
		`../../../components/v2/ArtifactEmptyState.tsx?artifact-empty-state-test=${++importVersion}`
	);
}

describe("ArtifactEmptyState", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		prefersReducedMotion = false;
	});

	afterEach(() => {
		cleanup();
	});

	test("renders current brand artwork with an accessible progress label", async () => {
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const status = screen.getByRole("status", {
			name: "Creating artifacts",
		});
		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(status.className).toContain("items-center");
		expect(status.className).toContain("justify-center");
		expect(status.className).not.toContain("bg-");
		expect(visual.tagName.toLowerCase()).toBe("div");
		expect(visual.getAttribute("class")).toContain("artifact-brand-loader");
		expect(visual.dataset.animationState).toBe("running");
		expect(visual.textContent).toContain("Creating artifacts");
		expect(visual.querySelector("img")?.getAttribute("src")).toBe(
			"/rp1-empty-state-light.svg",
		);
		expect(visual.querySelector(".brand-card")).not.toBeNull();
		expect(visual.querySelector(".brand-halo")).not.toBeNull();
		expect(visual.querySelector(".scan-line")).not.toBeNull();
		expect(visual.querySelector(".cursor")).not.toBeNull();
		expect(visual.querySelector("style")?.textContent).toContain(
			"html.dark .artifact-brand-loader",
		);
		expect(visual.textContent).not.toContain("⣠⣾⣿⣿⣿⣦⣄");
	});

	test("uses the static SVG state for reduced motion", async () => {
		prefersReducedMotion = true;
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const visual = screen.getByTestId("artifact-empty-state-visual");
		const style = visual.querySelector("style");

		expect(visual.dataset.animationState).toBe("static");
		expect(style?.textContent).toContain('[data-animation-state="static"] *');
		expect(visual.querySelector(".brand-card")?.getAttribute("src")).toBe(
			"/rp1-empty-state-light.svg",
		);
	});
});
