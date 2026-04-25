import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";

export interface ArtifactEmptyStateProps {
	className?: string;
}

const GRID_LINES = [
	{
		x: 600,
		y: 520,
		size: 12,
		className: "grid-line gl1",
		text: " . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . ",
	},
	{
		x: 600,
		y: 550,
		size: 14,
		className: "grid-line gl2",
		text: "  - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - ",
	},
	{
		x: 600,
		y: 590,
		size: 16,
		className: "grid-line gl3",
		text: "   .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  .  ",
	},
	{
		x: 600,
		y: 640,
		size: 18,
		className: "grid-line gl4",
		text: "    -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   -   - ",
	},
	{
		x: 600,
		y: 700,
		size: 20,
		className: "grid-line gl5",
		text: "      .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    .    . ",
	},
	{
		x: 600,
		y: 770,
		size: 24,
		className: "grid-line gl6",
		text: "         -     -     -     -     -     -     -     -     -     -     -     -     -     -     -     -     -     -    ",
	},
] as const;

const GAMEPAD_ROWS = [
	{
		className: "reconstruction-row r1",
		y: 230,
		text: "⠀⠀⠀⠀⠀⠀⠀⠀⣀⣀⡀⠀⠀⠀⠀⠀⠀⠀⠀⢀⣀⣀⠀⠀⠀⠀⠀⠀⠀⠀",
	},
	{
		className: "reconstruction-row r2",
		y: 272,
		text: "⠀⠀⠀⠀⠀⠀⣠⣾⣿⣿⣿⣦⣄⡀⠀⠀⢀⣠⣴⣿⣿⣿⣷⣄⠀⠀⠀⠀⠀⠀",
	},
	{
		className: "reconstruction-row r3",
		y: 314,
		text: "⠀⠀⠀⠀⠀⣼⣿⣿⠛⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣏⠉⣹⣿⣧⠀⠀⠀⠀⠀",
	},
	{
		className: "reconstruction-row r4",
		y: 356,
		text: "⠀⠀⠀⠀⣼⣿⣉⣉⠀⣉⣙⣿⣿⣿⣿⣿⣿⣿⣟⠁⣹⣿⣏⠀⣹⣧⠀⠀⠀⠀",
	},
	{
		className: "reconstruction-row r5",
		y: 398,
		text: "⠀⠀⠀⢠⣿⣿⣿⣿⣀⣿⣿⣿⣉⣉⣿⣿⣉⣹⣿⣿⣏⠀⣹⣿⣿⣿⡄⠀⠀⠀",
	},
	{
		className: "reconstruction-row r6",
		y: 440,
		text: "⠀⠀⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⠿⠿⠿⠿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇⠀⠀⠀",
	},
	{
		className: "reconstruction-row r7",
		y: 482,
		text: "⠀⠀⠀⢸⣿⣿⣿⣿⣿⠟⠉⠀⠀⠀⠀⠀⠀⠀⠀⠉⠻⣿⣿⣿⣿⣿⡇⠀⠀⠀",
	},
	{
		className: "reconstruction-row r8",
		y: 524,
		text: "⠀⠀⠀⠸⣿⣿⣿⡟⠁⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠈⢻⣿⣿⣿⠇⠀⠀⠀",
	},
	{
		className: "reconstruction-row r9",
		y: 566,
		text: "⠀⠀⠀⠀⠉⠉⠉⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠀⠉⠉⠉⠀⠀⠀⠀",
	},
] as const;

const STAR_POINTS = [
	{ x: 120, y: 150, text: "+" },
	{ x: 850, y: 90, text: "." },
	{ x: 350, y: 70, text: "." },
	{ x: 750, y: 250, text: "+" },
	{ x: 1050, y: 450, text: "." },
	{ x: 80, y: 400, text: "." },
	{ x: 500, y: 380, text: "+" },
] as const;

const LOADER_CSS = `
.artifact-reconstruction-loader {
	--artifact-loader-neon: #1d7f32;
	--artifact-loader-bright: #2c9b41;
	--artifact-loader-dim: #72906d;
	--artifact-loader-radar-low: #a8b8a4;
	--artifact-loader-flash: #f6fff6;
	--artifact-loader-shadow: 0 0 1px rgba(29, 127, 50, 0.16), 0 0 5px rgba(29, 127, 50, 0.16);
	--artifact-loader-shadow-dim: 0 0 1px rgba(29, 127, 50, 0.12);
	--artifact-loader-shadow-bright: 0 0 5px rgba(44, 155, 65, 0.26);
	--artifact-loader-shadow-flash: 0 0 10px rgba(44, 155, 65, 0.35);
}
html.dark .artifact-reconstruction-loader {
	--artifact-loader-neon: #33ff33;
	--artifact-loader-bright: #44ff44;
	--artifact-loader-dim: #118811;
	--artifact-loader-radar-low: #004400;
	--artifact-loader-flash: #ffffff;
	--artifact-loader-shadow: 0 0 4px #11aa11, 0 0 12px #005500;
	--artifact-loader-shadow-dim: 0 0 2px #003300;
	--artifact-loader-shadow-bright: 0 0 10px #44ff44;
	--artifact-loader-shadow-flash: 0 0 15px #ffffff;
}
.artifact-reconstruction-loader .neon-glow {
	fill: var(--artifact-loader-neon);
	text-shadow: var(--artifact-loader-shadow);
}
.artifact-reconstruction-loader .dim-glow {
	fill: var(--artifact-loader-dim);
	text-shadow: var(--artifact-loader-shadow-dim);
}
.artifact-reconstruction-loader .r9 { animation: artifact-loader-r9 10s infinite; }
.artifact-reconstruction-loader .r8 { animation: artifact-loader-r8 10s infinite; }
.artifact-reconstruction-loader .r7 { animation: artifact-loader-r7 10s infinite; }
.artifact-reconstruction-loader .r6 { animation: artifact-loader-r6 10s infinite; }
.artifact-reconstruction-loader .r5 { animation: artifact-loader-r5 10s infinite; }
.artifact-reconstruction-loader .r4 { animation: artifact-loader-r4 10s infinite; }
.artifact-reconstruction-loader .r3 { animation: artifact-loader-r3 10s infinite; }
.artifact-reconstruction-loader .r2 { animation: artifact-loader-r2 10s infinite; }
.artifact-reconstruction-loader .r1 { animation: artifact-loader-r1 10s infinite; }
@keyframes artifact-loader-r9 { 0%, 20% { opacity: 0; } 21.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 23%, 94% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 95.5% { opacity: 1; fill: var(--artifact-loader-flash); } 97%, 100% { opacity: 0; } }
@keyframes artifact-loader-r8 { 0%, 22% { opacity: 0; } 23.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 25%, 92% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 93.5% { opacity: 1; fill: var(--artifact-loader-flash); } 95%, 100% { opacity: 0; } }
@keyframes artifact-loader-r7 { 0%, 24% { opacity: 0; } 25.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 27%, 90% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 91.5% { opacity: 1; fill: var(--artifact-loader-flash); } 93%, 100% { opacity: 0; } }
@keyframes artifact-loader-r6 { 0%, 26% { opacity: 0; } 27.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 29%, 88% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 89.5% { opacity: 1; fill: var(--artifact-loader-flash); } 91%, 100% { opacity: 0; } }
@keyframes artifact-loader-r5 { 0%, 28% { opacity: 0; } 29.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 31%, 86% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 87.5% { opacity: 1; fill: var(--artifact-loader-flash); } 89%, 100% { opacity: 0; } }
@keyframes artifact-loader-r4 { 0%, 30% { opacity: 0; } 31.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 33%, 84% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 85.5% { opacity: 1; fill: var(--artifact-loader-flash); } 87%, 100% { opacity: 0; } }
@keyframes artifact-loader-r3 { 0%, 32% { opacity: 0; } 33.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 35%, 82% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 83.5% { opacity: 1; fill: var(--artifact-loader-flash); } 85%, 100% { opacity: 0; } }
@keyframes artifact-loader-r2 { 0%, 34% { opacity: 0; } 35.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 37%, 80% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 81.5% { opacity: 1; fill: var(--artifact-loader-flash); } 83%, 100% { opacity: 0; } }
@keyframes artifact-loader-r1 { 0%, 36% { opacity: 0; } 37.5% { opacity: 1; fill: var(--artifact-loader-flash); text-shadow: var(--artifact-loader-shadow-flash); } 39%, 78% { opacity: 1; fill: var(--artifact-loader-neon); text-shadow: var(--artifact-loader-shadow); } 79.5% { opacity: 1; fill: var(--artifact-loader-flash); } 81%, 100% { opacity: 0; } }
.artifact-reconstruction-loader .line-stagger-1 { animation: artifact-loader-title 10s infinite; }
@keyframes artifact-loader-title { 0%, 5% { opacity: 0; } 6%, 95% { opacity: 1; } 100% { opacity: 0; } }
.artifact-reconstruction-loader .cursor { animation: artifact-loader-blink 1s infinite; }
@keyframes artifact-loader-blink { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
.artifact-reconstruction-loader .grid-line { font-weight: 700; }
.artifact-reconstruction-loader .gl1 { animation: artifact-loader-radar 2.5s infinite linear 0s; }
.artifact-reconstruction-loader .gl2 { animation: artifact-loader-radar 2.5s infinite linear 0.4s; }
.artifact-reconstruction-loader .gl3 { animation: artifact-loader-radar 2.5s infinite linear 0.8s; }
.artifact-reconstruction-loader .gl4 { animation: artifact-loader-radar 2.5s infinite linear 1.2s; }
.artifact-reconstruction-loader .gl5 { animation: artifact-loader-radar 2.5s infinite linear 1.6s; }
.artifact-reconstruction-loader .gl6 { animation: artifact-loader-radar 2.5s infinite linear 2s; }
@keyframes artifact-loader-radar { 0%, 100% { opacity: 0.2; fill: var(--artifact-loader-radar-low); text-shadow: none; } 50% { opacity: 1; fill: var(--artifact-loader-bright); text-shadow: var(--artifact-loader-shadow-bright); } }
.artifact-reconstruction-loader .geo { font-size: 14px; font-weight: 700; opacity: 0.8; }
.artifact-reconstruction-loader .float1 { animation: artifact-loader-hover1 8s ease-in-out infinite; transform-origin: 100px 330px; }
.artifact-reconstruction-loader .float2 { animation: artifact-loader-hover2 6s ease-in-out infinite; transform-origin: 1100px 280px; }
@keyframes artifact-loader-hover1 { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-25px) rotate(12deg); } }
@keyframes artifact-loader-hover2 { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(20px) rotate(-15deg); } }
.artifact-reconstruction-loader .stars { animation: artifact-loader-twinkle 5s infinite; }
@keyframes artifact-loader-twinkle { 0%, 100% { opacity: 0.2; } 50% { opacity: 0.7; fill: var(--artifact-loader-bright); text-shadow: var(--artifact-loader-shadow-bright); } }
.artifact-reconstruction-loader[data-animation-state="static"] * {
	animation: none !important;
}
.artifact-reconstruction-loader[data-animation-state="static"] .line-stagger-1,
.artifact-reconstruction-loader[data-animation-state="static"] .stars,
.artifact-reconstruction-loader[data-animation-state="static"] .grid-line,
.artifact-reconstruction-loader[data-animation-state="static"] .geo,
.artifact-reconstruction-loader[data-animation-state="static"] .reconstruction-row {
	opacity: 1;
	fill: var(--artifact-loader-neon);
	text-shadow: var(--artifact-loader-shadow);
}
`;

export function ArtifactEmptyState({ className }: ArtifactEmptyStateProps) {
	const prefersReducedMotion = usePrefersReducedMotion();

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
			<div className="h-full w-full max-w-[700px] max-h-[400px]">
				<svg
					aria-hidden="true"
					data-testid="artifact-empty-state-visual"
					data-animation-state={prefersReducedMotion ? "static" : "running"}
					xmlns="http://www.w3.org/2000/svg"
					viewBox="0 0 1200 800"
					width="100%"
					height="100%"
					className="artifact-reconstruction-loader block h-full w-full select-none font-mono"
				>
					<style>{LOADER_CSS}</style>

					<g className="stars dim-glow" fontSize="14" fontWeight="700">
						{STAR_POINTS.map((point) => (
							<text key={`${point.x}-${point.y}`} x={point.x} y={point.y}>
								{point.text}
							</text>
						))}
					</g>

					<g className="grid neon-glow" textAnchor="middle">
						{GRID_LINES.map((gridLine) => (
							<text
								key={gridLine.className}
								x={gridLine.x}
								y={gridLine.y}
								fontSize={gridLine.size}
								className={gridLine.className}
								xmlSpace="preserve"
							>
								{gridLine.text}
							</text>
						))}
					</g>

					<text
						x="80"
						y="380"
						className="geo float1 neon-glow"
						xmlSpace="preserve"
					>
						<tspan x="80" dy="0">
							{"   *"}
						</tspan>
						<tspan x="80" dy="16">
							{" /   \\"}
						</tspan>
						<tspan x="80" dy="16">
							{"* *"}
						</tspan>
						<tspan x="80" dy="16">
							{" \\   /"}
						</tspan>
						<tspan x="80" dy="16">
							{"   *"}
						</tspan>
					</text>

					<text
						x="1100"
						y="280"
						className="geo float2 neon-glow"
						xmlSpace="preserve"
					>
						<tspan x="1100" dy="0">
							{"  /^\\"}
						</tspan>
						<tspan x="1100" dy="16">
							{" / | \\"}
						</tspan>
						<tspan x="1100" dy="16">
							{"<--+-->"}
						</tspan>
						<tspan x="1100" dy="16">
							{" \\ | /"}
						</tspan>
						<tspan x="1100" dy="16">
							{"  \\v/"}
						</tspan>
					</text>

					<g className="neon-glow" fontSize="28" fontWeight="700">
						<text x="50" y="80" className="line-stagger-1">
							CREATING ARTIFACTS
							<tspan className="cursor">_</tspan>
						</text>
					</g>

					<text
						className="neon-glow"
						fontSize="42"
						fontWeight="700"
						xmlSpace="preserve"
						textAnchor="middle"
					>
						{GAMEPAD_ROWS.map((row) => (
							<tspan
								key={row.className}
								x="600"
								y={row.y}
								className={row.className}
							>
								{row.text}
							</tspan>
						))}
					</text>
				</svg>
			</div>
		</output>
	);
}
