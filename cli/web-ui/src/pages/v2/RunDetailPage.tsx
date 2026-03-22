import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArtifactViewerPanel } from "@/components/v2/ArtifactViewerPanel";
import { VerticalStepList } from "@/components/v2/VerticalStepList";
import { WaitingBanner } from "@/components/v2/WaitingBanner";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useRunDetail } from "@/hooks/useRunDetail";
import {
	commandToWorkflowName,
	useWorkflowSteps,
} from "@/hooks/useWorkflowSteps";
import { cn } from "@/lib/utils";
import type { Artifact, Step } from "@/types/runs";

function MobileStepSelector({
	steps,
	selectedStepId,
	onStepSelect,
}: {
	readonly steps: readonly Step[];
	readonly selectedStepId: string | null;
	readonly onStepSelect: (stepId: string) => void;
}) {
	return (
		<div className="flex gap-sm overflow-x-auto px-md py-sm border-b border-border bg-surface-void">
			{steps.map((step) => {
				const isSelected = step.id === selectedStepId;
				return (
					<button
						key={step.id}
						type="button"
						onClick={() => onStepSelect(step.id)}
						className={cn(
							"flex-shrink-0 whitespace-nowrap rounded px-sm py-xs type-secondary transition-colors duration-150",
							isSelected
								? "bg-accent-ghost text-fg font-medium"
								: "text-fg-muted hover:text-fg",
						)}
					>
						{step.name}
					</button>
				);
			})}
		</div>
	);
}

export function RunDetailPage() {
	const { runId, stepId: urlStepId, docId: urlDocId } = useParams();
	const navigate = useNavigate();
	const { run, isLoading, error, refetch } = useRunDetail(runId);

	const workflowName = useMemo(
		() => (run ? commandToWorkflowName(run.command) : null),
		[run],
	);
	const { isLoading: isWorkflowLoading } = useWorkflowSteps(workflowName);

	const selectedStepId = urlStepId ?? null;

	const selectedArtifact = useMemo(() => {
		if (!urlDocId || !run) return null;
		return run.artifacts.find((a) => a.docId === urlDocId) ?? null;
	}, [urlDocId, run]);

	const displaySteps = useMemo<readonly Step[]>(() => {
		return run ? run.steps : [];
	}, [run]);

	const waitingPrompt = useMemo<string | null>(() => {
		if (!run || run.status !== "waiting") return null;
		const waitingEvents = run.events.filter(
			(e) => e.type === "waiting_for_user",
		);
		if (waitingEvents.length === 0) return null;
		const mostRecent = waitingEvents.reduce((latest, e) =>
			new Date(e.timestamp).getTime() > new Date(latest.timestamp).getTime()
				? e
				: latest,
		);
		return mostRecent.message || null;
	}, [run]);

	const selectedStep = useMemo(() => {
		if (!selectedStepId || !run) return null;
		return run.steps.find((s) => s.id === selectedStepId) ?? null;
	}, [selectedStepId, run]);

	const stepArtifacts = useMemo(() => {
		if (!selectedStepId || !run) return [];
		return run.artifacts.filter((a) => a.step === selectedStepId);
	}, [selectedStepId, run]);

	const { setActiveArtifact, setProject } = useBreadcrumbContext();

	useEffect(() => {
		if (run?.projectName && run?.projectId) {
			setProject(run.projectId, run.projectName);
		}
		return () => {
			setProject(null, null);
		};
	}, [run?.projectName, run?.projectId, setProject]);

	const handleStepSelect = useCallback(
		(stepId: string) => {
			if (!runId) return;
			if (run) {
				const arts = run.artifacts.filter((a) => a.step === stepId);
				if (arts.length > 0) {
					navigate(`/runs/${runId}/step/${stepId}/artifact/${arts[0].docId}`);
					return;
				}
			}
			navigate(`/runs/${runId}/step/${stepId}`);
		},
		[run, runId, navigate],
	);

	const handleArtifactSelect = useCallback(
		(artifact: Artifact) => {
			if (!runId || !selectedStepId) return;
			navigate(
				`/runs/${runId}/step/${selectedStepId}/artifact/${artifact.docId}`,
			);
		},
		[runId, selectedStepId, navigate],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: auto-select step/artifact when URL lacks them
	useEffect(() => {
		if (!run || !runId) return;
		const steps = run.steps;
		if (steps.length === 0) return;

		if (!urlStepId) {
			const runningStep = steps.find((s) => s.status === "running");
			const completedSteps = steps.filter((s) => s.status === "completed");
			const completedWithArtifacts = completedSteps.filter((s) =>
				run.artifacts.some((a) => a.step === s.id),
			);
			const targetStep =
				runningStep ??
				(completedWithArtifacts.length > 0
					? completedWithArtifacts[completedWithArtifacts.length - 1]
					: completedSteps.length > 0
						? completedSteps[completedSteps.length - 1]
						: steps[0]);
			const arts = run.artifacts.filter((a) => a.step === targetStep.id);
			if (arts.length > 0) {
				navigate(
					`/runs/${runId}/step/${targetStep.id}/artifact/${arts[0].docId}`,
					{ replace: true },
				);
			} else {
				navigate(`/runs/${runId}/step/${targetStep.id}`, { replace: true });
			}
			return;
		}

		if (urlStepId && !urlDocId) {
			const arts = run.artifacts.filter((a) => a.step === urlStepId);
			if (arts.length > 0) {
				navigate(`/runs/${runId}/step/${urlStepId}/artifact/${arts[0].docId}`, {
					replace: true,
				});
			}
		}
	}, [run, runId, urlStepId, urlDocId, navigate]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: sync breadcrumb context with URL-derived artifact
	useEffect(() => {
		if (selectedArtifact && runId) {
			setActiveArtifact(runId, selectedArtifact.path);
		} else {
			setActiveArtifact(runId ?? "", null);
		}
	}, [selectedArtifact, runId, setActiveArtifact]);

	useEffect(() => {
		return () => {
			setActiveArtifact(runId ?? "", null);
		};
	}, [runId, setActiveArtifact]);

	if (isLoading || isWorkflowLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="type-secondary text-fg-ghost">Loading...</span>
			</div>
		);
	}

	if (error) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-md">
				<p className="type-secondary text-failure">{error.message}</p>
				<div className="flex gap-sm">
					<button
						type="button"
						onClick={() => navigate("/runs")}
						className="inline-flex items-center gap-xs rounded border border-border px-sm py-xs type-secondary hover:bg-surface-base transition-colors duration-150"
					>
						<ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
						Back to Runs
					</button>
					<button
						type="button"
						onClick={refetch}
						className="inline-flex items-center gap-xs rounded border border-border px-sm py-xs type-secondary hover:bg-surface-base transition-colors duration-150"
					>
						<RefreshCw className="h-4 w-4" strokeWidth={1.5} />
						Retry
					</button>
				</div>
			</div>
		);
	}

	if (!run) {
		return (
			<div className="flex h-full flex-col items-center justify-center gap-md">
				<p className="type-secondary text-fg-ghost">Run not found</p>
				<button
					type="button"
					onClick={() => navigate("/runs")}
					className="inline-flex items-center gap-xs rounded border border-border px-sm py-xs type-secondary hover:bg-surface-base transition-colors duration-150"
				>
					<ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
					Back to Runs
				</button>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{waitingPrompt && (
				<div className="shrink-0 px-md py-sm">
					<WaitingBanner prompt={waitingPrompt} />
				</div>
			)}

			{/* Desktop: two-panel resizable layout */}
			<div className="hidden md:flex flex-1 min-h-0">
				<ResizablePanelGroup direction="horizontal">
					<ResizablePanel
						defaultSize={22}
						minSize={15}
						maxSize={50}
						className="bg-surface-void"
					>
						<div className="h-full overflow-y-auto">
							<VerticalStepList
								steps={displaySteps}
								artifacts={run.artifacts}
								agentSteps={run.agentSteps}
								selectedStepId={selectedStepId}
								onStepSelect={handleStepSelect}
								onArtifactSelect={handleArtifactSelect}
								workflowName={workflowName}
							/>
						</div>
					</ResizablePanel>

					<ResizableHandle className="cursor-col-resize" />

					<ResizablePanel defaultSize={78} minSize={40}>
						<ArtifactViewerPanel
							step={selectedStep}
							artifacts={stepArtifacts}
							selectedArtifact={selectedArtifact}
							onArtifactSelect={handleArtifactSelect}
							runId={runId}
						/>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>

			{/* Mobile: stacked layout with horizontal step selector */}
			<div className="flex flex-col flex-1 min-h-0 md:hidden">
				<MobileStepSelector
					steps={displaySteps}
					selectedStepId={selectedStepId}
					onStepSelect={handleStepSelect}
				/>

				<div className="flex-1 min-h-0 overflow-y-auto">
					<ArtifactViewerPanel
						step={selectedStep}
						artifacts={stepArtifacts}
						selectedArtifact={selectedArtifact}
						onArtifactSelect={handleArtifactSelect}
						runId={runId}
					/>
				</div>
			</div>
		</div>
	);
}
