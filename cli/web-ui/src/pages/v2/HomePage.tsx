import { motion } from "framer-motion";
import { Activity, FolderOpen, Play, Terminal } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyHints, NAV_HINTS_NO_BACK } from "@/components/v2/KeyHints";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
	cardHover,
	cardTap,
	staggerContainer,
	staggerItem,
} from "@/lib/motion-config";
import { cn } from "@/lib/utils";

interface SuggestionCard {
	readonly label: string;
	readonly description: string;
	readonly icon: React.ComponentType<{ className?: string }>;
	readonly path: string;
	readonly accent: string;
	readonly iconColor: string;
}

const SUGGESTIONS: readonly SuggestionCard[] = [
	{
		label: "View Runs",
		description: "Monitor active and recent agent runs",
		icon: Play,
		path: "/runs",
		accent: "hover:border-[hsl(var(--terminal-green))]",
		iconColor: "text-terminal-green",
	},
	{
		label: "Browse Projects",
		description: "Explore registered projects and artifacts",
		icon: FolderOpen,
		path: "/projects",
		accent: "hover:border-[hsl(var(--terminal-mauve))]",
		iconColor: "text-terminal-mauve",
	},
	{
		label: "Recent Activity",
		description: "Review completed runs and results",
		icon: Activity,
		path: "/runs?status=completed",
		accent: "hover:border-[hsl(var(--status-running))]",
		iconColor: "text-status-running",
	},
] as const;

function SuggestionCardComponent({
	card,
	selected,
	onClick,
}: {
	card: SuggestionCard;
	selected: boolean;
	onClick: () => void;
}) {
	const reducedMotion = usePrefersReducedMotion();
	const Icon = card.icon;

	return (
		<motion.button
			type="button"
			onClick={onClick}
			whileHover={reducedMotion ? undefined : cardHover}
			whileTap={reducedMotion ? undefined : cardTap}
			className={cn(
				"group flex flex-col items-center gap-3 rounded-lg border border-border p-6",
				"cursor-pointer backdrop-blur-[0px] text-center",
				"transition-[background-color,border-color,backdrop-filter,box-shadow] duration-200 ease-out",
				"hover:bg-[hsl(var(--bg-surface)_/_0.6)] hover:backdrop-blur-[8px]",
				card.accent,
				selected && "ring-2 ring-primary bg-[hsl(var(--bg-surface)_/_0.4)]",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
			)}
		>
			<div
				className={cn(
					"rounded-full bg-muted/30 p-3 transition-colors",
					"group-hover:bg-muted/50",
				)}
			>
				<Icon className={cn("h-5 w-5", card.iconColor)} />
			</div>
			<div>
				<p className="text-sm font-medium text-foreground">{card.label}</p>
				<p className="mt-1 text-xs text-muted-foreground">{card.description}</p>
			</div>
		</motion.button>
	);
}

export function HomePage() {
	const navigate = useNavigate();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const reducedMotion = usePrefersReducedMotion();

	const handleCardClick = useCallback(
		(path: string) => {
			navigate(path);
		},
		[navigate],
	);

	useEffect(() => {
		const handleKeyDown = (event: KeyboardEvent) => {
			if (document.querySelector('[role="dialog"][data-state="open"]')) return;
			if (document.body.dataset.chordPending) return;

			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			switch (event.key) {
				case "j":
				case "ArrowDown":
				case "ArrowRight":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? 0 : Math.min(prev + 1, SUGGESTIONS.length - 1),
					);
					break;
				case "k":
				case "ArrowUp":
				case "ArrowLeft":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? SUGGESTIONS.length - 1 : Math.max(prev - 1, 0),
					);
					break;
				case "l":
				case "Enter":
					if (selectedIndex !== null && SUGGESTIONS[selectedIndex]) {
						event.preventDefault();
						handleCardClick(SUGGESTIONS[selectedIndex].path);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [selectedIndex, handleCardClick]);

	return (
		<div className="flex h-full flex-col items-center justify-center gap-8 px-6 pb-6">
			<div className="flex flex-col items-center gap-6">
				<div className="flex items-baseline gap-1">
					<Terminal className="h-5 w-5 text-terminal-green" />
					<span className="font-mono text-3xl font-semibold text-foreground">
						rp1
					</span>
					<span className="font-mono text-3xl font-light text-foreground/50">
						arcade
					</span>
					<span className="animate-blink text-3xl text-terminal-green">_</span>
				</div>
			</div>

			<div className="mx-auto w-full max-w-2xl">
				<motion.div
					className="grid w-full grid-cols-1 gap-4 sm:grid-cols-3"
					variants={reducedMotion ? undefined : staggerContainer}
					initial="initial"
					animate="animate"
				>
					{SUGGESTIONS.map((card, index) => (
						<motion.div
							key={card.label}
							variants={reducedMotion ? undefined : staggerItem}
						>
							<SuggestionCardComponent
								card={card}
								selected={selectedIndex === index}
								onClick={() => handleCardClick(card.path)}
							/>
						</motion.div>
					))}
				</motion.div>
				<div className="mt-4 flex justify-center">
					<KeyHints hints={NAV_HINTS_NO_BACK} />
				</div>
			</div>
		</div>
	);
}
