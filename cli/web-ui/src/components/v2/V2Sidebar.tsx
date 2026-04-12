import {
	ChevronLeft,
	ChevronRight,
	Clock,
	FileBox,
	Home,
	NotebookTabs,
	Pin,
	Search,
	Settings,
} from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useMemo } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useAttention } from "@/hooks/useAttention";
import { usePinnedProjects } from "@/hooks/usePinnedProjects";
import { useRecentRuns } from "@/hooks/useRecentRuns";
import { resolveRunDisplayName } from "@/lib/run-display";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Collapsible } from "./Collapsible";
import { KeyboardShortcutHint } from "./KeyboardShortcutHint";

const APP_VERSION = "0.1.0";

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
	shortcutHint: string;
	badgeKey: "home" | "runs" | "projects";
	conditionalRoute?: string;
}

const ENABLED_ROUTES = new Set(["/", "/projects"]);

const allNavItems: NavItem[] = [
	{
		to: "/",
		label: "Home",
		icon: <Home className="h-5 w-5" />,
		shortcutHint: "g h",
		badgeKey: "home",
	},
	{
		to: "/projects",
		label: "Projects",
		icon: <NotebookTabs className="h-5 w-5" />,
		shortcutHint: "g p",
		badgeKey: "projects",
	},
	{
		to: "/artifacts",
		label: "Artifacts",
		icon: <FileBox className="h-5 w-5" />,
		shortcutHint: "g a",
		badgeKey: "home",
		conditionalRoute: "/artifacts",
	},
	{
		to: "/settings",
		label: "Settings",
		icon: <Settings className="h-5 w-5" />,
		shortcutHint: "g s",
		badgeKey: "home",
		conditionalRoute: "/settings",
	},
];

const navItems = allNavItems.filter(
	(item) => !item.conditionalRoute || ENABLED_ROUTES.has(item.conditionalRoute),
);

export function V2Sidebar({ collapsed, onToggle }: V2SidebarProps) {
	return (
		<aside
			className={cn(
				"flex h-full flex-col border-r bg-background transition-all duration-200 ease-in-out",
				collapsed ? "w-16" : "w-[240px]",
			)}
		>
			<SidebarHeader collapsed={collapsed} />
			<SidebarQuickAccess collapsed={collapsed} />
			<SidebarNavigation collapsed={collapsed} />
			<SidebarFooter collapsed={collapsed} onToggle={onToggle} />
		</aside>
	);
}

interface SidebarHeaderProps {
	collapsed: boolean;
}

function SidebarHeader({ collapsed }: SidebarHeaderProps) {
	const triggerCommandPalette = useCallback(() => {
		window.dispatchEvent(
			new KeyboardEvent("keydown", {
				key: "k",
				metaKey: true,
				bubbles: true,
			}),
		);
	}, []);

	if (collapsed) {
		return null;
	}

	return (
		<div className="flex flex-col gap-3 border-b p-3">
			<button
				type="button"
				onClick={triggerCommandPalette}
				className={cn(
					"flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs text-muted-foreground",
					"transition-colors hover:bg-muted hover:text-foreground",
					"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				)}
				aria-label="Search or switch project (Cmd+K)"
			>
				<Search className="h-3.5 w-3.5" />
				<span className="flex-1 text-left">Search...</span>
				<kbd className="rounded bg-muted/70 px-1.5 py-0.5 font-mono text-[0.625rem]">
					{"\u2318"}K
				</kbd>
			</button>
		</div>
	);
}

interface SidebarFooterProps {
	collapsed: boolean;
	onToggle: () => void;
}

function SidebarFooter({ collapsed, onToggle }: SidebarFooterProps) {
	if (collapsed) {
		return (
			<div className="flex flex-col items-center gap-1 border-t p-2">
				<CollapseButton collapsed={collapsed} onToggle={onToggle} />
			</div>
		);
	}

	return (
		<div className="flex items-center justify-between border-t p-2">
			<span className="px-1 text-xs text-muted-foreground">v{APP_VERSION}</span>
			<CollapseButton collapsed={collapsed} onToggle={onToggle} />
		</div>
	);
}

interface SidebarQuickAccessProps {
	collapsed: boolean;
}

function SidebarQuickAccess({ collapsed }: SidebarQuickAccessProps) {
	const { recentRuns } = useRecentRuns();
	const { pinnedProjects } = usePinnedProjects();
	const { data: attentionData } = useAttention();

	if (collapsed) return null;

	const runningItems = attentionData?.running ?? [];
	const hasRecents = recentRuns.length > 0;
	const hasPinned = pinnedProjects.length > 0;
	const hasRunning = runningItems.length > 0;
	const hasAny = hasRecents || hasPinned || hasRunning;

	if (!hasAny) return null;

	return (
		<div className="px-2">
			<Collapsible
				title="Quick Access"
				defaultExpanded={true}
				className="border-0 rounded-none"
			>
				<div className="space-y-3 px-2 pb-2">
					{hasRunning && (
						<div>
							<span className="px-2 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
								Running
							</span>
							<ul className="mt-1 space-y-0.5">
								{runningItems.map((run) => (
									<li key={run.id}>
										<Link
											to={`/runs/${run.id}`}
											className={cn(
												"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
												"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
										>
											<span className="relative flex h-2 w-2 shrink-0">
												<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-status-running opacity-75" />
												<span className="relative inline-flex h-2 w-2 rounded-full bg-status-running" />
											</span>
											<span className="flex-1 truncate text-foreground">
												{resolveRunDisplayName(run) || run.projectName}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					)}

					{hasRecents && (
						<div>
							<span className="px-2 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
								Recent
							</span>
							<ul className="mt-1 space-y-0.5">
								{recentRuns.map((run) => (
									<li key={run.id}>
										<Link
											to={`/runs/${run.id}`}
											className={cn(
												"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
												"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
										>
											<Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate text-foreground">
												{resolveRunDisplayName(run) || run.projectName}
											</span>
											<span className="shrink-0 text-[0.625rem] text-muted-foreground">
												{formatRelativeTime(
													new Date(run.timestamp).toISOString(),
												)}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					)}

					{hasPinned && (
						<div>
							<span className="px-2 text-[0.625rem] font-medium uppercase tracking-wider text-muted-foreground">
								Pinned
							</span>
							<ul className="mt-1 space-y-0.5">
								{pinnedProjects.map((projectId) => (
									<li key={projectId}>
										<Link
											to={`/projects/${projectId}`}
											className={cn(
												"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors",
												"hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
											)}
										>
											<Pin className="h-3 w-3 shrink-0 text-muted-foreground" />
											<span className="flex-1 truncate text-foreground">
												{projectId}
											</span>
										</Link>
									</li>
								))}
							</ul>
						</div>
					)}
				</div>
			</Collapsible>
		</div>
	);
}

interface SidebarNavigationProps {
	collapsed: boolean;
}

function SidebarNavigation({ collapsed }: SidebarNavigationProps) {
	const { data: attentionData } = useAttention();

	const badgeCounts = useMemo(() => {
		if (!attentionData) return { home: 0, runs: 0, projects: 0 };

		const { waiting, failed, running } = attentionData;
		const totalAttention = waiting.length + failed.length + running.length;
		const runsCount = running.length + waiting.length;

		const activeProjectIds = new Set(running.map((r) => r.projectId));
		const projectsCount = activeProjectIds.size;

		return {
			home: totalAttention,
			runs: runsCount,
			projects: projectsCount,
		};
	}, [attentionData]);

	return (
		<nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-2">
			{!collapsed && (
				<span className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
					Navigation
				</span>
			)}
			{navItems.map((item) => (
				<SidebarNavItem
					key={item.to}
					to={item.to}
					label={item.label}
					icon={item.icon}
					shortcutHint={item.shortcutHint}
					collapsed={collapsed}
					badgeCount={badgeCounts[item.badgeKey]}
				/>
			))}
		</nav>
	);
}

interface SidebarNavItemProps {
	to: string;
	label: string;
	icon: ReactNode;
	shortcutHint: string;
	collapsed: boolean;
	badgeCount?: number;
}

function SidebarNavItem({
	to,
	label,
	icon,
	shortcutHint,
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
				"group flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-all",
				"hover:bg-accent hover:text-accent-foreground",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
				isActive &&
					"bg-accent/50 text-accent-foreground shadow-[0_0_8px_hsl(var(--primary)/0.3)]",
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
					<span className="hidden shrink-0 group-hover:inline-flex">
						<KeyboardShortcutHint keys={shortcutHint} />
					</span>
					{badgeCount !== undefined && badgeCount > 0 && (
						<span className="shrink-0 group-hover:hidden">
							<Badge count={badgeCount} />
						</span>
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
						<KeyboardShortcutHint keys={shortcutHint} />
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
						size="icon"
						className="h-8 w-8"
						onClick={onToggle}
						aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
					>
						{collapsed ? (
							<ChevronRight className="h-4 w-4" />
						) : (
							<ChevronLeft className="h-4 w-4" />
						)}
					</Button>
				</TooltipTrigger>
				<TooltipContent side={collapsed ? "right" : "top"}>
					{collapsed
						? "Expand sidebar (Cmd/Ctrl+\\)"
						: "Collapse (Cmd/Ctrl+\\)"}
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}
