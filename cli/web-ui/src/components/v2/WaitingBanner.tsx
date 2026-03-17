import { motion } from "framer-motion";
import { Hand } from "lucide-react";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";

export interface WaitingBannerProps {
	prompt: string;
	context?: string;
	className?: string;
}

const fadeVariants = {
	hidden: { opacity: 0, y: -8 },
	visible: { opacity: 1, y: 0 },
};

const fadeTransition = {
	duration: 0.25,
	ease: "easeOut" as const,
};

const instantVariants = {
	hidden: { opacity: 1, y: 0 },
	visible: { opacity: 1, y: 0 },
};

const instantTransition = { duration: 0 };

export function WaitingBanner({
	prompt,
	context,
	className,
}: WaitingBannerProps) {
	const prefersReducedMotion = usePrefersReducedMotion();
	const variants = prefersReducedMotion ? instantVariants : fadeVariants;
	const transition = prefersReducedMotion ? instantTransition : fadeTransition;
	const statusLabel = getStatusLabel("waiting");

	return (
		<motion.div
			role="alert"
			aria-label={`${statusLabel}: ${prompt}`}
			variants={variants}
			initial="hidden"
			animate="visible"
			transition={transition}
			className={cn(
				"flex items-start gap-3 rounded-lg border-l-4 border-status-waiting bg-status-waiting/15 px-4 py-3",
				className,
			)}
		>
			<Hand
				className="mt-0.5 h-5 w-5 shrink-0 text-status-waiting"
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<p className="font-medium text-foreground">{prompt}</p>
				{context && (
					<p className="mt-1 text-sm text-muted-foreground">{context}</p>
				)}
			</div>
		</motion.div>
	);
}
