import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkFrontmatter from "remark-frontmatter";
import { CodeBlock } from "./CodeBlock";
import { MermaidDiagram } from "./MermaidDiagram";
import { MarkdownLink } from "./MarkdownLink";
import { cn } from "@/lib/utils";

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
      {showFrontmatter && frontmatter && Object.keys(frontmatter).length > 0 && (
        <FrontmatterDisplay frontmatter={frontmatter} />
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkFrontmatter]}
        components={{
          h1: ({ children, ...props }) => (
            <h1 className="scroll-m-20 text-3xl font-bold tracking-tight mb-4 mt-6 first:mt-0" {...props}>
              {children}
            </h1>
          ),
          h2: ({ children, ...props }) => (
            <h2 className="scroll-m-20 text-2xl font-semibold tracking-tight mt-8 mb-4 border-b pb-2" {...props}>
              {children}
            </h2>
          ),
          h3: ({ children, ...props }) => (
            <h3 className="scroll-m-20 text-xl font-semibold tracking-tight mt-6 mb-3" {...props}>
              {children}
            </h3>
          ),
          h4: ({ children, ...props }) => (
            <h4 className="scroll-m-20 text-lg font-semibold tracking-tight mt-4 mb-2" {...props}>
              {children}
            </h4>
          ),
          h5: ({ children, ...props }) => (
            <h5 className="scroll-m-20 text-base font-semibold tracking-tight mt-4 mb-2" {...props}>
              {children}
            </h5>
          ),
          h6: ({ children, ...props }) => (
            <h6 className="scroll-m-20 text-sm font-semibold tracking-tight mt-4 mb-2 text-muted-foreground" {...props}>
              {children}
            </h6>
          ),
          p: ({ children, ...props }) => (
            <p className="leading-7 [&:not(:first-child)]:mt-4" {...props}>
              {children}
            </p>
          ),
          a: ({ href, children, ...props }) => (
            <MarkdownLink href={href} basePath={basePath} {...props}>
              {children}
            </MarkdownLink>
          ),
          ul: ({ children, ...props }) => (
            <ul className="my-4 ml-6 list-disc [&>li]:mt-2" {...props}>
              {children}
            </ul>
          ),
          ol: ({ children, ...props }) => (
            <ol className="my-4 ml-6 list-decimal [&>li]:mt-2" {...props}>
              {children}
            </ol>
          ),
          li: ({ children, className: liClassName, ...props }) => {
            const isTaskItem = liClassName?.includes("task-list-item");
            return (
              <li className={cn(isTaskItem && "list-none ml-0 flex items-start gap-2", liClassName)} {...props}>
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
          blockquote: ({ children, ...props }) => (
            <blockquote className="mt-4 border-l-4 border-terminal-green pl-4 italic text-muted-foreground" {...props}>
              {children}
            </blockquote>
          ),
          hr: (props) => <hr className="my-6 border-border" {...props} />,
          table: ({ children, ...props }) => (
            <div className="my-4 w-full overflow-x-auto">
              <table className="w-full border-collapse text-sm" {...props}>
                {children}
              </table>
            </div>
          ),
          thead: ({ children, ...props }) => (
            <thead className="border-b bg-muted/50" {...props}>
              {children}
            </thead>
          ),
          tbody: ({ children, ...props }) => (
            <tbody className="[&>tr:nth-child(even)]:bg-muted/30" {...props}>
              {children}
            </tbody>
          ),
          tr: ({ children, ...props }) => (
            <tr className="border-b border-border" {...props}>
              {children}
            </tr>
          ),
          th: ({ children, style, ...props }) => (
            <th
              className="px-3 py-2 text-left font-semibold"
              style={style}
              {...props}
            >
              {children}
            </th>
          ),
          td: ({ children, style, ...props }) => (
            <td className="px-3 py-2" style={style} {...props}>
              {children}
            </td>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const match = /language-(\w+)/.exec(codeClassName || "");
            const language = match ? match[1] : undefined;
            const isInline = !codeClassName;

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

            const codeContent = String(children).replace(/\n$/, "");

            if (language === "mermaid") {
              return <MermaidDiagram code={codeContent} />;
            }

            return (
              <CodeBlock language={language} code={codeContent} />
            );
          },
          pre: ({ children }) => {
            return <>{children}</>;
          },
          strong: ({ children, ...props }) => (
            <strong className="font-bold" {...props}>
              {children}
            </strong>
          ),
          em: ({ children, ...props }) => (
            <em className="italic" {...props}>
              {children}
            </em>
          ),
          del: ({ children, ...props }) => (
            <del className="line-through text-muted-foreground" {...props}>
              {children}
            </del>
          ),
          img: ({ src, alt, ...props }) => (
            <img
              src={src}
              alt={alt || ""}
              className="my-4 max-w-full rounded-md"
              loading="lazy"
              {...props}
            />
          ),
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
