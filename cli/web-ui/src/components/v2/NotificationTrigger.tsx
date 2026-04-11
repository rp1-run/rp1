import { Bell } from "lucide-react";
import type { NotificationsSummary } from "@/hooks/useNotifications";
import { cn } from "@/lib/utils";

export interface NotificationTriggerProps {
	readonly summary: NotificationsSummary;
	readonly open?: boolean;
	readonly onClick?: () => void;
	readonly className?: string;
}

function buildAriaLabel(summary: NotificationsSummary): string {
	if (summary.totalCount === 0) {
		return "Open notifications. No active notifications.";
	}

	return `Open notifications. ${summary.actionRequiredCount} action required, ${summary.attentionCount} attention, ${summary.informationalCount} informational notifications.`;
}

export function NotificationTrigger({
	summary,
	open = false,
	onClick,
	className,
}: NotificationTriggerProps) {
	const actionableCount = summary.actionRequiredCount + summary.attentionCount;
	const hasInformationalOnly = summary.totalCount > 0 && actionableCount === 0;
	const badgeLabel = actionableCount > 99 ? "99+" : String(actionableCount);

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"relative inline-flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors duration-150",
				"focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border",
				open
					? "bg-surface text-fg"
					: "text-fg-ghost hover:bg-surface/60 hover:text-fg",
				className,
			)}
			aria-label={buildAriaLabel(summary)}
			aria-pressed={open}
		>
			<Bell size={16} strokeWidth={1.5} aria-hidden="true" />

			{actionableCount > 0 ? (
				<span
					className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-amber px-1 text-[10px] font-medium text-background"
					aria-hidden="true"
				>
					{badgeLabel}
				</span>
			) : hasInformationalOnly ? (
				<span
					className="absolute right-1 top-1 h-2 w-2 rounded-full bg-fg-ghost/80"
					aria-hidden="true"
				/>
			) : null}
		</button>
	);
}
