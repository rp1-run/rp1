import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type {
	CompletedTask,
	FeatureStatus,
	StatusResponse,
	StatusUpdate,
} from "../server/routes/api";

const POLLING_INTERVAL = 5_000;

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);
	const diffDays = Math.floor(diffHours / 24);

	if (diffSeconds < 60) {
		return "just now";
	}
	if (diffMinutes < 60) {
		return `${diffMinutes} min ago`;
	}
	if (diffHours < 24) {
		return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
	}
	return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

interface FeatureBadgeProps {
	feature: string;
}

function FeatureBadge({ feature }: FeatureBadgeProps) {
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-terminal-mauve/10 text-terminal-mauve border border-terminal-mauve/20">
			{feature}
		</span>
	);
}

interface TaskItemProps {
	update: StatusUpdate;
	isLatest: boolean;
}

function TaskItem({ update, isLatest }: TaskItemProps) {
	return (
		<div
			className={`flex items-start gap-2 py-1.5 ${isLatest ? "" : "opacity-60"}`}
		>
			<div className="flex-1 min-w-0">
				<span className="text-sm font-medium">{update.task || "feature"}</span>
				{update.message && (
					<p className="text-xs text-muted-foreground mt-0.5 italic">
						"{update.message}"
					</p>
				)}
			</div>
			<span className="text-xs text-muted-foreground whitespace-nowrap">
				{formatRelativeTime(update.createdAt)}
			</span>
		</div>
	);
}

interface FeatureGroupCardProps {
	feature: FeatureStatus;
}

function FeatureGroupCard({ feature }: FeatureGroupCardProps) {
	const [isExpanded, setIsExpanded] = useState(true);

	// Get unique tasks from updates, keeping the latest status for each task
	const taskMap = new Map<string, StatusUpdate>();
	for (const update of feature.updates) {
		const taskKey = update.task || "_feature_";
		const existing = taskMap.get(taskKey);
		// Keep the most recent update for each task
		if (
			!existing ||
			new Date(update.createdAt) > new Date(existing.createdAt)
		) {
			taskMap.set(taskKey, update);
		}
	}
	const uniqueTasks = Array.from(taskMap.values()).sort(
		(a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
	);

	const hasMultipleTasks = uniqueTasks.length > 1;

	return (
		<div className="rounded-lg border bg-card overflow-hidden mb-4">
			{/* Feature Header */}
			<div className="bg-muted/30 px-4 py-3 border-b">
				<div className="flex items-center justify-between gap-4">
					<div className="flex items-center gap-2 min-w-0">
						{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers */}
						<span
							className="animate-pulse-gentle text-terminal-green text-[0.75rem] leading-none"
							title="Active"
							aria-label="Status: Active"
						>
							&#9679;
						</span>
						<span className="font-semibold truncate">{feature.feature}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-muted-foreground whitespace-nowrap">
							{feature.status.replace("_", " ")}
						</span>
						{hasMultipleTasks && (
							<button
								type="button"
								onClick={() => setIsExpanded(!isExpanded)}
								className="p-1 rounded hover:bg-muted transition-colors"
								aria-label={isExpanded ? "Collapse tasks" : "Expand tasks"}
							>
								{isExpanded ? (
									<ChevronDown className="h-4 w-4 text-muted-foreground" />
								) : (
									<ChevronRight className="h-4 w-4 text-muted-foreground" />
								)}
							</button>
						)}
					</div>
				</div>
			</div>

			{/* Tasks List */}
			<div className="px-4 py-2">
				{/* Task history (when expanded) */}
				{isExpanded && uniqueTasks.length > 0 && (
					<div className="space-y-1">
						{uniqueTasks.map((update, idx) => (
							<TaskItem key={update.id} update={update} isLatest={idx === 0} />
						))}
					</div>
				)}

				{/* Collapsed summary */}
				{!isExpanded && uniqueTasks.length > 0 && (
					<div className="py-1 text-sm text-muted-foreground">
						{uniqueTasks.length} task{uniqueTasks.length === 1 ? "" : "s"}
					</div>
				)}
			</div>

			{/* Footer with timestamp */}
			<div className="px-4 py-2 bg-muted/20 text-xs text-muted-foreground text-right border-t">
				Last update: {formatRelativeTime(feature.lastUpdate)}
			</div>
		</div>
	);
}

interface CompletedTaskCardProps {
	task: CompletedTask;
}

function CompletedTaskCard({ task }: CompletedTaskCardProps) {
	return (
		<div className="rounded-lg border bg-card p-3 mb-2">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-2 min-w-0">
					{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers */}
					<span
						className="text-muted-foreground mt-0.5"
						title="Completed"
						aria-label="Status: Completed"
					>
						&#10003;
					</span>
					<div className="min-w-0">
						<div className="flex items-center gap-2 flex-wrap">
							<FeatureBadge feature={task.feature} />
							<span className="font-medium text-sm">{task.task}</span>
						</div>
						{task.message && (
							<p className="text-xs text-muted-foreground mt-1 italic">
								"{task.message}"
							</p>
						)}
					</div>
				</div>
				<span className="text-xs text-muted-foreground whitespace-nowrap">
					{formatRelativeTime(task.completedAt)}
				</span>
			</div>
		</div>
	);
}

interface CompletedFeatureCardProps {
	feature: FeatureStatus;
}

function CompletedFeatureCard({ feature }: CompletedFeatureCardProps) {
	return (
		<div className="rounded-lg border bg-card p-3 mb-2">
			<div className="flex items-start justify-between gap-3">
				<div className="flex items-start gap-2 min-w-0">
					{/* biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers */}
					<span
						className="text-muted-foreground mt-0.5"
						title="Completed"
						aria-label="Status: Completed"
					>
						&#10003;
					</span>
					<div className="min-w-0">
						<span className="font-semibold">{feature.feature}</span>
						{feature.message && (
							<p className="text-xs text-muted-foreground mt-1 italic">
								"{feature.message}"
							</p>
						)}
					</div>
				</div>
				<span className="text-xs text-muted-foreground whitespace-nowrap">
					{formatRelativeTime(feature.lastUpdate)}
				</span>
			</div>
		</div>
	);
}

interface CollapsibleSectionProps {
	title: string;
	count: number;
	defaultOpen?: boolean;
	children: React.ReactNode;
}

function CollapsibleSection({
	title,
	count,
	defaultOpen = false,
	children,
}: CollapsibleSectionProps) {
	const [isOpen, setIsOpen] = useState(defaultOpen);

	return (
		<div className="mt-6">
			<button
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className="flex items-center gap-2 w-full text-left mb-3 group"
				aria-expanded={isOpen}
			>
				<span className="text-lg font-semibold">
					{title} ({count})
				</span>
				{isOpen ? (
					<ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
				) : (
					<ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
				)}
			</button>
			{isOpen && <div>{children}</div>}
		</div>
	);
}

export function StatusDashboard() {
	const params = useParams();
	const projectId = params.projectId;
	const { status: wsStatus, onStatusChange } = useWebSocket();

	const [statusData, setStatusData] = useState<StatusResponse | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isRefreshing, setIsRefreshing] = useState(false);
	const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
		null,
	);

	const fetchStatus = useCallback(async () => {
		if (!projectId) {
			setLoading(false);
			return;
		}

		try {
			const response = await fetch(
				`/api/projects/${encodeURIComponent(projectId)}/status`,
			);
			if (!response.ok) {
				if (response.status === 404) {
					throw new Error(`Project not found: ${projectId}`);
				}
				throw new Error(`Failed to fetch status: ${response.statusText}`);
			}
			const data = (await response.json()) as StatusResponse;
			setStatusData(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
			setIsRefreshing(false);
		}
	}, [projectId]);

	useEffect(() => {
		fetchStatus();
	}, [fetchStatus]);

	// Subscribe to status changes via WebSocket provider
	useEffect(() => {
		if (!projectId) {
			return;
		}

		const unsubscribe = onStatusChange((message) => {
			// Only refresh if the status change is for our project
			if (message.projectId === projectId) {
				setIsRefreshing(true);
				fetchStatus();
			}
		});

		return unsubscribe;
	}, [projectId, fetchStatus, onStatusChange]);

	// Fallback polling when WebSocket is not connected
	useEffect(() => {
		// Only poll when WebSocket is not connected
		if (wsStatus === "connected") {
			if (pollingIntervalRef.current) {
				clearInterval(pollingIntervalRef.current);
				pollingIntervalRef.current = null;
			}
			return;
		}

		pollingIntervalRef.current = setInterval(() => {
			setIsRefreshing(true);
			fetchStatus();
		}, POLLING_INTERVAL);

		return () => {
			if (pollingIntervalRef.current) {
				clearInterval(pollingIntervalRef.current);
				pollingIntervalRef.current = null;
			}
		};
	}, [fetchStatus, wsStatus]);

	if (loading) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
				<Loader2 className="h-8 w-8 mb-4 animate-spin" />
				<p className="text-sm">Loading status...</p>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-destructive">
				<AlertCircle className="h-12 w-12 mb-4 opacity-70" />
				<p className="text-lg mb-2">Failed to load status</p>
				<p className="text-sm text-muted-foreground">{error}</p>
			</div>
		);
	}

	if (!statusData) {
		return (
			<div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
				<p className="text-lg">No status data available</p>
			</div>
		);
	}

	const hasActiveFeatures = statusData.active.length > 0;

	// Deduplicate recently completed items by feature name.
	// If a feature appears in both recentlyCompleted (feature-level) and
	// recentlyCompletedTasks (task-level), prefer the one with more detail.
	const seenFeatures = new Set<string>();
	const deduplicatedCompletedFeatures: FeatureStatus[] = [];
	const deduplicatedCompletedTasks: CompletedTask[] = [];

	// First pass: add feature-level completions, tracking seen features
	for (const feature of statusData.recentlyCompleted ?? []) {
		seenFeatures.add(feature.feature);
		deduplicatedCompletedFeatures.push(feature);
	}

	// Second pass: add task-level completions only if feature not already seen
	for (const task of statusData.recentlyCompletedTasks ?? []) {
		if (!seenFeatures.has(task.feature)) {
			deduplicatedCompletedTasks.push(task);
			// Don't add to seenFeatures here - allow multiple tasks from same feature
			// if that feature wasn't in recentlyCompleted
		}
	}

	const hasRecentlyCompletedFeatures = deduplicatedCompletedFeatures.length > 0;
	const hasRecentlyCompletedTasks = deduplicatedCompletedTasks.length > 0;
	const hasAnyRecentlyCompleted =
		hasRecentlyCompletedFeatures || hasRecentlyCompletedTasks;

	return (
		<div className="relative">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<span className="text-terminal-mauve">&gt;</span>
					<h1 className="text-xl font-semibold">
						{statusData.projectName} Status
					</h1>
				</div>
			</div>

			{isRefreshing && (
				<div className="absolute top-0 right-0 flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm rounded-bl border-l border-b z-10">
					<RefreshCw className="h-3 w-3 animate-spin" />
					<span>Refreshing...</span>
				</div>
			)}

			<section>
				<h2 className="text-lg font-semibold mb-3">Active Features</h2>
				{hasActiveFeatures ? (
					<div className="space-y-4">
						{statusData.active.map((feature) => (
							<FeatureGroupCard key={feature.feature} feature={feature} />
						))}
					</div>
				) : (
					<div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
						<p>No active features</p>
						<p className="text-sm mt-1">
							Agent work will appear here when in progress
						</p>
					</div>
				)}
			</section>

			{hasAnyRecentlyCompleted && (
				<CollapsibleSection
					title="Recently Completed"
					count={
						deduplicatedCompletedFeatures.length +
						deduplicatedCompletedTasks.length
					}
					defaultOpen={false}
				>
					{hasRecentlyCompletedFeatures &&
						deduplicatedCompletedFeatures.map((feature) => (
							<CompletedFeatureCard
								key={`feature-${feature.feature}-${feature.lastUpdate}`}
								feature={feature}
							/>
						))}
					{hasRecentlyCompletedTasks &&
						deduplicatedCompletedTasks.map((task) => (
							<CompletedTaskCard
								key={`task-${task.feature}-${task.task}-${task.completedAt}`}
								task={task}
							/>
						))}
				</CollapsibleSection>
			)}
		</div>
	);
}
