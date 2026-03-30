import { SquareKanban } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { HarnessIcon } from "@/components/v2/HarnessIcon";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";

export interface TerminalBreadcrumbProps {
	className?: string;
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

export function TerminalBreadcrumb({ className }: TerminalBreadcrumbProps) {
	const { pathname } = useLocation();
	const navigate = useNavigate();
	const { projectName, projectId, runInfo } = useBreadcrumbContext();

	if (runInfo) {
		return (
			<nav
				aria-label="Run info"
				className={cn(
					"flex items-center justify-center border-b px-4 py-1.5 min-h-8 type-body",
					"border-border",
					"text-fg-ghost",
					className,
				)}
			>
				<div className="flex items-center gap-3">
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
						onClick={() => navigate(`/projects/${runInfo.projectName}`)}
						onKeyDown={(e) => {
							if (e.key === "Enter")
								navigate(`/projects/${runInfo.projectName}`);
						}}
						className="flex items-center gap-1 type-secondary italic text-fg-ghost hover:text-fg-muted transition-colors duration-150 cursor-pointer"
						aria-label={`Open project ${runInfo.projectName}`}
					>
						<SquareKanban className="h-3 w-3" strokeWidth={1.5} />
						{runInfo.projectName}
					</span>
				</div>
			</nav>
		);
	}

	if (projectName && projectId) {
		return (
			<nav
				aria-label="Breadcrumb"
				className={cn(
					"flex items-center border-b px-4 py-1.5 min-h-8 type-body",
					"border-border",
					"text-fg-ghost",
					className,
				)}
			>
				<Link
					to={`/projects/${projectId}`}
					className="flex items-center gap-1 type-secondary italic text-fg-ghost transition-colors duration-150 hover:text-fg-muted"
				>
					<SquareKanban className="h-3 w-3" strokeWidth={1.5} />
					{projectName}
				</Link>
			</nav>
		);
	}

	const segments = buildSegments(pathname);
	const lastSegment =
		segments.length > 0 ? segments[segments.length - 1] : null;

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"flex items-center border-b px-4 py-1.5 min-h-8 type-body",
				"border-border",
				"text-fg-ghost",
				className,
			)}
		>
			{lastSegment && (
				<span className="text-fg" aria-current="page">
					{lastSegment.label}
				</span>
			)}
		</nav>
	);
}
