import { useEffect, useState } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export interface ArtifactEmptyStateProps {
	className?: string;
}

type PressedButton = "left" | "right" | null;

const LOADER_CSS = `
.artifact-brand-loader {
	--artifact-loader-accent: #23d188;
	--artifact-loader-ink: #0f1113;
	--artifact-loader-glow: rgba(35, 209, 136, 0.2);
	--artifact-loader-label: #0f1113;
}
html.dark .artifact-brand-loader {
	--artifact-loader-accent: #23d188;
	--artifact-loader-ink: #f6f4ef;
	--artifact-loader-glow: rgba(35, 209, 136, 0.22);
	--artifact-loader-label: #f6f4ef;
}
.artifact-brand-loader .brand-halo {
	background: radial-gradient(circle, var(--artifact-loader-glow) 0%, transparent 62%);
	animation: artifact-loader-halo 4s ease-in-out infinite;
}
.artifact-brand-loader .brand-card {
	animation: artifact-loader-float 5s ease-in-out infinite;
	filter: drop-shadow(0 18px 32px rgba(15, 23, 42, 0.22));
}
.artifact-brand-loader .progress-label {
	color: var(--artifact-loader-label);
	letter-spacing: 0;
}
.artifact-brand-loader .cursor {
	color: var(--artifact-loader-accent);
	animation: artifact-loader-blink 1s step-end infinite;
}
.artifact-brand-loader .brand-ink,
.artifact-brand-loader .brand-button {
	fill: var(--artifact-loader-ink);
}
.artifact-brand-loader .brand-button {
	transform-box: fill-box;
	transform-origin: center;
	transition:
		fill 180ms ease,
		transform 180ms ease,
		filter 180ms ease;
}
.artifact-brand-loader .brand-card[data-pressed-button="left"] .brand-button-left,
.artifact-brand-loader .brand-card[data-pressed-button="right"] .brand-button-right {
	fill: var(--artifact-loader-accent);
	filter: drop-shadow(0 0 5px rgba(35, 209, 136, 0.5));
	transform: translateY(1.1px) scale(0.88);
}
.artifact-brand-loader .brand-accent {
	fill: var(--artifact-loader-accent);
}
@keyframes artifact-loader-halo {
	0%, 100% { opacity: 0.7; transform: scale(0.96); }
	50% { opacity: 1; transform: scale(1.03); }
}
@keyframes artifact-loader-float {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-10px); }
}
@keyframes artifact-loader-blink {
	0%, 49% { opacity: 1; }
	50%, 100% { opacity: 0; }
}
.artifact-brand-loader[data-animation-state="static"] * {
	animation: none !important;
}
.artifact-brand-loader[data-animation-state="static"] .brand-halo {
	opacity: 0.85;
	transform: none;
}
.artifact-brand-loader[data-animation-state="static"] .brand-card,
.artifact-brand-loader[data-animation-state="static"] .brand-button {
	transform: none;
}
`;

function EmptyStateBrandMark({
	pressedButton,
}: {
	pressedButton: PressedButton;
}) {
	return (
		<svg
			aria-hidden="true"
			className="brand-card relative z-10 w-[min(72%,22rem)] select-none"
			data-pressed-button={pressedButton ?? undefined}
			viewBox="0 0 165.30204 73.12661"
			xmlns="http://www.w3.org/2000/svg"
		>
			<g transform="translate(-24.589408 -71.164449)">
				<path
					className="brand-button brand-button-left"
					d="m 141.92404,117.10194 c 0,-4.53232 -3.68565,-8.21796 -8.21796,-8.21796 -4.53231,0 -8.21796,3.68564 -8.21796,8.21796 0,4.53231 3.68565,8.21795 8.21796,8.21795 4.53231,0 8.21796,-3.68564 8.21796,-8.21795 z m -12.30312,0 c 0,-2.25161 1.83356,-4.08517 4.08516,-4.08517 2.25161,0 4.08517,1.83092 4.08517,4.08517 0,2.25425 -1.83356,4.08516 -4.08517,4.08516 -2.2516,0 -4.08516,-1.83356 -4.08516,-4.08516 z"
				/>
				<path
					className="brand-button brand-button-right"
					d="m 160.18823,106.61915 c 0,-4.53232 -3.68565,-8.217963 -8.21796,-8.217963 -4.53231,0 -8.21796,3.685643 -8.21796,8.217963 0,4.53231 3.68565,8.21795 8.21796,8.21795 4.53231,0 8.21796,-3.68564 8.21796,-8.21795 z m -12.30048,0 c 0,-2.25161 1.83092,-4.08517 4.08517,-4.08517 2.25425,0 4.08516,1.83356 4.08516,4.08517 0,2.2516 -1.83356,4.08516 -4.08516,4.08516 -2.25161,0 -4.08517,-1.83091 -4.08517,-4.08516 z"
				/>
				<path
					className="brand-ink"
					d="M 175.79335,118.27139 170.83241,91.529958 C 169.2555,83.259083 162.11704,77.258333 153.85675,77.258333 H 60.62552 c -8.257645,0 -15.396104,6.003396 -16.975666,14.282208 l -4.958292,26.720269 c -0.989541,5.18319 0.291042,10.39019 3.513667,14.28486 3.013604,3.64331 7.283979,5.64885 12.025312,5.64885 h 20.60575 c 2.018771,0 3.987271,-0.71702 5.548312,-2.02142 l 3.926417,-3.28348 c 0.875771,-0.73289 0.992188,-2.03464 0.259292,-2.91041 -0.732896,-0.87577 -2.034646,-0.99219 -2.910417,-0.25929 l -3.929062,3.28347 c -0.817563,0.68263 -1.846792,1.05834 -2.897188,1.05834 h -20.60575 c -3.487208,0 -6.627812,-1.47373 -8.839729,-4.14867 -2.434166,-2.94217 -3.39725,-6.90562 -2.637895,-10.88496 L 47.708562,92.307833 C 48.915062,85.984291 54.346958,81.39377 60.622875,81.39377 H 153.8541 c 6.27592,0 11.70781,4.590521 12.91167,10.903479 l 4.96094,26.741441 c 0.7567,3.96875 -0.20373,7.9322 -2.6379,10.87702 -2.21456,2.67493 -5.35252,4.14866 -8.83973,4.14866 h -20.60575 c -1.05039,0 -2.07962,-0.3757 -2.89719,-1.05833 l -3.92906,-3.28348 c -0.87577,-0.73289 -2.18016,-0.61648 -2.91041,0.25929 -0.7329,0.87577 -0.61648,2.18017 0.25929,2.91042 l 3.92906,3.28348 c 1.5584,1.30439 3.52954,2.02142 5.54831,2.02142 h 20.60575 c 4.74133,0 9.01171,-2.00555 12.02531,-5.64886 3.22263,-3.89467 4.50321,-9.10167 3.51632,-14.27427 z"
				/>
				<polygon
					className="brand-ink"
					points="703.22,116.4 703.22,100.78 664.63,100.78 664.63,62.19 649,62.19 649,100.78 610.41,100.78 610.41,116.4 649,116.4 649,155 664.63,155 664.63,116.4 "
					transform="matrix(0.26458333,0,0,0.26458333,-105.64129,77.258333)"
				/>
				<rect
					className="brand-accent"
					x="94.150871"
					y="127.65352"
					width="26.183167"
					height="4.1327915"
				/>
			</g>
		</svg>
	);
}

export function ArtifactEmptyState({ className }: ArtifactEmptyStateProps) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const [pressedButton, setPressedButton] = useState<PressedButton>(null);

	useEffect(() => {
		if (prefersReducedMotion) {
			setPressedButton(null);
			return;
		}

		let releaseTimer: ReturnType<typeof setTimeout> | undefined;
		let pressTimer: ReturnType<typeof setTimeout> | undefined;

		const schedulePress = () => {
			pressTimer = setTimeout(
				() => {
					setPressedButton(Math.random() < 0.5 ? "left" : "right");
					releaseTimer = setTimeout(
						() => {
							setPressedButton(null);
							schedulePress();
						},
						180 + Math.random() * 140,
					);
				},
				700 + Math.random() * 1600,
			);
		};

		schedulePress();

		return () => {
			if (pressTimer) clearTimeout(pressTimer);
			if (releaseTimer) clearTimeout(releaseTimer);
		};
	}, [prefersReducedMotion]);

	return (
		<output
			aria-live="polite"
			aria-label="Creating artifacts"
			className={cn(
				"flex h-full min-h-[18rem] w-full items-center justify-center overflow-hidden",
				className,
			)}
		>
			<span className="sr-only">Creating artifacts</span>
			<div
				data-testid="artifact-empty-state-visual"
				data-animation-state={prefersReducedMotion ? "static" : "running"}
				className="artifact-brand-loader relative flex h-full max-h-[400px] min-h-[18rem] w-full max-w-[700px] flex-col items-center justify-center gap-5 overflow-hidden"
			>
				<style>{LOADER_CSS}</style>
				<span
					aria-hidden="true"
					className="brand-halo absolute h-64 w-64 rounded-full blur-2xl"
				/>
				<EmptyStateBrandMark pressedButton={pressedButton} />
				<div
					aria-hidden="true"
					className="progress-label relative z-10 font-mono text-sm font-medium"
				>
					Creating artifacts
					<span className="cursor">_</span>
				</div>
			</div>
		</output>
	);
}
