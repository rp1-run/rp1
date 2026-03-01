import { motion } from "framer-motion";
import {
	Activity,
	ChevronDown,
	FolderOpen,
	Play,
	Terminal,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyHints, NAV_HINTS_NO_BACK } from "@/components/v2/KeyHints";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useProjects } from "@/hooks/useProjects";
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

function ProjectSelector() {
	const { projects, isLoading } = useProjects();
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		function handleClickOutside(e: MouseEvent) {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	if (isLoading) {
		return (
			<div className="inline-flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-4 py-2 text-sm text-muted-foreground">
				<span className="animate-pulse-gentle">Loading projects...</span>
			</div>
		);
	}

	if (projects.length === 0) {
		return (
			<div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
				No projects registered
			</div>
		);
	}

	return (
		<div className="relative" ref={ref}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className={cn(
					"inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm transition-colors",
					"hover:bg-muted/30 hover:border-[hsl(var(--border-glow))]",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					open && "border-[hsl(var(--border-glow))] bg-muted/30",
				)}
			>
				<FolderOpen className="h-4 w-4 text-muted-foreground" />
				<span className="text-foreground">
					{projects.length} project{projects.length === 1 ? "" : "s"}
				</span>
				<ChevronDown
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground transition-transform duration-200",
						open && "rotate-180",
					)}
				/>
			</button>
			{open && (
				<div className="glass absolute left-1/2 z-50 mt-2 w-64 -translate-x-1/2 overflow-hidden rounded-lg shadow-lg">
					{projects.map((project) => (
						<button
							type="button"
							key={project.id}
							onClick={() => {
								navigate(`/projects/${project.id}`);
								setOpen(false);
							}}
							className={cn(
								"flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors",
								"hover:bg-muted/40",
								!project.available && "opacity-50",
							)}
						>
							<div
								className={cn(
									"h-2 w-2 shrink-0 rounded-full",
									project.available
										? "bg-status-completed"
										: "bg-status-failed",
								)}
							/>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-foreground">
									{project.name}
								</p>
								<p className="truncate text-xs text-muted-foreground">
									{project.runCount} run{project.runCount === 1 ? "" : "s"}
								</p>
							</div>
						</button>
					))}
				</div>
			)}
		</div>
	);
}

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
		<div className="grid h-full grid-rows-[1fr_auto] items-center px-6 pb-6">
			<div className="flex flex-col items-center justify-center gap-10">
				<div className="flex flex-col items-center gap-2">
					<div className="flex items-baseline gap-1">
						<Terminal className="h-5 w-5 text-terminal-green" />
						<span className="font-mono text-3xl font-semibold text-foreground">
							rp1
						</span>
						<span className="animate-blink text-3xl text-terminal-green">
							_
						</span>
					</div>
				</div>

				<div className="flex flex-col items-center gap-6">
					<h1 className="text-2xl font-light text-foreground/80">
						Let's build
					</h1>
					<ProjectSelector />
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
