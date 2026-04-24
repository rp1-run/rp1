import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export interface ArtifactEmptyStateProps {
	className?: string;
}

const makeFrame = (lines: readonly string[]) => lines.join("\n");

const ARTIFACT_EMPTY_STATE_FRAMES = [
	makeFrame([
		"+----------------+",
		"|                |",
		"|       .        |",
		"|      /|\\       |",
		"|       |        |",
		"|                |",
		"+----------------+",
	]),
	makeFrame([
		"+----------------+",
		"|                |",
		"|      .-.       |",
		"|     / | \\      |",
		"|       |        |",
		"|                |",
		"+----------------+",
	]),
	makeFrame([
		"+----------------+",
		"|                |",
		"|     .---.      |",
		"|    /  |  \\     |",
		"|       |        |",
		"|                |",
		"+----------------+",
	]),
	makeFrame([
		"+----------------+",
		"|                |",
		"|    .-----.     |",
		"|   /   |   \\    |",
		"|       |        |",
		"|                |",
		"+----------------+",
	]),
	makeFrame([
		"+----------------+",
		"|                |",
		"|    .-----.     |",
		"|   |  rp1  |    |",
		"|    '-----'     |",
		"|                |",
		"+----------------+",
	]),
] as const;

export const ARTIFACT_EMPTY_STATE_LOOP_COUNT = 5;
export const ARTIFACT_EMPTY_STATE_FRAME_COUNT =
	ARTIFACT_EMPTY_STATE_FRAMES.length;
export const ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS = 180;

const FINAL_FRAME_INDEX = ARTIFACT_EMPTY_STATE_FRAMES.length - 1;
const TOTAL_ANIMATION_TICKS =
	ARTIFACT_EMPTY_STATE_FRAME_COUNT * ARTIFACT_EMPTY_STATE_LOOP_COUNT;

export function ArtifactEmptyState({ className }: ArtifactEmptyStateProps) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [frameIndex, setFrameIndex] = useState(() =>
		prefersReducedMotion ? FINAL_FRAME_INDEX : 0,
	);
	const [isComplete, setIsComplete] = useState(prefersReducedMotion);

	useEffect(() => {
		if (prefersReducedMotion) {
			setFrameIndex(FINAL_FRAME_INDEX);
			setIsComplete(true);
			return;
		}

		let tickCount = 0;
		setFrameIndex(0);
		setIsComplete(false);

		const intervalId = window.setInterval(() => {
			tickCount += 1;

			if (tickCount >= TOTAL_ANIMATION_TICKS) {
				setFrameIndex(FINAL_FRAME_INDEX);
				setIsComplete(true);
				window.clearInterval(intervalId);
				return;
			}

			setFrameIndex(tickCount % ARTIFACT_EMPTY_STATE_FRAME_COUNT);
		}, ARTIFACT_EMPTY_STATE_FRAME_INTERVAL_MS);

		return () => {
			window.clearInterval(intervalId);
		};
	}, [prefersReducedMotion]);

	return (
		<output
			aria-live="polite"
			aria-label="Waiting for artifacts"
			className={cn(
				"flex h-full min-h-[18rem] w-full items-center justify-center p-6",
				className,
			)}
		>
			<span className="sr-only">Waiting for artifacts</span>
			<div className="grid aspect-[4/3] w-[clamp(11rem,30%,26rem)] min-w-44 place-items-center overflow-hidden rounded-sm border border-border/60 bg-muted/20 text-muted-foreground/75 shadow-inner">
				<pre
					aria-hidden="true"
					data-testid="artifact-empty-state-visual"
					data-animation-state={isComplete ? "complete" : "running"}
					data-frame-index={frameIndex}
					className="m-0 select-none whitespace-pre text-center font-mono text-xs leading-none tracking-[0]"
				>
					{ARTIFACT_EMPTY_STATE_FRAMES[frameIndex]}
				</pre>
			</div>
		</output>
	);
}
