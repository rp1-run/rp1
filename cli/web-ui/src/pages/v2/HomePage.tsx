import { AlertCircle, Eye, Hand, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AttentionSection } from "@/components/v2/AttentionSection";
import { useAttention } from "@/hooks/useAttention";
import { cn } from "@/lib/utils";
import type { Run } from "@/types/runs";

function LoadingSkeleton() {
	return (
		<div className="space-y-4">
			{[1, 2, 3, 4].map((i) => (
				<div
					key={i}
					className="animate-pulse rounded-lg border border-border bg-muted/20 p-4"
				>
					<div className="flex items-center gap-3">
						<div className="h-5 w-5 rounded bg-muted" />
						<div className="h-5 w-32 rounded bg-muted" />
						<div className="ml-auto h-5 w-8 rounded-full bg-muted" />
					</div>
				</div>
			))}
		</div>
	);
}

function EmptyState() {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-border bg-muted/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-muted/50 p-4">
				<Eye className="h-8 w-8 text-muted-foreground" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				Nothing needs your attention
			</h2>
			<p className="text-center text-sm text-muted-foreground">
				All your agent runs are proceeding smoothly. Check back later or start a
				new run.
			</p>
		</div>
	);
}

function ErrorState({ error, onRetry }: { error: Error; onRetry: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center rounded-lg border border-status-failed/30 bg-status-failed/10 px-8 py-16">
			<div className="mb-4 rounded-full bg-status-failed/20 p-4">
				<AlertCircle className="h-8 w-8 text-status-failed" />
			</div>
			<h2 className="mb-2 text-lg font-medium text-foreground">
				Failed to load dashboard
			</h2>
			<p className="mb-4 text-center text-sm text-muted-foreground">
				{error.message}
			</p>
			<button
				type="button"
				onClick={onRetry}
				className="inline-flex items-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/80"
			>
				<RefreshCw className="h-4 w-4" />
				Try again
			</button>
		</div>
	);
}

export function HomePage() {
	const { data, isLoading, error, refetch } = useAttention();
	const navigate = useNavigate();
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

	// Combine all runs into a flat list for keyboard navigation
	const allRuns = useMemo(() => {
		if (!data) return [];
		return [
			...data.waiting,
			...data.needsReview,
			...data.failed,
			...data.running,
		];
	}, [data]);

	const handleRunClick = useCallback(
		(run: Run) => {
			navigate(`/runs/${run.id}`);
		},
		[navigate],
	);

	// Document-level keyboard navigation
	useEffect(() => {
		if (allRuns.length === 0) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			const target = event.target as HTMLElement;
			const isTextInput =
				target.tagName === "INPUT" ||
				target.tagName === "TEXTAREA" ||
				target.isContentEditable;

			if (isTextInput) return;

			switch (event.key) {
				case "j":
				case "ArrowDown":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? 0 : Math.min(prev + 1, allRuns.length - 1),
					);
					break;
				case "k":
				case "ArrowUp":
					event.preventDefault();
					setSelectedIndex((prev) =>
						prev === null ? allRuns.length - 1 : Math.max(prev - 1, 0),
					);
					break;
				case "l":
				case "ArrowRight":
				case "Enter":
					if (selectedIndex !== null && allRuns[selectedIndex]) {
						event.preventDefault();
						handleRunClick(allRuns[selectedIndex]);
					}
					break;
			}
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [allRuns, selectedIndex, handleRunClick]);

	// Calculate which section the selected index falls into
	const getSelectionForSection = useCallback(
		(sectionRuns: readonly Run[], sectionStart: number) => {
			if (selectedIndex === null) return null;
			const localIndex = selectedIndex - sectionStart;
			if (localIndex >= 0 && localIndex < sectionRuns.length) {
				return localIndex;
			}
			return null;
		},
		[selectedIndex],
	);

	const isEmpty =
		data &&
		data.waiting.length === 0 &&
		data.needsReview.length === 0 &&
		data.failed.length === 0 &&
		data.running.length === 0;

	return (
		<div className="space-y-6">
			<header className="flex items-center justify-between">
				<div>
					<h1 className="text-2xl font-semibold text-foreground">Now</h1>
					<p className="mt-1 text-sm text-muted-foreground">
						What needs your attention across all projects
					</p>
				</div>

				<button
					type="button"
					onClick={refetch}
					disabled={isLoading}
					className={cn(
						"inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium transition-colors",
						"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						"disabled:cursor-not-allowed disabled:opacity-50",
					)}
					aria-label="Refresh dashboard"
				>
					<RefreshCw
						className={cn("h-4 w-4", isLoading && "animate-spin")}
						aria-hidden="true"
					/>
					<span className="sr-only sm:not-sr-only">Refresh</span>
				</button>
			</header>

			{isLoading && !data ? (
				<LoadingSkeleton />
			) : error ? (
				<ErrorState error={error} onRetry={refetch} />
			) : isEmpty ? (
				<EmptyState />
			) : (
				data && (
					<>
						<div className="space-y-4">
							<AttentionSection
								title="Waiting for you"
								icon={Hand}
								runs={data.waiting}
								defaultExpanded={true}
								accentColor="peach"
								emptyMessage="No runs waiting for input"
								selectedIndex={getSelectionForSection(data.waiting, 0)}
							/>

							<AttentionSection
								title="Needs review"
								icon={Eye}
								runs={data.needsReview}
								defaultExpanded={true}
								accentColor="mauve"
								emptyMessage="No runs need review"
								selectedIndex={getSelectionForSection(
									data.needsReview,
									data.waiting.length,
								)}
							/>

							<AttentionSection
								title="Failed"
								icon={AlertCircle}
								runs={data.failed}
								defaultExpanded={true}
								accentColor="red"
								emptyMessage="No failed runs"
								selectedIndex={getSelectionForSection(
									data.failed,
									data.waiting.length + data.needsReview.length,
								)}
							/>

							<AttentionSection
								title="Running"
								icon={Loader2}
								runs={data.running}
								defaultExpanded={false}
								accentColor="blue"
								emptyMessage="No runs currently active"
								selectedIndex={getSelectionForSection(
									data.running,
									data.waiting.length +
										data.needsReview.length +
										data.failed.length,
								)}
							/>
						</div>

						<p className="text-xs text-muted-foreground">
							<kbd className="rounded bg-muted px-1.5 py-0.5">j</kbd>/
							<kbd className="rounded bg-muted px-1.5 py-0.5">k</kbd> navigate,{" "}
							<kbd className="rounded bg-muted px-1.5 py-0.5">l</kbd> open run
						</p>
					</>
				)
			)}
		</div>
	);
}
