import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
import { Layout } from "./Layout";
import { FileText } from "lucide-react";

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
        element: <ContentPlaceholder />,
      },
    ],
  },
]);

function ContentPlaceholder() {
  const params = useParams();
  const path = params["*"];

  if (!path) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
        <FileText className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-lg">Select a file from the sidebar to view its contents.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
      <FileText className="h-12 w-12 mb-4 opacity-50" />
      <p className="text-lg mb-2">Viewing: <code className="bg-muted px-2 py-1 rounded">{path}</code></p>
      <p className="text-sm">Markdown rendering will be available in Milestone 4.</p>
    </div>
  );
}
