import { ExternalLink } from "lucide-react";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

interface MarkdownLinkProps {
	href?: string;
	basePath: string;
	children: React.ReactNode;
	className?: string;
}

export function MarkdownLink({
	href,
	basePath,
	children,
	className,
}: MarkdownLinkProps) {
	const { isExternal, resolvedPath } = useMemo(() => {
		if (!href) {
			return { isExternal: false, resolvedPath: "#" };
		}

		if (
			href.startsWith("http://") ||
			href.startsWith("https://") ||
			href.startsWith("mailto:")
		) {
			return { isExternal: true, resolvedPath: href };
		}

		if (href.startsWith("#")) {
			return { isExternal: false, resolvedPath: href };
		}

		let resolved: string;
		if (href.startsWith("/")) {
			resolved = href.slice(1);
		} else if (href.startsWith("./")) {
			resolved = basePath ? `${basePath}/${href.slice(2)}` : href.slice(2);
		} else if (href.startsWith("../")) {
			const baseParts = basePath.split("/").filter(Boolean);
			const hrefParts = href.split("/");

			while (hrefParts[0] === "..") {
				baseParts.pop();
				hrefParts.shift();
			}

			resolved = [...baseParts, ...hrefParts].join("/");
		} else {
			resolved = basePath ? `${basePath}/${href}` : href;
		}

		resolved = resolved.replace(/^\/+/, "");

		return { isExternal: false, resolvedPath: `/view/${resolved}` };
	}, [href, basePath]);

	const linkClasses = cn(
		"text-terminal-green underline underline-offset-4 hover:text-terminal-green/80 transition-colors",
		className,
	);

	if (isExternal) {
		return (
			<a
				href={resolvedPath}
				target="_blank"
				rel="noopener noreferrer"
				className={cn(linkClasses, "inline-flex items-center gap-1")}
			>
				{children}
				<ExternalLink className="h-3 w-3" aria-hidden="true" />
			</a>
		);
	}

	if (resolvedPath.startsWith("#")) {
		return (
			<a href={resolvedPath} className={linkClasses}>
				{children}
			</a>
		);
	}

	return (
		<Link to={resolvedPath} className={linkClasses}>
			{children}
		</Link>
	);
}
