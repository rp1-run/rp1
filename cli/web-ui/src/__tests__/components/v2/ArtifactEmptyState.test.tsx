import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { act, cleanup, render, screen } from "@testing-library/react";

let importVersion = 0;
let prefersReducedMotion = false;

type IntervalCallback = () => void;

const originalWindowSetInterval = window.setInterval;
const originalWindowClearInterval = window.clearInterval;

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
		installIntervalMocks();
	});

	afterEach(() => {
		cleanup();
		window.setInterval = originalWindowSetInterval;
		window.clearInterval = originalWindowClearInterval;
	});

	test("renders a centered ASCII visual with an accessible label", async () => {
		const { ArtifactEmptyState } = await loadComponent();

		render(<ArtifactEmptyState />);

		const status = screen.getByRole("status", {
			name: "Waiting for artifacts",
		});
		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(status.className).toContain("items-center");
		expect(status.className).toContain("justify-center");
		expect(status.className).toContain("h-full");
		expect(visual.textContent).toContain("+----------------+");
		expect(visual.textContent).not.toContain("Waiting for artifacts");
		expect(visual.parentElement?.className).toContain(
			"w-[clamp(11rem,30%,26rem)]",
		);
		expect(visual.parentElement?.className).toContain("aspect-[4/3]");
	});

	test("advances frames and stops after exactly five loops", async () => {
		const {
			ArtifactEmptyState,
			ARTIFACT_EMPTY_STATE_FRAME_COUNT,
			ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS,
			ARTIFACT_EMPTY_STATE_LOOP_COUNT,
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

		act(() => {
			callback?.();
		});

		expect(visual.dataset.frameIndex).toBe("1");

		const remainingTicksBeforeCompletion =
			ARTIFACT_EMPTY_STATE_FRAME_COUNT * ARTIFACT_EMPTY_STATE_LOOP_COUNT - 2;

		for (let i = 0; i < remainingTicksBeforeCompletion; i += 1) {
			act(() => {
				callback?.();
			});
		}

		expect(clearedIntervalIds).not.toContain(intervalId);
		expect(visual.dataset.animationState).toBe("running");

		act(() => {
			callback?.();
		});

		expect(clearedIntervalIds).toContain(intervalId);
		expect(visual.dataset.animationState).toBe("complete");
		expect(visual.dataset.frameIndex).toBe(
			String(ARTIFACT_EMPTY_STATE_FRAME_COUNT - 1),
		);
	});

	test("shows the final static frame immediately for reduced motion", async () => {
		prefersReducedMotion = true;
		const { ArtifactEmptyState, ARTIFACT_EMPTY_STATE_FRAME_COUNT } =
			await loadComponent();

		render(<ArtifactEmptyState />);

		const visual = screen.getByTestId("artifact-empty-state-visual");

		expect(intervalCallbacks.size).toBe(0);
		expect(visual.dataset.animationState).toBe("complete");
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
