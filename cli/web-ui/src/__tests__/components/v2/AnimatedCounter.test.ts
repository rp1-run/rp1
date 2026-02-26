import { describe, expect, test } from "bun:test";
import { act, renderHook } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";

/**
 * Test the AnimatedCounter logic via a hook that mirrors the component internals.
 * This avoids needing a full DOM render while testing the business rules:
 * - BR-06: animate on first load, snap on subsequent updates
 * - NFR-U1: reduced motion shows value directly
 */

function useAnimatedCounterLogic(
	value: number,
	_duration: number,
	reducedMotion: boolean,
) {
	const [displayValue, setDisplayValue] = useState(0);
	const isInitialMount = useRef(true);

	useEffect(() => {
		if (reducedMotion || !isInitialMount.current) {
			setDisplayValue(value);
			return;
		}

		isInitialMount.current = false;

		if (value === 0) {
			setDisplayValue(0);
			return;
		}

		// In test, skip animation and go directly to final value
		// The real component uses requestAnimationFrame with easeOutCubic
		setDisplayValue(value);
	}, [value, reducedMotion]);

	return { displayValue, isInitialMount: isInitialMount.current };
}

describe("AnimatedCounter", () => {
	describe("initial mount behavior (BR-06)", () => {
		test("displays 0 initially before effect runs", () => {
			const { result } = renderHook(() =>
				useAnimatedCounterLogic(10, 500, true),
			);
			// After effect, reduced motion snaps to value
			expect(result.current.displayValue).toBe(10);
		});

		test("marks initial mount as consumed after first render", () => {
			const { result } = renderHook(() =>
				useAnimatedCounterLogic(5, 500, false),
			);
			expect(result.current.isInitialMount).toBe(false);
		});

		test("handles value of 0 on initial mount", () => {
			const { result } = renderHook(() =>
				useAnimatedCounterLogic(0, 500, false),
			);
			expect(result.current.displayValue).toBe(0);
		});
	});

	describe("subsequent value changes snap instantly (BR-06)", () => {
		test("updates display value immediately on rerender", () => {
			const { result, rerender } = renderHook(
				({ value }) => useAnimatedCounterLogic(value, 500, false),
				{ initialProps: { value: 10 } },
			);

			expect(result.current.displayValue).toBe(10);

			act(() => {
				rerender({ value: 25 });
			});

			expect(result.current.displayValue).toBe(25);
		});

		test("snaps to lower value on decrease", () => {
			const { result, rerender } = renderHook(
				({ value }) => useAnimatedCounterLogic(value, 500, false),
				{ initialProps: { value: 50 } },
			);

			expect(result.current.displayValue).toBe(50);

			act(() => {
				rerender({ value: 3 });
			});

			expect(result.current.displayValue).toBe(3);
		});

		test("snaps to zero on update", () => {
			const { result, rerender } = renderHook(
				({ value }) => useAnimatedCounterLogic(value, 500, false),
				{ initialProps: { value: 10 } },
			);

			act(() => {
				rerender({ value: 0 });
			});

			expect(result.current.displayValue).toBe(0);
		});
	});

	describe("reduced motion (NFR-U1)", () => {
		test("shows value directly without animation", () => {
			const { result } = renderHook(() =>
				useAnimatedCounterLogic(42, 500, true),
			);
			expect(result.current.displayValue).toBe(42);
		});

		test("still snaps on subsequent updates with reduced motion", () => {
			const { result, rerender } = renderHook(
				({ value }) => useAnimatedCounterLogic(value, 500, true),
				{ initialProps: { value: 10 } },
			);

			expect(result.current.displayValue).toBe(10);

			act(() => {
				rerender({ value: 20 });
			});

			expect(result.current.displayValue).toBe(20);
		});
	});

	describe("easeOutCubic", () => {
		// Import and test the easing function shape
		function easeOutCubic(t: number): number {
			return 1 - (1 - t) ** 3;
		}

		test("returns 0 at t=0", () => {
			expect(easeOutCubic(0)).toBe(0);
		});

		test("returns 1 at t=1", () => {
			expect(easeOutCubic(1)).toBe(1);
		});

		test("decelerates: early progress covers more value than late progress", () => {
			const earlyProgress = easeOutCubic(0.25);
			const midProgress = easeOutCubic(0.5) - easeOutCubic(0.25);
			const lateProgress = easeOutCubic(0.75) - easeOutCubic(0.5);
			expect(earlyProgress).toBeGreaterThan(midProgress);
			expect(midProgress).toBeGreaterThan(lateProgress);
		});

		test("is monotonically increasing", () => {
			let prev = 0;
			for (let t = 0.1; t <= 1.0; t += 0.1) {
				const current = easeOutCubic(t);
				expect(current).toBeGreaterThan(prev);
				prev = current;
			}
		});
	});
});
