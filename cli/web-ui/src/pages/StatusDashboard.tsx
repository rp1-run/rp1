import {
	AlertCircle,
	ChevronDown,
	ChevronRight,
	Loader2,
	RefreshCw,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { FeatureStatus, StatusResponse } from "../server/routes/api";

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

interface StatusIndicatorProps {
	status: FeatureStatus["status"];
}

function StatusIndicator({ status }: StatusIndicatorProps) {
	switch (status) {
		case "started":
			return (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers
				<span
					className="text-terminal-mauve"
					title="Started"
					aria-label="Status: Started"
				>
					&#9675;
				</span>
			);
		case "in_progress":
			return (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers
				<span
					className="text-terminal-green"
					title="In Progress"
					aria-label="Status: In Progress"
				>
					&#9679;
				</span>
			);
		case "completed":
			return (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers
				<span
					className="text-muted-foreground"
					title="Completed"
					aria-label="Status: Completed"
				>
					&#10003;
				</span>
			);
		case "failed":
			return (
				// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen readers
				<span
					className="text-terminal-red"
					title="Failed"
					aria-label="Status: Failed"
				>
					&#10007;
				</span>
			);
		default:
			return null;
	}
}

interface FeatureCardProps {
	feature: FeatureStatus;
}

function FeatureCard({ feature }: FeatureCardProps) {
	return (
		<div className="rounded-lg border bg-card p-4 mb-3">
			<div className="flex items-start justify-between gap-4">
				<div className="flex items-center gap-2 min-w-0">
					<StatusIndicator status={feature.status} />
					<span className="font-medium truncate">{feature.feature}</span>
				</div>
				<span className="text-sm text-muted-foreground whitespace-nowrap">
					{feature.status.replace("_", " ")}
				</span>
			</div>
			{feature.currentTask && (
				<div className="mt-2 text-sm text-muted-foreground">
					<span className="text-terminal-mauve">task:</span>{" "}
					{feature.currentTask}
				</div>
			)}
			{feature.message && (
				<div className="mt-1 text-sm text-muted-foreground italic">
					"{feature.message}"
				</div>
			)}
			<div className="mt-2 text-xs text-muted-foreground text-right">
				{formatRelativeTime(feature.lastUpdate)}
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
	const [autoRefresh, setAutoRefresh] = useState(true);
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
		if (!projectId || !autoRefresh) {
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
	}, [projectId, autoRefresh, fetchStatus, onStatusChange]);

	// Fallback polling when WebSocket is not connected
	useEffect(() => {
		// Only poll when auto-refresh is enabled AND WebSocket is not connected
		if (!autoRefresh || wsStatus === "connected") {
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
	}, [autoRefresh, fetchStatus, wsStatus]);

	const handleManualRefresh = useCallback(() => {
		setIsRefreshing(true);
		fetchStatus();
	}, [fetchStatus]);

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
	const hasRecentlyCompleted = statusData.recentlyCompleted.length > 0;

	return (
		<div className="relative">
			<div className="flex items-center justify-between mb-6">
				<div className="flex items-center gap-2">
					<span className="text-terminal-mauve">&gt;</span>
					<h1 className="text-xl font-semibold">Status Dashboard</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						size="sm"
						onClick={handleManualRefresh}
						disabled={isRefreshing}
						title="Refresh status"
					>
						<RefreshCw
							className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`}
						/>
						Refresh
					</Button>
					<button
						type="button"
						onClick={() => setAutoRefresh(!autoRefresh)}
						className={`flex items-center gap-1 px-2 py-1 rounded text-sm transition-colors ${
							autoRefresh
								? "text-terminal-green"
								: "text-muted-foreground hover:text-foreground"
						}`}
						title={
							autoRefresh ? "Auto-refresh enabled" : "Auto-refresh disabled"
						}
					>
						<span
							className={`w-2 h-2 rounded-full ${
								autoRefresh ? "bg-terminal-green" : "bg-muted-foreground"
							}`}
						/>
						Auto
					</button>
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
					statusData.active.map((feature) => (
						<FeatureCard key={feature.feature} feature={feature} />
					))
				) : (
					<div className="rounded-lg border bg-muted/30 p-6 text-center text-muted-foreground">
						<p>No active features</p>
						<p className="text-sm mt-1">
							Agent work will appear here when in progress
						</p>
					</div>
				)}
			</section>

			{hasRecentlyCompleted && (
				<CollapsibleSection
					title="Recently Completed"
					count={statusData.recentlyCompleted.length}
					defaultOpen={false}
				>
					{statusData.recentlyCompleted.map((feature) => (
						<FeatureCard key={feature.feature} feature={feature} />
					))}
				</CollapsibleSection>
			)}

			<div className="mt-6 text-xs text-muted-foreground text-center">
				{wsStatus === "connected" ? (
					<span className="flex items-center justify-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-terminal-green" />
						Live updates active
					</span>
				) : (
					<span className="flex items-center justify-center gap-1">
						<span className="w-1.5 h-1.5 rounded-full bg-terminal-red" />
						Reconnecting...
					</span>
				)}
			</div>
		</div>
	);
}
