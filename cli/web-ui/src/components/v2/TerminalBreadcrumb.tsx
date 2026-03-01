import { Link, useLocation } from "react-router-dom";
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
	const segments = buildSegments(pathname);

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"flex items-center border-b border-border px-4 py-1.5 font-mono text-sm text-muted-foreground",
				className,
			)}
		>
			<ol className="flex items-center gap-1">
				<li>
					{segments.length === 0 ? (
						<span className="text-foreground" aria-current="page">
							~
						</span>
					) : (
						<Link to="/" className="transition-colors hover:text-foreground">
							~
						</Link>
					)}
				</li>
				{segments.map((segment, index) => {
					const isLast = index === segments.length - 1;
					return (
						<li key={segment.to} className="flex items-center gap-1">
							<span aria-hidden="true" className="select-none">
								/
							</span>
							{isLast ? (
								<span className="text-foreground" aria-current="page">
									{segment.label}
								</span>
							) : (
								<Link
									to={segment.to}
									className="transition-colors hover:text-foreground"
								>
									{segment.label}
								</Link>
							)}
						</li>
					);
				})}
				<li aria-hidden="true">
					<span className="ml-0.5 text-terminal-green">_</span>
				</li>
			</ol>
		</nav>
	);
}
