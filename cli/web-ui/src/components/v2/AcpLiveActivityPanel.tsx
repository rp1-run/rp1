import {
	Activity,
	AlertTriangle,
	CheckCircle2,
	Circle,
	Clock3,
	ListChecks,
	MessageSquareText,
	ShieldAlert,
	Terminal,
	Wrench,
	XCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
	AcpPermissionSignalPayload,
	AcpPlanSignalPayload,
	AcpSessionSignalPayload,
	AcpStatusSignalPayload,
	AcpToolSignalPayload,
	AcpTranscriptSignalPayload,
} from "@/server/acp/types";
import type { LiveAcpActivityItem, LiveAcpRunState } from "@/types/runs";
import { PanelHeader } from "./PanelHeader";

const RECENT_ACTIVITY_LIMIT = 16;

const SESSION_STATUS_LABELS: Record<LiveAcpRunState["status"], string> = {
	initializing: "Initializing",
	ready: "Ready",
	running: "Running",
	blocked: "Blocked",
	cancelling: "Cancelling",
	cancelled: "Cancelled",
	closed: "Closed",
};

const HEALTH_LABELS: Record<LiveAcpRunState["health"], string> = {
	available: "Available",
	blocked: "Blocked",
	closed: "Closed",
};

const KIND_LABELS: Record<LiveAcpActivityItem["kind"], string> = {
	session: "Session",
	transcript: "Transcript",
	tool: "Tool",
	plan: "Plan",
	permission: "Permission",
	status: "Status",
};

interface AcpLiveActivityPanelProps {
	readonly liveAcp: LiveAcpRunState;
	readonly className?: string;
}

function formatShortTime(value: string): string {
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return value;
	return new Intl.DateTimeFormat(undefined, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	}).format(date);
}

function statusTone(status: LiveAcpRunState["status"]) {
	if (status === "blocked") {
		return {
			dot: "bg-accent-amber animate-status-pulse",
			text: "text-accent-amber",
		};
	}
	if (status === "cancelled" || status === "closed") {
		return {
			dot: "bg-fg-ghost",
			text: "text-fg-ghost",
		};
	}
	if (status === "cancelling") {
		return {
			dot: "bg-accent-amber",
			text: "text-fg-muted",
		};
	}
	return {
		dot: "bg-accent-amber animate-status-pulse",
		text: "text-fg-muted",
	};
}

function ActivityIcon({
	kind,
}: {
	readonly kind: LiveAcpActivityItem["kind"];
}) {
	const Icon =
		kind === "transcript"
			? MessageSquareText
			: kind === "tool"
				? Wrench
				: kind === "plan"
					? ListChecks
					: kind === "permission"
						? ShieldAlert
						: kind === "status"
							? Activity
							: Terminal;
	return <Icon className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden="true" />;
}

function ActivityKindLabel({
	kind,
}: {
	readonly kind: LiveAcpActivityItem["kind"];
}) {
	return (
		<span className="inline-flex min-w-0 items-center gap-1 text-fg-ghost">
			<ActivityIcon kind={kind} />
			<span className="truncate">{KIND_LABELS[kind]}</span>
		</span>
	);
}

function PermissionState({
	permission,
}: {
	readonly permission: NonNullable<LiveAcpRunState["activePermission"]>;
}) {
	return (
		<div className="border-y border-accent-amber/30 bg-accent-amber/10 px-4 py-3">
			<div className="flex min-w-0 items-start gap-2">
				<ShieldAlert
					className="mt-0.5 h-4 w-4 shrink-0 text-accent-amber"
					strokeWidth={1.5}
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 items-center justify-between gap-2">
						<p className="min-w-0 truncate type-secondary font-medium text-fg">
							{permission.title}
						</p>
						<span className="shrink-0 type-secondary text-accent-amber">
							{permission.blocking ? "Blocking" : "Pending"}
						</span>
					</div>
					<p className="mt-1 break-words type-secondary text-fg-muted">
						{permission.reason}
					</p>
				</div>
			</div>
		</div>
	);
}

function renderSessionPayload(payload: AcpSessionSignalPayload) {
	return (
		<>
			<p className="break-words type-secondary text-fg-muted">
				{payload.message}
			</p>
			<p className="mt-1 type-secondary text-fg-ghost">
				{SESSION_STATUS_LABELS[payload.status]} - {payload.phase}
			</p>
		</>
	);
}

function renderTranscriptPayload(payload: AcpTranscriptSignalPayload) {
	return (
		<>
			<p className="type-secondary font-medium capitalize text-fg-muted">
				{payload.role}
			</p>
			<p className="mt-1 break-words type-secondary text-fg">{payload.text}</p>
		</>
	);
}

function renderToolPayload(payload: AcpToolSignalPayload) {
	const details = [payload.inputSummary, payload.outputSummary].filter(Boolean);
	return (
		<>
			<div className="flex min-w-0 items-center justify-between gap-2">
				<p className="min-w-0 truncate type-secondary font-medium text-fg">
					{payload.name}
				</p>
				<span className="shrink-0 type-secondary capitalize text-fg-ghost">
					{payload.status}
				</span>
			</div>
			{details.length > 0 && (
				<p className="mt-1 break-words type-secondary text-fg-muted">
					{details.join(" - ")}
				</p>
			)}
		</>
	);
}

function planStatusIcon(
	status: AcpPlanSignalPayload["items"][number]["status"],
) {
	if (status === "completed") {
		return (
			<CheckCircle2
				className="h-3 w-3 text-fg-ghost"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
		);
	}
	if (status === "running") {
		return (
			<Clock3
				className="h-3 w-3 text-accent-amber"
				strokeWidth={1.5}
				aria-hidden="true"
			/>
		);
	}
	return (
		<Circle
			className="h-3 w-3 text-fg-ghost"
			strokeWidth={1.5}
			aria-hidden="true"
		/>
	);
}

function renderPlanPayload(payload: AcpPlanSignalPayload) {
	const visibleItems = payload.items.slice(0, 4);
	const remainingCount = payload.items.length - visibleItems.length;

	return (
		<div className="space-y-1">
			{visibleItems.map((item) => (
				<div key={item.id} className="flex min-w-0 items-start gap-2">
					<span className="mt-0.5 shrink-0">{planStatusIcon(item.status)}</span>
					<span className="min-w-0 break-words type-secondary text-fg-muted">
						{item.title}
					</span>
				</div>
			))}
			{remainingCount > 0 && (
				<p className="type-secondary text-fg-ghost">
					+{remainingCount} more plan items
				</p>
			)}
		</div>
	);
}

function renderPermissionPayload(payload: AcpPermissionSignalPayload) {
	return (
		<>
			<div className="flex min-w-0 items-center justify-between gap-2">
				<p className="min-w-0 truncate type-secondary font-medium text-fg">
					{payload.title}
				</p>
				<span
					className={cn(
						"shrink-0 type-secondary capitalize",
						payload.blocking ? "text-accent-amber" : "text-fg-ghost",
					)}
				>
					{payload.status}
				</span>
			</div>
			<p className="mt-1 break-words type-secondary text-fg-muted">
				{payload.reason}
			</p>
		</>
	);
}

function renderStatusPayload(payload: AcpStatusSignalPayload) {
	return (
		<>
			<p className="break-words type-secondary text-fg-muted">
				{payload.message}
			</p>
			<p className="mt-1 type-secondary text-fg-ghost">
				{SESSION_STATUS_LABELS[payload.status]} -{" "}
				{HEALTH_LABELS[payload.health]}
			</p>
		</>
	);
}

function ActivityPayload({ item }: { readonly item: LiveAcpActivityItem }) {
	if (item.kind === "session") {
		return renderSessionPayload(item.payload as AcpSessionSignalPayload);
	}
	if (item.kind === "transcript") {
		return renderTranscriptPayload(item.payload as AcpTranscriptSignalPayload);
	}
	if (item.kind === "tool") {
		return renderToolPayload(item.payload as AcpToolSignalPayload);
	}
	if (item.kind === "plan") {
		return renderPlanPayload(item.payload as AcpPlanSignalPayload);
	}
	if (item.kind === "permission") {
		return renderPermissionPayload(item.payload as AcpPermissionSignalPayload);
	}
	return renderStatusPayload(item.payload as AcpStatusSignalPayload);
}

export function AcpLiveActivityPanel({
	liveAcp,
	className,
}: AcpLiveActivityPanelProps) {
	const tone = statusTone(liveAcp.status);
	const recentActivity = liveAcp.activity
		.slice(-RECENT_ACTIVITY_LIMIT)
		.reverse();
	const hiddenActivityCount = Math.max(
		0,
		liveAcp.activity.length - recentActivity.length,
	);
	const inactive =
		liveAcp.status === "cancelled" || liveAcp.status === "closed";

	return (
		<section
			className={cn(
				"flex min-h-0 flex-col overflow-hidden bg-surface-void",
				className,
			)}
			aria-label="Live ACP activity"
		>
			<PanelHeader
				icon={Activity}
				title="Live ACP"
				meta={
					<span className="type-secondary text-fg-ghost">
						{liveAcp.provider} - {liveAcp.sessionId}
					</span>
				}
			/>

			<div className="shrink-0 px-4 pb-3">
				<div className="flex min-w-0 items-start justify-between gap-3">
					<div className="min-w-0 flex-1">
						<div className="flex min-w-0 items-center gap-2">
							<span
								className={cn("h-2 w-2 shrink-0 rounded-full", tone.dot)}
								aria-hidden="true"
							/>
							<p
								className={cn("truncate type-secondary font-medium", tone.text)}
							>
								{SESSION_STATUS_LABELS[liveAcp.status]}
							</p>
						</div>
						{liveAcp.statusMessage && (
							<p className="mt-1 break-words type-secondary text-fg-muted">
								{liveAcp.statusMessage}
							</p>
						)}
					</div>
					<div className="shrink-0 text-right type-secondary text-fg-ghost">
						<p>{HEALTH_LABELS[liveAcp.health]}</p>
						<time dateTime={liveAcp.updatedAt}>
							{formatShortTime(liveAcp.updatedAt)}
						</time>
					</div>
				</div>

				{inactive && (
					<div className="mt-3 flex items-center gap-2 border-t border-border/60 pt-2 type-secondary text-fg-ghost">
						<XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />
						<span>Session is no longer active</span>
					</div>
				)}
			</div>

			{liveAcp.activePermission && (
				<PermissionState permission={liveAcp.activePermission} />
			)}

			<div className="min-h-0 flex-1 overflow-y-auto border-t border-border/60">
				{(hiddenActivityCount > 0 || liveAcp.droppedCount > 0) && (
					<p className="border-b border-border/60 px-4 py-2 type-secondary text-fg-ghost">
						{hiddenActivityCount + liveAcp.droppedCount} older live updates
						collapsed
					</p>
				)}

				{recentActivity.length > 0 ? (
					<ol className="divide-y divide-border/60">
						{recentActivity.map((item) => (
							<li key={item.id} className="px-4 py-3">
								<div className="mb-2 flex min-w-0 items-center justify-between gap-2 type-secondary">
									<ActivityKindLabel kind={item.kind} />
									<time
										className="shrink-0 tabular-nums text-fg-ghost"
										dateTime={item.createdAt}
									>
										{formatShortTime(item.createdAt)}
									</time>
								</div>
								<ActivityPayload item={item} />
							</li>
						))}
					</ol>
				) : (
					<div className="flex min-h-24 items-center justify-center px-4 text-center">
						<div className="flex items-center gap-2 type-secondary text-fg-ghost">
							<AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />
							<span>No live activity yet</span>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
