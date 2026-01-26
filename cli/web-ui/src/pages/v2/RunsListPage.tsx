import { useParams } from "react-router-dom";

export function RunsListPage() {
	const { projectId } = useParams();

	return (
		<div className="space-y-6">
			<h1 className="text-2xl font-semibold">Runs</h1>
			{projectId && (
				<p className="text-muted-foreground">
					Showing runs for project: {projectId}
				</p>
			)}
			<p className="text-muted-foreground">
				This page will display a filterable list of all agent runs.
			</p>
		</div>
	);
}
