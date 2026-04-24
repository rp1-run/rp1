import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";

let importVersion = 0;
let prefersReducedMotion = false;

type IntervalCallback = () => void;

const originalWindowSetInterval = window.setInterval;
const originalWindowClearInterval = window.clearInterval;
const originalMathRandom = Math.random;

let nextIntervalId = 1;
let intervalCallbacks: Map<number, IntervalCallback>;
let intervalDelays: Map<number, number | undefined>;
let clearedIntervalIds: number[];

mock.module("@/hooks/usePrefersReducedMotion", () => ({
	usePrefersReducedMotion: () => prefersReducedMotion,
}));

async function loadComponent() {
	return await import(
		`../../../components/v2/ArtifactEmptyState.tsx?artifact-empty-state-test=${++importVersion}`
	);
}

function installIntervalMocks() {
	nextIntervalId = 1;
	intervalCallbacks = new Map();
	intervalDelays = new Map();
	clearedIntervalIds = [];

	window.setInterval = ((handler: TimerHandler, timeout?: number) => {
		if (typeof handler !== "function") {
			throw new Error("ArtifactEmptyState tests expect function intervals");
		}

		const id = nextIntervalId++;
		intervalCallbacks.set(id, handler as IntervalCallback);
		intervalDelays.set(id, timeout);
		return id;
	}) as typeof window.setInterval;

	window.clearInterval = ((id?: number) => {
		if (typeof id !== "number") return;
		clearedIntervalIds.push(id);
		intervalCallbacks.delete(id);
	}) as typeof window.clearInterval;
}

describe("ArtifactEmptyState", () => {
	beforeEach(() => {
		document.body.innerHTML = "";
		prefersReducedMotion = false;
		Math.random = () => 0;
		installIntervalMocks();
	});

	afterEach(() => {
		cleanup();
		window.setInterval = originalWindowSetInterval;
		window.clearInterval = originalWindowClearInterval;
		Math.random = originalMathRandom;
	});

	test("renders a large centered SVG ASCII visual with an accessible label", async () => {
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const status = screen.getByRole("status", {
			name: "Waiting for artifacts",
		});
		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(status.className).toContain("items-center");
		expect(status.className).toContain("justify-center");
		expect(status.className).toContain("h-full");
		expect(visual.tagName.toLowerCase()).toBe("svg");
		expect(visual.getAttribute("viewBox")).toBe("0 0 680 360");
		expect(visual.querySelector("rect")).toBeNull();
		expect(visual.textContent).toContain("artifact_registered");
		expect(visual.textContent).toContain("watchArtifacts");
		expect(visual.textContent).not.toContain("Waiting for artifacts");
		expect(visual.querySelector('[data-segment-tone="cyan"]')).not.toBeNull();
		expect(visual.querySelector('[data-segment-tone="lime"]')).not.toBeNull();
		expect(visual.dataset.variantIndex).toBe("0");
		expect(visual.getAttribute("class")).toContain("w-[90%]");
		expect(visual.getAttribute("class")).toContain("aspect-[17/9]");
		expect(visual.getAttribute("class")).toContain("max-w-none");
		expect(visual.getAttribute("class")).not.toContain("border");
		expect(visual.getAttribute("class")).not.toContain("bg-muted");
	});

	test("chooses one of ten code variants on mount", async () => {
		Math.random = () => 0.999;
		const { ArtifactEmptyState, ARTIFACT_EMPTY_STATE_VARIANT_COUNT } =
			await loadComponent();

		render(<ArtifactEmptyState />);

		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(ARTIFACT_EMPTY_STATE_VARIANT_COUNT).toBe(10);
		expect(visual.dataset.variantIndex).toBe(
			String(ARTIFACT_EMPTY_STATE_VARIANT_COUNT - 1),
		);
		expect(visual.textContent).toContain("compile artifact groups");
	});

	test("advances frames and loops continuously", async () => {
		const {
			ArtifactEmptyState,
			ARTIFACT_EMPTY_STATE_FRAME_COUNT,
			ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS,
		} = await loadComponent();

		render(<ArtifactEmptyState />);

		const [intervalId] = intervalCallbacks.keys();
		const callback = intervalCallbacks.get(intervalId);
		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(callback).toBeTruthy();
		expect(intervalDelays.get(intervalId)).toBe(
			ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS,
		);
		expect(visual.dataset.animationState).toBe("running");
		expect(visual.dataset.frameIndex).toBe("0");

		for (let i = 0; i < ARTIFACT_EMPTY_STATE_FRAME_COUNT + 2; i += 1) {
			act(() => {
				callback?.();
			});
		}

		expect(visual.dataset.animationState).toBe("running");
		expect(visual.dataset.frameIndex).toBe("2");
		expect(clearedIntervalIds).not.toContain(intervalId);
	});

	test("shows the final static frame immediately for reduced motion", async () => {
		prefersReducedMotion = true;
		const { ArtifactEmptyState, ARTIFACT_EMPTY_STATE_FRAME_COUNT } =
			await loadComponent();

		render(<ArtifactEmptyState />);

		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(intervalCallbacks.size).toBe(0);
		expect(visual.dataset.animationState).toBe("static");
		expect(visual.dataset.frameIndex).toBe(
			String(ARTIFACT_EMPTY_STATE_FRAME_COUNT - 1),
		);
	});

	test("clears the interval on unmount before animation completion", async () => {
		const { ArtifactEmptyState } = await loadComponent();

		const { unmount } = render(<ArtifactEmptyState />);
		const [intervalId] = intervalCallbacks.keys();

		expect(clearedIntervalIds).not.toContain(intervalId);

		unmount();

		expect(clearedIntervalIds).toContain(intervalId);
	});
});
