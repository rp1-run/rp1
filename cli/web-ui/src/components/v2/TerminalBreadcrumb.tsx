import { NotebookTabs } from "lucide-react";
import type { ReactNode } from "react";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useWorkspaceTabs } from "@/hooks/useWorkspaceTabs";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface TerminalBreadcrumbProps {
	className?: string;
	action?: ReactNode;
}

export function TerminalBreadcrumb({
	className,
	action,
}: TerminalBreadcrumbProps) {
	const { runInfo, headerLeft, headerRight } = useBreadcrumbContext();
	const { openWorkspace } = useWorkspaceTabs();

	if (!runInfo) {
		return null;
	}

	return (
		<nav
			aria-label="Run info"
			className={cn(
				"flex min-h-8 items-center gap-3 border-b px-4 py-1.5 type-body",
				"border-border",
				"text-fg-ghost",
				className,
			)}
		>
			{headerLeft ? (
				<div className="flex items-center gap-3 shrink-0">{headerLeft}</div>
			) : null}
			<span className="type-secondary tabular-nums text-fg-ghost">
				{formatRelativeTime(runInfo.startedAt)}
			</span>
			<HarnessIcon harness={runInfo.harness} size={14} />
			<span className="type-body font-medium text-fg">{runInfo.command}</span>
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
			{headerRight ? (
				<div className="ml-auto flex min-w-0 items-center gap-3">
					{headerRight}
				</div>
			) : null}
			{action ? <div className="shrink-0">{action}</div> : null}
		</nav>
	);
}
