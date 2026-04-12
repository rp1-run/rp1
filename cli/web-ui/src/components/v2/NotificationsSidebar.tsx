import { Bell, Loader2, NotebookTabs, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer } from "@/components/ui/drawer";
import type {
	NotificationAttentionLevel,
	NotificationListItem,
} from "@/hooks/useNotifications";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { HarnessIcon } from "./HarnessIcon";

export interface NotificationsSidebarProps {
	readonly open: boolean;
	readonly onClose: () => void;
	readonly notifications: readonly NotificationListItem[];
	readonly isLoading: boolean;
	readonly error: Error | null;
	readonly onDismissNotification: (id: number) => Promise<void>;
	readonly className?: string;
}

interface NotificationGroup {
	readonly level: NotificationAttentionLevel;
	readonly label: string;
	readonly items: readonly NotificationListItem[];
}

const GROUP_ORDER: ReadonlyArray<{
	level: NotificationAttentionLevel;
	label: string;
}> = [
	{ level: "action_required", label: "Action required" },
	{ level: "attention", label: "Attention" },
	{ level: "info", label: "Informational" },
];

function buildNotificationGroups(
	notifications: readonly NotificationListItem[],
): NotificationGroup[] {
	return GROUP_ORDER.map(({ level, label }) => ({
		level,
		label,
		items: notifications.filter(
			(notification) => notification.attentionLevel === level,
		),
	})).filter((group) => group.items.length > 0);
}

function accentClassForLevel(level: NotificationAttentionLevel): string {
	switch (level) {
		case "action_required":
			return "bg-accent-amber animate-status-pulse";
		case "attention":
			return "bg-accent-amber";
		case "info":
			return "bg-fg-ghost";
	}
}

function headingClassForLevel(level: NotificationAttentionLevel): string {
	switch (level) {
		case "action_required":
			return "text-accent-amber";
		case "attention":
			return "text-fg";
		case "info":
			return "text-fg-ghost";
	}
}

export function NotificationsSidebar({
	open,
	onClose,
	notifications,
	isLoading,
	error,
	onDismissNotification,
	className,
}: NotificationsSidebarProps) {
	const navigate = useNavigate();
	const [dismissingIds, setDismissingIds] = useState<readonly number[]>([]);
	const groups = useMemo(
		() => buildNotificationGroups(notifications),
		[notifications],
	);

	const handleOpenRoute = useCallback(
		(notification: NotificationListItem) => {
			if (!notification.route) {
				return;
			}

			navigate(notification.route);
			onClose();
		},
		[navigate, onClose],
	);

	const handleOpenProject = useCallback(
		(projectId: string) => {
			navigate(`/projects/${projectId}`);
			onClose();
		},
		[navigate, onClose],
	);

	const handleDismiss = useCallback(
		async (notificationId: number) => {
			setDismissingIds((current) =>
				current.includes(notificationId)
					? current
					: [...current, notificationId],
			);

			try {
				await onDismissNotification(notificationId);
			} catch (dismissError) {
				console.warn(String(dismissError));
			} finally {
				setDismissingIds((current) =>
					current.filter((id) => id !== notificationId),
				);
			}
		},
		[onDismissNotification],
	);

	return (
		<Drawer
			open={open}
			onClose={onClose}
			side="right"
			title="Notifications"
			className={cn("w-full max-w-[420px]", className)}
		>
			{isLoading && notifications.length === 0 ? (
				<div className="flex h-full items-center justify-center px-6 py-16">
					<Loader2 className="h-4 w-4 animate-spin text-fg-ghost" />
				</div>
			) : error && notifications.length === 0 ? (
				<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
					<p className="type-body text-failure">
						Failed to load notifications.
					</p>
					<p className="mt-2 type-secondary text-fg-ghost">{error.message}</p>
				</div>
			) : notifications.length === 0 ? (
				<div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
					<Bell
						className="mb-4 h-5 w-5 text-fg-ghost"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<p className="type-body text-fg-ghost">No notifications right now.</p>
					<p className="mt-2 max-w-[240px] type-secondary text-fg-ghost">
						New approvals, failures, and status updates will appear here.
					</p>
				</div>
			) : (
				<div className="flex flex-col gap-6 px-4 py-4">
					{groups.map((group) => (
						<section
							key={group.level}
							aria-labelledby={`notifications-group-${group.level}`}
							className="flex flex-col gap-3"
						>
							<div className="flex items-center justify-between">
								<h3
									id={`notifications-group-${group.level}`}
									className={cn(
										"type-caption uppercase tracking-[0.08em]",
										headingClassForLevel(group.level),
									)}
								>
									{group.label}
								</h3>
								<span className="type-secondary tabular-nums text-fg-ghost">
									{group.items.length}
								</span>
							</div>

							<div className="flex flex-col gap-3">
								{group.items.map((notification) => {
									const isDismissing = dismissingIds.includes(notification.id);
									return (
										<div
											key={notification.id}
											className="flex items-start gap-3 rounded-[var(--radius)] border border-border/70 bg-background px-3 py-3"
										>
											<span
												className={cn(
													"mt-2 h-2 w-2 shrink-0 rounded-full",
													accentClassForLevel(notification.attentionLevel),
												)}
												aria-hidden="true"
											/>

											<div className="min-w-0 flex-1">
												<div className="mb-2 flex min-w-0 items-center gap-2 text-fg-ghost">
													<span className="type-secondary tabular-nums">
														{formatRelativeTime(notification.createdAt)}
													</span>
													{notification.harness ? (
														<HarnessIcon
															harness={notification.harness}
															size={14}
														/>
													) : null}
													{notification.runCommand ? (
														<span className="type-secondary font-medium text-fg">
															{notification.runCommand}
														</span>
													) : null}
													{notification.runName ? (
														<span className="truncate type-secondary text-fg-muted">
															{notification.runName}
														</span>
													) : null}
												</div>

												{notification.route ? (
													<button
														type="button"
														onClick={() => handleOpenRoute(notification)}
														className="w-full text-left transition-colors duration-150 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
														aria-label={`Open notification: ${notification.message}`}
													>
														<p className="type-body text-fg">
															{notification.message}
														</p>
													</button>
												) : (
													<p className="type-body text-fg">
														{notification.message}
													</p>
												)}

												{notification.projectId && notification.projectName ? (
													<button
														type="button"
														onClick={() =>
															handleOpenProject(notification.projectId!)
														}
														className="mt-3 inline-flex items-center gap-1 type-secondary italic text-fg-ghost transition-colors duration-150 hover:text-fg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
														aria-label={`Open project ${notification.projectName}`}
													>
														<NotebookTabs
															className="h-3 w-3"
															strokeWidth={1.5}
															aria-hidden="true"
														/>
														{notification.projectName}
													</button>
												) : null}
											</div>

											<button
												type="button"
												onClick={() => void handleDismiss(notification.id)}
												className="shrink-0 rounded p-1 text-fg-ghost transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border disabled:cursor-not-allowed disabled:opacity-50"
												aria-label={`Dismiss notification: ${notification.message}`}
												disabled={isDismissing}
											>
												<X
													className="h-4 w-4"
													strokeWidth={1.5}
													aria-hidden="true"
												/>
											</button>
										</div>
									);
								})}
							</div>
						</section>
					))}
				</div>
			)}
		</Drawer>
	);
}
