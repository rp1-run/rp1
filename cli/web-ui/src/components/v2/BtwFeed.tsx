import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare } from "lucide-react";
import { useMemo } from "react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { RunEvent } from "@/types/runs";
import { Collapsible } from "./Collapsible";

export interface BtwFeedProps {
	events: readonly RunEvent[];
	className?: string;
}

const entryVariants = {
	initial: { opacity: 0, y: 6 },
	animate: { opacity: 1, y: 0 },
};

const entryVariantsReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
};

const entryTransition = {
	duration: 0.2,
	ease: "easeOut" as const,
};

const entryTransitionReduced = {
	duration: 0,
};

export function BtwFeed({ events, className }: BtwFeedProps) {
	const prefersReducedMotion = usePrefersReducedMotion();

	const btwEvents = useMemo(
		() =>
			events
				.filter((e) => e.type === "btw_update")
				.sort(
					(a, b) =>
						new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
				),
		[events],
	);

	if (btwEvents.length === 0) {
		return null;
	}

	const variants = prefersReducedMotion ? entryVariantsReduced : entryVariants;
	const transition = prefersReducedMotion
		? entryTransitionReduced
		: entryTransition;

	return (
		<Collapsible
			title="Agent Insights"
			defaultExpanded
			icon={
				<MessageSquare
					className="h-4 w-4 text-accent-foreground"
					aria-hidden="true"
				/>
			}
			badge={
				<span className="text-sm text-muted-foreground">
					({btwEvents.length})
				</span>
			}
			className={className}
		>
			<div className="border-t border-border max-h-[300px] overflow-y-auto">
				<ul className="divide-y divide-border">
					<AnimatePresence initial={false}>
						{btwEvents.map((event) => (
							<motion.li
								key={event.id}
								variants={variants}
								initial="initial"
								animate="animate"
								transition={transition}
								className="flex items-start gap-3 p-3 text-sm"
							>
								<MessageSquare
									className="h-4 w-4 mt-0.5 shrink-0 text-accent-foreground"
									aria-hidden="true"
								/>
								<p className={cn("min-w-0 flex-1 text-foreground")}>
									{event.message}
								</p>
								<time
									dateTime={event.timestamp}
									className="shrink-0 text-xs text-muted-foreground"
								>
									{formatRelativeTime(event.timestamp)}
								</time>
							</motion.li>
						))}
					</AnimatePresence>
				</ul>
			</div>
		</Collapsible>
	);
}
