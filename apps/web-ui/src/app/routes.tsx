import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { Layout } from "./Layout";
import { FileText, AlertCircle, Loader2 } from "lucide-react";
import { useFileContent } from "@/hooks/useFileContent";
import { MarkdownViewer } from "@/components/MarkdownViewer";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Layout />,
    children: [
      {
        index: true,
        element: <Navigate to="/view/context/index.md" replace />,
      },
      {
        path: "view/*",
        element: <ContentView />,
      },
    ],
  },
]);

function ContentView() {
  const params = useParams();
  const path = params["*"] || null;
  const { content, loading, error } = useFileContent(path);

  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">Select a file from the sidebar to view its contents.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-8 w-8 mb-4 animate-spin" />
        <p className="text-sm">Loading content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-destructive">
        <AlertCircle className="h-12 w-12 mb-4 opacity-70" />
        <p className="text-lg mb-2">Failed to load content</p>
        <p className="text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  if (!content) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">No content available.</p>
      </div>
    );
  }

  if (content.mimeType === "text/markdown" || path.endsWith(".md")) {
    return (
      <MarkdownViewer
        content={content.content}
        path={content.path}
        frontmatter={content.frontmatter}
        showFrontmatter={false}
      />
    );
  }

  return (
    <div className="rounded-lg border bg-muted/50 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-3 pb-2 border-b">
        <FileText className="h-3.5 w-3.5" />
        <span>{path}</span>
        <span className="ml-auto">{content.mimeType}</span>
      </div>
      <pre className="text-sm overflow-x-auto whitespace-pre-wrap">
        <code>{content.content}</code>
      </pre>
    </div>
  );
}
