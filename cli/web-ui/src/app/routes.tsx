import { createBrowserRouter, Navigate, useParams } from "react-router-dom";
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

function RunsRedirect() {
	return <Navigate to="/" replace />;
}

function StepRedirect() {
	const { runId, stepId } = useParams();
	return <Navigate to={`/runs/${runId}/step/${stepId}`} replace />;
}

export const router = createBrowserRouter([
	{
		path: "/",
		element: <V2Layout />,
		children: [
			{ index: true, element: <HomePage /> },
			{ path: "runs", element: <RunsRedirect /> },
			{ path: "runs/:runId", element: <RunDetailPage /> },
			{ path: "runs/:runId/step/:stepId", element: <RunDetailPage /> },
			{
				path: "runs/:runId/step/:stepId/artifact/:docId",
				element: <RunDetailPage />,
			},
			{
				path: "runs/:runId/step/:stepId/artifact",
				element: <StepRedirect />,
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
