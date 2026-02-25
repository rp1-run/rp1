import { motion } from "framer-motion";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
	type VirtualizedListRef as KeyboardNavListRef,
	useKeyboardNav,
} from "@/hooks/useKeyboardNav";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import {
	staggerContainer,
	staggerContainerReduced,
	staggerItem,
	staggerItemReduced,
} from "@/lib/motion-config";
import { cn } from "@/lib/utils";
import type { Run } from "@/types/runs";
import { RunCard } from "./RunCard";
import { VirtualizedList, type VirtualizedListRef } from "./VirtualizedList";

type AccentColor = "peach" | "mauve" | "red" | "blue";

const accentColors: Record<AccentColor, string> = {
	peach: "text-status-waiting",
	mauve: "text-status-needs-review",
	red: "text-status-failed",
	blue: "text-status-running",
};

const accentBgColors: Record<AccentColor, string> = {
	peach: "bg-status-waiting/10",
	mauve: "bg-status-needs-review/10",
	red: "bg-status-failed/10",
	blue: "bg-status-running/10",
};

const RUN_CARD_HEIGHT = 72;
const VIRTUALIZATION_THRESHOLD = 10;

export interface AttentionSectionProps {
	title: string;
	icon: LucideIcon;
	runs: readonly Run[];
	defaultExpanded?: boolean;
	maxVisible?: number;
	emptyMessage?: string;
	accentColor: AccentColor;
	selectedIndex?: number | null;
	className?: string;
}

export function AttentionSection({
	title,
	icon: Icon,
	runs,
	defaultExpanded = true,
	maxVisible = 5,
	emptyMessage = "No items",
	accentColor,
	selectedIndex: externalSelectedIndex,
	className,
}: AttentionSectionProps) {
	const [isExpanded, setIsExpanded] = useState(
		defaultExpanded && runs.length > 0,
	);
	const [showAll, setShowAll] = useState(false);

	// Auto-expand when data arrives (handles async loading)
	useEffect(() => {
		if (runs.length > 0 && defaultExpanded) {
			setIsExpanded(true);
		}
	}, [runs.length, defaultExpanded]);

	// Auto-expand when keyboard navigation enters this section
	useEffect(() => {
		if (externalSelectedIndex != null && externalSelectedIndex >= 0) {
			setIsExpanded(true);
		}
	}, [externalSelectedIndex]);
	const navigate = useNavigate();
	const virtualizedListRef = useRef<VirtualizedListRef>(null);
	const reducedMotion = usePrefersReducedMotion();

	const hasItems = runs.length > 0;
	const visibleRuns = showAll ? runs : runs.slice(0, maxVisible);
	const hiddenCount = runs.length - maxVisible;
	const hasMore = runs.length > maxVisible;
	const useVirtualization = showAll && runs.length > VIRTUALIZATION_THRESHOLD;

	const handleRunClick = useCallback(
		(run: Run) => {
			navigate(`/runs/${run.id}`);
		},
		[navigate],
	);

	// Use external selectedIndex if provided
	const { selectedIndex: internalSelectedIndex } = useKeyboardNav({
		items: visibleRuns,
		onSelect: handleRunClick,
		onDrillIn: handleRunClick,
		enabled: hasItems && isExpanded && externalSelectedIndex === undefined,
		listRef: virtualizedListRef as React.RefObject<KeyboardNavListRef | null>,
	});

	const selectedIndex = externalSelectedIndex ?? internalSelectedIndex;

	const handleToggleExpand = () => {
		setIsExpanded((prev) => !prev);
	};

	const handleShowMore = () => {
		setShowAll(true);
	};

	const handleShowLess = () => {
		setShowAll(false);
	};

	const renderRunItem = useCallback(
		(run: Run, _index: number, isSelected: boolean) => (
			<RunCard
				run={run}
				onClick={() => handleRunClick(run)}
				showStatus={false}
				selected={isSelected}
			/>
		),
		[handleRunClick],
	);

	const getRunKey = useCallback((run: Run) => run.id, []);

	return (
		<section
			className={cn(
				"rounded-lg border border-border overflow-hidden transition-all duration-200",
				accentBgColors[accentColor],
				className,
			)}
			aria-labelledby={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
		>
			<button
				type="button"
				onClick={handleToggleExpand}
				className={cn(
					"flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
					"hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				)}
				aria-expanded={isExpanded}
				aria-controls={`section-content-${title.toLowerCase().replace(/\s+/g, "-")}`}
			>
				<span className={cn("transition-transform", isExpanded && "rotate-0")}>
					{isExpanded ? (
						<ChevronDown className="h-4 w-4 text-muted-foreground" />
					) : (
						<ChevronRight className="h-4 w-4 text-muted-foreground" />
					)}
				</span>

				<Icon
					className={cn("h-5 w-5", accentColors[accentColor])}
					aria-hidden="true"
				/>

				<h2
					id={`section-${title.toLowerCase().replace(/\s+/g, "-")}`}
					className="flex-1 font-medium text-foreground"
				>
					{title}
				</h2>

				<span
					className={cn(
						"rounded-full px-2.5 py-0.5 text-sm font-medium",
						hasItems ? accentColors[accentColor] : "text-muted-foreground",
						hasItems ? accentBgColors[accentColor] : "bg-muted/50",
					)}
				>
					{runs.length}
				</span>
			</button>

			<div
				id={`section-content-${title.toLowerCase().replace(/\s+/g, "-")}`}
				className={cn(
					"overflow-hidden transition-all duration-200 ease-in-out",
					isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
				)}
			>
				<div className="p-4 pt-0 space-y-2">
					{hasItems ? (
						<>
							{useVirtualization ? (
								<VirtualizedList
									ref={virtualizedListRef}
									items={runs}
									estimateSize={RUN_CARD_HEIGHT}
									overscan={3}
									renderItem={renderRunItem}
									getItemKey={getRunKey}
									onSelect={handleRunClick}
									selectedIndex={selectedIndex}
									className="h-[400px] rounded-lg"
									itemClassName="px-1 py-0.5"
									aria-label={`${title} runs`}
								/>
							) : (
								<motion.ul
									className="divide-y divide-border"
									variants={
										reducedMotion ? staggerContainerReduced : staggerContainer
									}
									initial="initial"
									animate="animate"
								>
									{visibleRuns.map((run, index) => (
										<motion.li
											key={run.id}
											variants={
												reducedMotion ? staggerItemReduced : staggerItem
											}
										>
											<RunCard
												run={run}
												onClick={() => handleRunClick(run)}
												showStatus={false}
												selected={selectedIndex === index}
											/>
										</motion.li>
									))}
								</motion.ul>
							)}

							{hasMore && (
								<div className="pt-2">
									{!showAll ? (
										<button
											type="button"
											onClick={handleShowMore}
											className={cn(
												"w-full rounded-md py-2 text-sm font-medium transition-colors",
												"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												accentColors[accentColor],
											)}
										>
											Show more ({hiddenCount} hidden)
										</button>
									) : (
										<button
											type="button"
											onClick={handleShowLess}
											className={cn(
												"w-full rounded-md py-2 text-sm font-medium transition-colors",
												"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
												"text-muted-foreground",
											)}
										>
											Show less
										</button>
									)}
								</div>
							)}
						</>
					) : (
						<p className="py-4 text-center text-sm text-muted-foreground">
							{emptyMessage}
						</p>
					)}
				</div>
			</div>
		</section>
	);
}
