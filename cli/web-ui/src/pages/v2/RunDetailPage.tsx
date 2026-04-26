import { useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { RunDetailSurface } from "@/components/v2/RunDetailSurface";

export function RunDetailPage() {
	const { runId, stepId: urlStepId, docId: urlDocId } = useParams();
	const navigate = useNavigate();
	const handleRouteReplace = useCallback(
		(route: string) => {
			navigate(route, { replace: true });
		},
		[navigate],
	);
	const handleArtifactRouteSelect = useCallback(
		(route: string) => {
			navigate(route);
		},
		[navigate],
	);
	const handleBackToRuns = useCallback(() => {
		navigate("/runs");
	}, [navigate]);

	return (
		<RunDetailSurface
			runId={runId}
			routeStepId={urlStepId ?? null}
			routeDocId={urlDocId ?? null}
			mode="workspace"
			onRouteReplace={handleRouteReplace}
			onArtifactRouteSelect={handleArtifactRouteSelect}
			onBackToRuns={handleBackToRuns}
		/>
	);
}
