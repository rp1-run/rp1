import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "./Layout";

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
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <p>Select a file from the sidebar to view its contents.</p>
    </div>
  );
}
