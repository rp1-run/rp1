import { Activity, Command, SquareKanban } from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { cn } from "@/lib/utils";

interface TabItem {
	readonly to: string;
	readonly label: string;
	readonly icon: typeof Activity;
	readonly matchPrefix?: boolean;
}

const TAB_ITEMS: readonly TabItem[] = [
	{ to: "/", label: "Activity", icon: Activity },
	{ to: "/projects", label: "Projects", icon: SquareKanban, matchPrefix: true },
] as const;

export interface MobileTabBarProps {
	className?: string;
	onOpenCommandPalette: () => void;
	notificationAction?: ReactNode;
}

export function MobileTabBar({
	className,
	onOpenCommandPalette,
	notificationAction,
}: MobileTabBarProps) {
	const location = useLocation();

	return (
		<nav
			aria-label="Mobile navigation"
			className={cn(
				"flex h-12 shrink-0 items-center justify-around",
				"border-t border-border bg-surface-void",
				className,
			)}
		>
			{TAB_ITEMS.map((item) => {
				const isActive = item.matchPrefix
					? location.pathname.startsWith(item.to)
					: location.pathname === item.to;

				return (
					<NavLink
						key={item.to}
						to={item.to}
						className={cn(
							"flex h-11 w-11 items-center justify-center rounded transition-colors duration-150",
							isActive ? "text-fg" : "text-fg-ghost hover:text-fg",
						)}
						aria-current={isActive ? "page" : undefined}
						aria-label={item.label}
					>
						<item.icon size={16} strokeWidth={1.5} aria-hidden="true" />
					</NavLink>
				);
			})}
			{notificationAction ? notificationAction : null}
			<button
				type="button"
				onClick={onOpenCommandPalette}
				className="flex h-11 w-11 items-center justify-center rounded text-fg-ghost transition-colors duration-150 hover:text-fg"
				aria-label="Open command palette"
			>
				<Command size={16} strokeWidth={1.5} aria-hidden="true" />
			</button>
		</nav>
	);
}
