import {
	ChevronLeft,
	ChevronRight,
	FolderKanban,
	Home,
	ListTodo,
} from "lucide-react";
import type { ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface V2SidebarProps {
	collapsed: boolean;
	onToggle: () => void;
	badgeCounts?: {
		home?: number;
		runs?: number;
		projects?: number;
	};
}

interface NavItem {
	to: string;
	label: string;
	icon: ReactNode;
	badgeKey: keyof NonNullable<V2SidebarProps["badgeCounts"]>;
}

const navItems: NavItem[] = [
	{
		to: "/",
		label: "Home",
		icon: <Home className="h-5 w-5" />,
		badgeKey: "home",
	},
	{
		to: "/runs",
		label: "Runs",
		icon: <ListTodo className="h-5 w-5" />,
		badgeKey: "runs",
	},
	{
		to: "/projects",
		label: "Projects",
		icon: <FolderKanban className="h-5 w-5" />,
		badgeKey: "projects",
	},
];

export function V2Sidebar({
	collapsed,
	onToggle,
	badgeCounts,
}: V2SidebarProps) {
	return (
		<aside
			className={cn(
				"flex h-full flex-col border-r bg-background transition-all duration-200 ease-in-out",
				collapsed ? "w-16" : "w-[200px]",
			)}
		>
			<nav className="flex flex-1 flex-col gap-1 p-2">
				{navItems.map((item) => (
					<SidebarNavItem
						key={item.to}
						to={item.to}
						label={item.label}
						icon={item.icon}
						collapsed={collapsed}
						badgeCount={badgeCounts?.[item.badgeKey]}
					/>
				))}
			</nav>
			<div className="border-t p-2">
				<CollapseButton collapsed={collapsed} onToggle={onToggle} />
			</div>
		</aside>
	);
}

interface SidebarNavItemProps {
	to: string;
	label: string;
	icon: ReactNode;
	collapsed: boolean;
	badgeCount?: number;
}

function SidebarNavItem({
	to,
	label,
	icon,
	collapsed,
	badgeCount,
}: SidebarNavItemProps) {
	const location = useLocation();
	const isActive =
		to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);

	const content = (
		<NavLink
			to={to}
			className={cn(
				"flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
				"hover:bg-accent hover:text-accent-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				isActive && "bg-accent text-accent-foreground",
				collapsed && "justify-center px-2",
			)}
			aria-current={isActive ? "page" : undefined}
		>
			<span className="shrink-0" aria-hidden="true">
				{icon}
			</span>
			{!collapsed && (
				<>
					<span className="flex-1">{label}</span>
					{badgeCount !== undefined && badgeCount > 0 && (
						<Badge count={badgeCount} />
					)}
				</>
			)}
			{collapsed && badgeCount !== undefined && badgeCount > 0 && (
				<span className="sr-only">{badgeCount} items</span>
			)}
		</NavLink>
	);

	if (collapsed) {
		return (
			<TooltipProvider>
				<Tooltip delayDuration={0}>
					<TooltipTrigger asChild>{content}</TooltipTrigger>
					<TooltipContent side="right" className="flex items-center gap-2">
						{label}
						{badgeCount !== undefined && badgeCount > 0 && (
							<Badge count={badgeCount} />
						)}
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>
		);
	}

	return content;
}

interface BadgeProps {
	count: number;
}

function Badge({ count }: BadgeProps) {
	const displayCount = count > 99 ? "99+" : count;
	return (
		// biome-ignore lint/a11y/useAriaPropsSupportedByRole: aria-label for screen reader context
		<span
			className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-status-waiting/20 px-1.5 text-xs font-medium text-status-waiting"
			aria-label={`${count} items need attention`}
		>
			{displayCount}
		</span>
	);
}

interface CollapseButtonProps {
	collapsed: boolean;
	onToggle: () => void;
}

function CollapseButton({ collapsed, onToggle }: CollapseButtonProps) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="sm"
						onClick={onToggle}
						className={cn(
							"w-full",
							collapsed ? "justify-center" : "justify-start",
						)}
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{collapsed ? (
							<ChevronRight className="h-4 w-4" />
						) : (
							<>
								<ChevronLeft className="h-4 w-4 mr-2" />
								<span>Collapse</span>
							</>
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side={collapsed ? "right" : "top"}>
					{collapsed ? "Expand sidebar (Cmd/Ctrl+B)" : "Collapse (Cmd/Ctrl+B)"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
