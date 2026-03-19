import { Activity, File, FolderOpen } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface NavItem {
	readonly to: string;
	readonly label: string;
	readonly icon: typeof Activity;
	readonly matchPrefix?: boolean;
}

const NAV_ITEMS: readonly NavItem[] = [
	{ to: "/", label: "Activity", icon: Activity },
	{ to: "/projects", label: "Projects", icon: FolderOpen, matchPrefix: true },
	{ to: "/runs", label: "Runs", icon: File, matchPrefix: true },
] as const;

export interface IconRailProps {
	className?: string;
}

export function IconRail({ className }: IconRailProps) {
	const location = useLocation();

	return (
		<nav
			aria-label="Main navigation"
			className={cn(
				"flex w-12 shrink-0 flex-col items-center gap-lg pt-lg",
				"bg-surface-void",
				className,
			)}
		>
			{NAV_ITEMS.map((item) => {
				const isActive = item.matchPrefix
					? location.pathname.startsWith(item.to)
					: location.pathname === item.to;

				return (
					<IconRailItem
						key={item.to}
						to={item.to}
						label={item.label}
						icon={item.icon}
						isActive={isActive}
					/>
				);
			})}
		</nav>
	);
}

interface IconRailItemProps {
	readonly to: string;
	readonly label: string;
	readonly icon: typeof Activity;
	readonly isActive: boolean;
}

function IconRailItem({ to, label, icon: Icon, isActive }: IconRailItemProps) {
	return (
		<TooltipProvider>
			<Tooltip delayDuration={500}>
				<TooltipTrigger asChild>
					<NavLink
						to={to}
						className={cn(
							"flex h-11 w-11 items-center justify-center rounded transition-colors duration-150",
							isActive ? "text-fg" : "text-fg-ghost hover:text-fg",
						)}
						aria-current={isActive ? "page" : undefined}
						aria-label={label}
					>
						<Icon size={16} strokeWidth={1.5} aria-hidden="true" />
					</NavLink>
				</TooltipTrigger>
				<TooltipContent
					side="right"
					className="border-0 bg-surface text-fg shadow-none"
				>
					{label}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
