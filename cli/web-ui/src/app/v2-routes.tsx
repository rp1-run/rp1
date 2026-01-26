import type { RouteObject } from "react-router-dom";
import {
	ArtifactViewerPage,
	HomePage,
	ProjectsPage,
	RunDetailPage,
	RunsListPage,
} from "@/pages/v2";
import { V2Layout } from "./V2Layout";

export const v2Routes: RouteObject[] = [
	{
		path: "/v2",
		element: <V2Layout />,
		children: [
			{ index: true, element: <HomePage /> },
			{ path: "runs", element: <RunsListPage /> },
			{ path: "runs/:runId", element: <RunDetailPage /> },
			{ path: "runs/:runId/artifacts/*", element: <ArtifactViewerPage /> },
			{ path: "projects", element: <ProjectsPage /> },
			{ path: "project/:projectId/runs", element: <RunsListPage /> },
		],
	},
];
