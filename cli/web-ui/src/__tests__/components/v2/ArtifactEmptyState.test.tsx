import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { cleanup, render, screen } from "@testing-library/react";

let importVersion = 0;
let prefersReducedMotion = false;

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

	test("renders the artifact reconstruction loader with an accessible label", async () => {
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const status = screen.getByRole("status", {
			name: "Creating artifacts",
		});
		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(status.className).toContain("items-center");
		expect(status.className).toContain("justify-center");
		expect(status.className).not.toContain("bg-");
		expect(visual.tagName.toLowerCase()).toBe("svg");
		expect(visual.getAttribute("viewBox")).toBe("0 0 1200 800");
		expect(visual.getAttribute("class")).toContain(
			"artifact-reconstruction-loader",
		);
		expect(visual.dataset.animationState).toBe("running");
		expect(visual.textContent).toContain("CREATING ARTIFACTS");
		expect(visual.textContent).toContain("⣠⣾⣿⣿⣿⣦⣄");
		expect(visual.querySelectorAll(".reconstruction-row")).toHaveLength(9);
		expect(visual.querySelectorAll(".grid-line")).toHaveLength(6);
		expect(visual.querySelector(".cursor")).not.toBeNull();
		expect(visual.querySelector("radialGradient")).toBeNull();
		expect(visual.querySelector(".loader-bg")).toBeNull();
		expect(visual.querySelector("style")?.textContent).toContain(
			"html.dark .artifact-reconstruction-loader",
		);
		expect(visual.textContent).not.toContain("artifact_registered");
		expect(visual.textContent).not.toContain("waiting for your workflow");
	});

	test("uses the static SVG state for reduced motion", async () => {
		prefersReducedMotion = true;
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const visual = screen.getByTestId("artifact-empty-state-visual");
		const style = visual.querySelector("style");

		expect(visual.dataset.animationState).toBe("static");
		expect(style?.textContent).toContain('[data-animation-state="static"] *');
		expect(visual.querySelectorAll(".reconstruction-row")).toHaveLength(9);
	});
});
