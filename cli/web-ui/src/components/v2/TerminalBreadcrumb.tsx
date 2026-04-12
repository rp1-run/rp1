import { NotebookTabs } from "lucide-react";
import type { ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface TerminalBreadcrumbProps {
	className?: string;
	action?: ReactNode;
}

export interface BreadcrumbSegment {
	readonly label: string;
	readonly to: string;
}

export function buildSegments(pathname: string): BreadcrumbSegment[] {
	const parts = pathname.split("/").filter(Boolean);
	return parts.map((part, index) => ({
		label: part,
		to: `/${parts.slice(0, index + 1).join("/")}`,
	}));
}

export function TerminalBreadcrumb({
	className,
	action,
}: TerminalBreadcrumbProps) {
	const { pathname } = useLocation();
	const { projectName, projectId, runInfo } = useBreadcrumbContext();
	const { openWorkspace } = useWorkspaceTabs();

	if (runInfo) {
		return (
			<nav
				aria-label="Run info"
				className={cn(
					"grid min-h-8 grid-cols-[1fr_auto_1fr] items-center border-b px-4 py-1.5 type-body",
					"border-border",
					"text-fg-ghost",
					className,
				)}
			>
				<div className="col-start-2 flex items-center gap-3">
					<span className="type-secondary tabular-nums text-fg-ghost">
						{formatRelativeTime(runInfo.startedAt)}
					</span>
					<HarnessIcon harness={runInfo.harness} size={14} />
					<span className="type-body font-medium text-fg">
						{runInfo.command}
					</span>
					<span className="type-secondary text-fg-muted">
						{runInfo.displayName}
					</span>
					{/* biome-ignore lint/a11y/useSemanticElements: span with role="link" for project navigation */}
					<span
						role="link"
						tabIndex={0}
						onClick={() => openWorkspace(`/projects/${runInfo.projectId}`)}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								openWorkspace(`/projects/${runInfo.projectId}`);
							}
						}}
						className="flex items-center gap-1 type-secondary italic text-fg-ghost hover:text-fg-muted transition-colors duration-150 cursor-pointer"
						aria-label={`Open project ${runInfo.projectName}`}
					>
						<NotebookTabs className="h-3 w-3" strokeWidth={1.5} />
						{runInfo.projectName}
					</span>
				</div>
				{action ? (
					<div className="col-start-3 justify-self-end">{action}</div>
				) : null}
			</nav>
		);
	}

	if (projectName && projectId) {
		return (
			<nav
				aria-label="Breadcrumb"
				className={cn(
					"flex min-h-8 items-center justify-between border-b px-4 py-1.5 type-body",
					"border-border",
					"text-fg-ghost",
					className,
				)}
			>
				<Link
					to={`/projects/${projectId}`}
					className="flex items-center gap-1 type-secondary italic text-fg-ghost transition-colors duration-150 hover:text-fg-muted"
				>
					<NotebookTabs className="h-3 w-3" strokeWidth={1.5} />
					{projectName}
				</Link>
				{action ? <div className="flex items-center">{action}</div> : null}
			</nav>
		);
	}

	const pageLabel =
		pathname === "/"
			? "Activity"
			: pathname === "/runs"
				? "Runs"
				: pathname === "/projects"
					? "Projects"
					: (buildSegments(pathname).pop()?.label ?? null);

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"flex min-h-8 items-center justify-between border-b px-4 py-1.5 type-body",
				"border-border",
				"text-fg-ghost",
				className,
			)}
		>
			{pageLabel && (
				<span className="text-fg" aria-current="page">
					{pageLabel}
				</span>
			)}
			{action ? <div className="flex items-center">{action}</div> : null}
		</nav>
	);
}
