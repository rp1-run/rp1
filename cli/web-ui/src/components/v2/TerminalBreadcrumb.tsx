import { Check, Copy, Dot } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
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

function useFilesystemPath(
	pathname: string,
	artifactParam: string | null,
): string | null {
	const { projects } = useProjects();
	const [artifactAbsolutePath, setArtifactAbsolutePath] = useState<
		string | null
	>(null);

	const filesMatch = pathname.match(/^\/projects\/([^/]+)\/files\/(.+)$/);
	const artifactMatch = pathname.match(/^\/runs\/([^/]+)\/artifacts\/(.+)$/);
	const runDetailMatch = pathname.match(/^\/runs\/([^/]+)$/);

	const runId =
		artifactMatch?.[1] ?? (artifactParam ? runDetailMatch?.[1] : null) ?? null;
	const artifactUrlPath = artifactMatch?.[2] ?? artifactParam ?? null;

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

	if (filesMatch) {
		const project = projects.find((p) => p.id === filesMatch[1]);
		if (project) return `${project.path}/.rp1/${filesMatch[2]}`;
	}

	if (artifactAbsolutePath) {
		return artifactAbsolutePath;
	}

	return null;
}

export function TerminalBreadcrumb({ className }: TerminalBreadcrumbProps) {
	const { pathname } = useLocation();
	const { artifactPath: contextArtifact, projectName } = useBreadcrumbContext();
	const segments = buildSegments(pathname);
	const [copied, setCopied] = useState(false);
	const filesystemPath = useFilesystemPath(pathname, contextArtifact);

	const handleCopy = useCallback(() => {
		const pathToCopy = filesystemPath ?? pathname;
		navigator.clipboard.writeText(pathToCopy).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [filesystemPath, pathname]);

	const artifactFileName = contextArtifact
		? (contextArtifact.split("/").pop() ?? contextArtifact)
		: null;
	const lastSegment =
		segments.length > 0 ? segments[segments.length - 1] : null;
	const displayLabel = artifactFileName ?? lastSegment?.label ?? null;

	return (
		<nav
			aria-label="Breadcrumb"
			className={cn(
				"flex items-center border-b px-4 py-1.5 type-body",
				"border-border",
				"text-fg-ghost",
				className,
			)}
		>
			<div className="flex items-center gap-2">
				<Link
					to="/"
					className="flex items-center transition-colors duration-150 hover:text-fg"
					aria-label="Home"
				>
					<Dot className="h-4 w-4" strokeWidth={1.5} aria-hidden="true" />
				</Link>
				{projectName && <span className="text-fg-ghost">{projectName}</span>}
				{displayLabel && (
					<span className="text-fg" aria-current="page">
						{displayLabel}
					</span>
				)}
			</div>
			{segments.length > 0 && (
				<TooltipProvider>
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								className="ml-2 flex h-6 w-6 items-center justify-center rounded text-fg-ghost transition-colors duration-150 hover:text-fg"
								onClick={handleCopy}
								aria-label="Copy full path"
							>
								{copied ? (
									<Check
										className="h-4 w-4"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
								) : (
									<Copy
										className="h-4 w-4"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
								)}
							</button>
						</TooltipTrigger>
						<TooltipContent>
							<p>{copied ? "Copied!" : (filesystemPath ?? pathname)}</p>
						</TooltipContent>
					</Tooltip>
				</TooltipProvider>
			)}
		</nav>
	);
}
