import { AnimatePresence, motion } from "framer-motion";
import { Activity } from "lucide-react";
import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAttention } from "@/hooks/useAttention";
import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { useRuns } from "@/hooks/useRuns";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Run } from "@/types/runs";

type FilterType = "all" | "running" | "attention";

const FILTERS: readonly { readonly key: FilterType; readonly label: string }[] =
	[
		{ key: "all", label: "All" },
		{ key: "running", label: "Running" },
		{ key: "attention", label: "Attention" },
	];

const PAGE_SIZE = 25;

function StatusDot({ status }: { status: Run["status"] }) {
	if (status === "running") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-accent-amber animate-status-pulse"
				aria-label="Running"
			/>
		);
	}
	if (status === "failed") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-failure"
				aria-label="Failed"
			/>
		);
	}
	if (status === "waiting") {
		return (
			<span
				role="img"
				className="inline-block h-[6px] w-[6px] rounded-full bg-accent-amber"
				aria-label="Waiting"
			/>
		);
	}
	return (
		<span
			role="img"
			className="inline-block h-[6px] w-[6px] rounded-full bg-fg-ghost"
			aria-label={status}
		/>
	);
}

const feedItemVariants = {
	initial: { opacity: 0, y: 8 },
	animate: { opacity: 1, y: 0 },
};

const feedItemTransition = {
	duration: 0.2,
	ease: [0.25, 0.1, 0.25, 1.0],
};

const feedItemVariantsReduced = {
	initial: { opacity: 1, y: 0 },
	animate: { opacity: 1, y: 0 },
};

function FeedEntry({
	run,
	onClick,
	reducedMotion,
}: {
	run: Run;
	onClick: () => void;
	reducedMotion: boolean;
}) {
	const isWaiting = run.status === "waiting";

	return (
		<motion.button
			type="button"
			onClick={onClick}
			variants={reducedMotion ? feedItemVariantsReduced : feedItemVariants}
			transition={reducedMotion ? { duration: 0 } : feedItemTransition}
			className={cn(
				"flex w-full items-center gap-3 px-3 py-2.5 text-left rounded-[var(--radius)]",
				"transition-colors duration-150",
				"hover:bg-surface",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
				isWaiting && "bg-accent-ghost",
			)}
		>
			<StatusDot status={run.status} />

			<span
				className="shrink-0 type-secondary tabular-nums text-fg-ghost"
				style={{ fontVariantNumeric: "tabular-nums" }}
			>
				{formatRelativeTime(run.startedAt)}
			</span>

			<span className="truncate type-body font-medium text-fg">
				{run.command || run.featureName || run.featureId}
			</span>

			<span className="truncate type-secondary text-fg-muted">
				{run.projectName}
			</span>

			{isWaiting && (
				<span className="ml-auto shrink-0 type-caption text-accent-amber">
					waiting
				</span>
			)}
		</motion.button>
	);
}

export function HomePage() {
	const navigate = useNavigate();
	const reducedMotion = usePrefersReducedMotion();
	const [filter, setFilter] = useState<FilterType>("all");
	const [pageSize, setPageSize] = useState(PAGE_SIZE);

	const {
		runs: allRuns,
		total: allTotal,
		isLoading: allLoading,
	} = useRuns({ limit: pageSize });

	const {
		runs: runningRuns,
		total: runningTotal,
		isLoading: runningLoading,
	} = useRuns({ status: "running", limit: pageSize });

	const { data: attentionData, isLoading: attentionLoading } = useAttention();

	const getDisplayData = useCallback((): {
		runs: readonly Run[];
		total: number;
		isLoading: boolean;
	} => {
		switch (filter) {
			case "running":
				return {
					runs: runningRuns,
					total: runningTotal,
					isLoading: runningLoading,
				};
			case "attention": {
				const attentionRuns = attentionData
					? [...attentionData.waiting, ...attentionData.failed]
					: [];
				return {
					runs: attentionRuns,
					total: attentionRuns.length,
					isLoading: attentionLoading,
				};
			}
			default:
				return { runs: allRuns, total: allTotal, isLoading: allLoading };
		}
	}, [
		filter,
		allRuns,
		allTotal,
		allLoading,
		runningRuns,
		runningTotal,
		runningLoading,
		attentionData,
		attentionLoading,
	]);

	const { runs, total, isLoading } = getDisplayData();
	const hasMore = filter !== "attention" && runs.length < total;

	const handleLoadEarlier = useCallback(() => {
		setPageSize((prev) => prev + PAGE_SIZE);
	}, []);

	const handleRunClick = useCallback(
		(runId: string) => {
			navigate(`/runs/${runId}`);
		},
		[navigate],
	);

	return (
		<div className="h-full overflow-y-auto px-4 py-6 md:px-6">
			<div className="mx-auto max-w-[640px]">
				<div className="flex items-center gap-4 mb-4 px-3">
					{FILTERS.map((f) => (
						<button
							key={f.key}
							type="button"
							onClick={() => {
								setFilter(f.key);
								setPageSize(PAGE_SIZE);
							}}
							className={cn(
								"type-caption transition-colors duration-150",
								filter === f.key
									? "text-fg"
									: "text-fg-ghost hover:text-fg-muted",
							)}
						>
							{f.label}
						</button>
					))}
				</div>

				{isLoading && runs.length === 0 ? (
					<div className="flex items-center justify-center py-16">
						<span className="type-body text-fg-ghost">Loading...</span>
					</div>
				) : runs.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-24 text-center">
						<Activity
							className="h-5 w-5 text-fg-ghost mb-4"
							strokeWidth={1.5}
						/>
						<p className="type-body text-fg-ghost mb-1">No activity yet.</p>
						<p className="type-secondary text-fg-ghost mb-4">
							Runs will appear here once you start your first workflow.
						</p>
						<a
							href="https://rp1.run/getting-started/first-workflow/"
							target="_blank"
							rel="noopener noreferrer"
							className="type-secondary text-fg-muted transition-colors duration-150 hover:text-fg underline underline-offset-2"
						>
							Get started with your first workflow
						</a>
					</div>
				) : (
					<>
						<AnimatePresence initial={false}>
							<motion.div
								className="flex flex-col"
								initial="initial"
								animate="animate"
							>
								{runs.map((run) => (
									<FeedEntry
										key={run.id}
										run={run}
										onClick={() => handleRunClick(run.id)}
										reducedMotion={reducedMotion}
									/>
								))}
							</motion.div>
						</AnimatePresence>

						{hasMore && (
							<div className="flex justify-center py-4">
								<button
									type="button"
									onClick={handleLoadEarlier}
									className="type-secondary text-fg-ghost hover:text-fg-muted transition-colors duration-150"
								>
									Earlier
								</button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
