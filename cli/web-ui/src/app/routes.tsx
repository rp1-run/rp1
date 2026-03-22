import { createBrowserRouter } from "react-router-dom";
import {
	ArtifactViewerPage,
	FileBrowserPage,
	HomePage,
	ProjectOverviewPage,
	ProjectsPage,
	RunDetailPage,
	RunsListPage,
} from "@/pages/v2";
import { V2Layout } from "./V2Layout";

export const router = createBrowserRouter([
	{
		path: "/",
		element: <V2Layout />,
		children: [
			{ index: true, element: <HomePage /> },
			{ path: "runs", element: <RunsListPage /> },
			{ path: "runs/:runId", element: <RunDetailPage /> },
			{ path: "runs/:runId/step/:stepId", element: <RunDetailPage /> },
			{
				path: "runs/:runId/step/:stepId/artifact/:docId",
				element: <RunDetailPage />,
			},
			{ path: "runs/:runId/artifacts/*", element: <ArtifactViewerPage /> },
			{ path: "projects", element: <ProjectsPage /> },
			{ path: "projects/:projectId", element: <ProjectOverviewPage /> },
			{ path: "projects/:projectId/runs", element: <RunsListPage /> },
			{ path: "projects/:projectId/files", element: <FileBrowserPage /> },
			{ path: "projects/:projectId/files/*", element: <FileBrowserPage /> },
		],
	},
]);
