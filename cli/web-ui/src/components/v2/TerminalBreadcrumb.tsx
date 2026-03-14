import { Check, Copy } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProjects } from "@/hooks/useProjects";
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

/**
 * Resolve the real filesystem path for known URL patterns.
 *
 * - /projects/{projectId}/files/{filePath} → {project.path}/.rp1/{filePath}
 * - /runs/{runId}/artifacts/{artifactPath} → looks up absolutePath from the
 *   run's artifact list (server-resolved, no client-side path reconstruction)
 *
 * Returns null for unrecognized patterns or when data isn't available yet.
 */
function useFilesystemPath(pathname: string): string | null {
	const { projects } = useProjects();
	const [artifactAbsolutePath, setArtifactAbsolutePath] = useState<
		string | null
	>(null);

	const filesMatch = pathname.match(/^\/projects\/([^/]+)\/files\/(.+)$/);
	const artifactMatch = pathname.match(/^\/runs\/([^/]+)\/artifacts\/(.+)$/);
	const runId = artifactMatch?.[1] ?? null;
	const artifactUrlPath = artifactMatch?.[2] ?? null;

	// For artifact URLs, fetch the run and look up the artifact's absolutePath
	useEffect(() => {
		if (!runId || !artifactUrlPath) {
			setArtifactAbsolutePath(null);
			return;
		}
		fetch(`/api/v2/runs/${runId}`)
			.then((res) => (res.ok ? res.json() : null))
			.then(
				(
					run: {
						artifacts?: readonly { path: string; absolutePath: string }[];
					} | null,
				) => {
					if (!run?.artifacts) return;
					const artifact =
						run.artifacts.find((a) => a.path === artifactUrlPath) ??
						run.artifacts.find((a) => a.path.endsWith(`/${artifactUrlPath}`));
					setArtifactAbsolutePath(artifact?.absolutePath ?? null);
				},
			)
			.catch(() => setArtifactAbsolutePath(null));
	}, [runId, artifactUrlPath]);

	// Pattern 1: File browser — /projects/{id}/files/{path}
	if (filesMatch) {
		const project = projects.find((p) => p.id === filesMatch[1]);
		if (project) return `${project.path}/.rp1/${filesMatch[2]}`;
	}

	// Pattern 2: Artifact viewer — server-resolved absolute path
	if (artifactAbsolutePath) {
		return artifactAbsolutePath;
	}

	return null;
}

export function TerminalBreadcrumb({ className }: TerminalBreadcrumbProps) {
	const { pathname } = useLocation();
	const segments = buildSegments(pathname);
	const [copied, setCopied] = useState(false);
	const filesystemPath = useFilesystemPath(pathname);

	const handleCopy = useCallback(() => {
		const pathToCopy = filesystemPath ?? pathname;
		navigator.clipboard.writeText(pathToCopy).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [filesystemPath, pathname]);

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
			</ol>
			{segments.length > 0 && (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								className="ml-2 h-6 w-6 text-muted-foreground hover:text-foreground"
								onClick={handleCopy}
								aria-label="Copy full path"
							>
								{copied ? (
									<Check className="h-3.5 w-3.5" aria-hidden="true" />
								) : (
									<Copy className="h-3.5 w-3.5" aria-hidden="true" />
								)}
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>{copied ? "Copied!" : "Copy full path"}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}
		</nav>
	);
}
