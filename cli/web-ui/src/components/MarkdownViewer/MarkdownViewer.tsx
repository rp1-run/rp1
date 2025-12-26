import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { CodeBlock } from "./CodeBlock";
import { MarkdownLink } from "./MarkdownLink";
import { MermaidDiagram } from "./MermaidDiagram";

export interface MarkdownViewerProps {
	content: string;
	path: string;
	frontmatter?: Record<string, unknown>;
	showFrontmatter?: boolean;
	className?: string;
}

export function MarkdownViewer({
	content,
	path,
	frontmatter,
	showFrontmatter = false,
	className,
}: MarkdownViewerProps) {
	const basePath = useMemo(() => {
		const parts = path.split("/");
		parts.pop();
		return parts.join("/");
	}, [path]);

	return (
		<article className={cn("markdown-content", className)}>
			{showFrontmatter &&
				frontmatter &&
				Object.keys(frontmatter).length > 0 && (
					<FrontmatterDisplay frontmatter={frontmatter} />
				)}
			<ReactMarkdown
				remarkPlugins={[remarkGfm, remarkFrontmatter]}
				rehypePlugins={[rehypeRaw]}
				components={{
					a: ({ href, children, ...props }) => (
						<MarkdownLink href={href} basePath={basePath} {...props}>
							{children}
						</MarkdownLink>
					),
					li: ({ children, className: liClassName, ...props }) => {
						return (
							<li className={liClassName} {...props}>
								{children}
							</li>
						);
					},
					input: ({ type, checked, ...props }) => {
						if (type === "checkbox") {
							return (
								<input
									type="checkbox"
									checked={checked}
									disabled
									className="mt-1 h-4 w-4 rounded border-border"
									{...props}
								/>
							);
						}
						return <input type={type} {...props} />;
					},
					table: ({ children, ...props }) => (
						<div className="table-wrapper my-4 max-w-full overflow-x-auto">
							<table className="min-w-full border-collapse text-sm" {...props}>
								{children}
							</table>
						</div>
					),
					code: ({ className: codeClassName, children, node, ...props }) => {
						const match = /language-(\w+)/.exec(codeClassName || "");
						const language = match ? match[1] : undefined;
						const codeContent = String(children).replace(/\n$/, "");

						// Check if this is inline code by looking at the parent element
						// If the code contains newlines, it's definitely a block
						const hasNewlines = codeContent.includes("\n");
						const isInline = !hasNewlines && !codeClassName;

						if (isInline) {
							return (
								<code
									className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm"
									{...props}
								>
									{children}
								</code>
							);
						}

						if (language === "mermaid") {
							return <MermaidDiagram code={codeContent} />;
						}

						return <CodeBlock language={language} code={codeContent} />;
					},
					pre: ({ children }) => {
						return <>{children}</>;
					},
				}}
			>
				{content}
			</ReactMarkdown>
		</article>
	);
}

interface FrontmatterDisplayProps {
	frontmatter: Record<string, unknown>;
}

function FrontmatterDisplay({ frontmatter }: FrontmatterDisplayProps) {
	return (
		<div className="mb-6 rounded-md border bg-muted/30 p-4">
			<div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
				Document Metadata
			</div>
			<dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
				{Object.entries(frontmatter).map(([key, value]) => (
					<div key={key} className="contents">
						<dt className="font-medium text-muted-foreground">{key}:</dt>
						<dd>{String(value)}</dd>
					</div>
				))}
			</dl>
		</div>
	);
}
