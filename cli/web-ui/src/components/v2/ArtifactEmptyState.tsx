import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";

export interface ArtifactEmptyStateProps {
	className?: string;
}

const LOADER_CSS = `
.artifact-brand-loader {
	--artifact-loader-accent: #23d188;
	--artifact-loader-secondary: #ffb000;
	--artifact-loader-glow: rgba(35, 209, 136, 0.2);
	--artifact-loader-label: #0f1113;
}
html.dark .artifact-brand-loader {
	--artifact-loader-accent: #23d188;
	--artifact-loader-secondary: #ffb000;
	--artifact-loader-glow: rgba(35, 209, 136, 0.22);
	--artifact-loader-label: #f6f4ef;
}
.artifact-brand-loader .brand-halo {
	background:
		radial-gradient(circle, var(--artifact-loader-glow) 0%, transparent 62%),
		linear-gradient(90deg, transparent, rgba(255, 176, 0, 0.18), transparent);
	animation: artifact-loader-halo 4s ease-in-out infinite;
}
.artifact-brand-loader .brand-card {
	animation: artifact-loader-float 5s ease-in-out infinite;
	filter: drop-shadow(0 18px 32px rgba(15, 23, 42, 0.22));
}
.artifact-brand-loader .scan-line {
	background: linear-gradient(90deg, transparent, var(--artifact-loader-secondary), transparent);
	animation: artifact-loader-scan 2.8s linear infinite;
	opacity: 0.55;
}
.artifact-brand-loader .progress-label {
	color: var(--artifact-loader-label);
	letter-spacing: 0;
}
.artifact-brand-loader .cursor {
	color: var(--artifact-loader-accent);
	animation: artifact-loader-blink 1s step-end infinite;
}
@keyframes artifact-loader-halo {
	0%, 100% { opacity: 0.7; transform: scale(0.96); }
	50% { opacity: 1; transform: scale(1.03); }
}
@keyframes artifact-loader-float {
	0%, 100% { transform: translateY(0); }
	50% { transform: translateY(-10px); }
}
@keyframes artifact-loader-scan {
	0% { transform: translateX(-65%); }
	100% { transform: translateX(65%); }
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
.artifact-brand-loader[data-animation-state="static"] .scan-line {
	transform: none;
}
`;

export function ArtifactEmptyState({ className }: ArtifactEmptyStateProps) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const { theme } = useTheme();
	const brandSrc =
		theme === "dark"
			? "/rp1-empty-state-light.svg"
			: "/rp1-empty-state-dark.svg";

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
				<span
					aria-hidden="true"
					className="scan-line absolute top-1/2 h-px w-[70%]"
				/>
				<img
					src={brandSrc}
					alt=""
					aria-hidden="true"
					className="brand-card relative z-10 w-[min(72%,22rem)] select-none"
					draggable={false}
				/>
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
