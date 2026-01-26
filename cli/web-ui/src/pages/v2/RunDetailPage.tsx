import { useParams } from "react-router-dom";

export function RunDetailPage() {
	const { runId } = useParams();

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">Run Detail</h1>
			<p className="text-muted-foreground">Viewing run: {runId}</p>
			<p className="text-muted-foreground">
				This page will show the step timeline, artifacts, and event stream for
				the selected run.
			</p>
		</div>
	);
}
