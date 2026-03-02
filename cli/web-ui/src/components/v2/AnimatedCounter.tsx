import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface AnimatedCounterProps {
	value: number;
	duration?: number;
	className?: string;
}

function easeOutCubic(t: number): number {
	return 1 - (1 - t) ** 3;
}

export function AnimatedCounter({
	value,
	duration = 500,
	className,
}: AnimatedCounterProps) {
	const [displayValue, setDisplayValue] = useState(0);
	const isInitialMount = useRef(true);
	const rafId = useRef<number | null>(null);
	const prefersReducedMotion = useRef(false);

	useEffect(() => {
		prefersReducedMotion.current = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
	}, []);

	useEffect(() => {
		if (prefersReducedMotion.current || !isInitialMount.current) {
			setDisplayValue(value);
			return;
		}

		isInitialMount.current = false;

		if (value === 0) {
			setDisplayValue(0);
			return;
		}

		const startTime = performance.now();

		function animate(now: number) {
			const elapsed = now - startTime;
			const progress = Math.min(elapsed / duration, 1);
			const eased = easeOutCubic(progress);
			setDisplayValue(Math.round(eased * value));

			if (progress < 1) {
				rafId.current = requestAnimationFrame(animate);
			}
		}

		rafId.current = requestAnimationFrame(animate);

		return () => {
			if (rafId.current !== null) {
				cancelAnimationFrame(rafId.current);
			}
		};
	}, [value, duration]);

	return <span className={cn("tabular-nums", className)}>{displayValue}</span>;
}
