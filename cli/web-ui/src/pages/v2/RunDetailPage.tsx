import { ArrowLeft, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import { ArtifactViewerPanel } from "@/components/v2/ArtifactViewerPanel";
import { RunInvocationCard } from "@/components/v2/RunInvocationCard";
import { StatusBadge } from "@/components/v2/StatusBadge";
import { VerticalStepList } from "@/components/v2/VerticalStepList";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { useRunDetail } from "@/hooks/useRunDetail";
import {
	commandToWorkflowName,
	useWorkflowSteps,
} from "@/hooks/useWorkflowSteps";
import { useWorkspaceDescriptor } from "@/hooks/useWorkspaceDescriptor";
import { resolveRunDisplayName } from "@/lib/run-display";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact, Step } from "@/types/runs";

const STORAGE_KEY_RUN_DETAIL_METADATA_VISIBLE =
	"rp1-run-detail-metadata-visible";
const STORAGE_KEY_ARTIFACT_FRONTMATTER_VISIBLE =
	"rp1-artifact-frontmatter-visible";
const TERMINAL_RUN_STATUSES = new Set([
	"completed",
	"failed",
	"cancelled",
	"abandoned",
]);

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
	const [endingOutcome, setEndingOutcome] = useState<
		"cancelled" | "abandoned" | null
	>(null);
	const [endRunError, setEndRunError] = useState<string | null>(null);
	const [showMetadata, setShowMetadata] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return (
			sessionStorage.getItem(STORAGE_KEY_RUN_DETAIL_METADATA_VISIBLE) === "true"
		);
	});
	const [showFrontmatter, setShowFrontmatter] = useState<boolean>(() => {
		if (typeof window === "undefined") return false;
		return (
			sessionStorage.getItem(STORAGE_KEY_ARTIFACT_FRONTMATTER_VISIBLE) ===
			"true"
		);
	});

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
	const workspaceSubtitle = useMemo(() => {
		if (!run) return null;
		const artifactName = selectedArtifact?.path.split("/").at(-1) ?? null;
		return artifactName ?? run.projectName;
	}, [run, selectedArtifact]);

	const displaySteps = useMemo<readonly Step[]>(() => {
		return run ? run.steps : [];
	}, [run]);

	const selectedStep = useMemo(() => {
		if (!selectedStepId || !run) return null;
		return run.steps.find((s) => s.id === selectedStepId) ?? null;
	}, [selectedStepId, run]);
	const currentStepName = useMemo(() => {
		if (!run?.currentStep) return null;
		return (
			run.steps.find((step) => step.id === run.currentStep)?.name ??
			run.currentStep
		);
	}, [run]);

	const stepArtifacts = useMemo(() => {
		if (!selectedStepId || !run) return [];
		return run.artifacts.filter((a) => a.step === selectedStepId);
	}, [selectedStepId, run]);

	const subflowDiagram = useMemo(() => {
		if (!selectedStepId || !run?.subflows) return null;
		return run.subflows[selectedStepId] ?? null;
	}, [selectedStepId, run?.subflows]);

	const { setActiveArtifact, setProject, setRunInfo } = useBreadcrumbContext();
	const { setProjectId } = useWebSocket();

	const handleToggleMetadata = useCallback(() => {
		setShowMetadata((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				sessionStorage.setItem(
					STORAGE_KEY_RUN_DETAIL_METADATA_VISIBLE,
					String(next),
				);
			}
			return next;
		});
	}, []);

	const handleToggleFrontmatter = useCallback(() => {
		setShowFrontmatter((prev) => {
			const next = !prev;
			if (typeof window !== "undefined") {
				sessionStorage.setItem(
					STORAGE_KEY_ARTIFACT_FRONTMATTER_VISIBLE,
					String(next),
				);
			}
			return next;
		});
	}, []);

	const handleEndRun = useCallback(
		async (outcome: "cancelled" | "abandoned") => {
			if (!runId) return;

			setEndingOutcome(outcome);
			setEndRunError(null);

			try {
				const response = await fetch(`/api/v2/runs/${runId}/end`, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ outcome }),
				});

				if (!response.ok) {
					let message = `Failed to end run: ${response.statusText}`;
					try {
						const errorBody = (await response.json()) as { error?: string };
						if (typeof errorBody.error === "string") {
							message = errorBody.error;
						}
					} catch {
						// Ignore body parse failures and fall back to status text
					}
					throw new Error(message);
				}

				refetch();
			} catch (err) {
				setEndRunError(
					err instanceof Error ? err.message : "Failed to end run",
				);
			} finally {
				setEndingOutcome(null);
			}
		},
		[runId, refetch],
	);

	useEffect(() => {
		if (run?.projectName && run?.projectId) {
			setProject(run.projectId, run.projectName);
			setProjectId(run.projectId);
		}
		return () => {
			setProject(null, null);
			setProjectId(null);
		};
	}, [run?.projectName, run?.projectId, setProject, setProjectId]);

	useEffect(() => {
		if (run) {
			setRunInfo({
				startedAt: run.startedAt,
				harness: run.harness,
				command: run.command,
				displayName: resolveRunDisplayName(run) || run.command,
				projectName: run.projectName,
				projectId: run.projectId,
			});
		}
		return () => {
			setRunInfo(null);
		};
	}, [run, setRunInfo]);

	const handleStepSelect = useCallback(
		(stepId: string) => {
			if (!runId) return;
			if (run) {
				const hasSubflow = run.subflows && run.subflows[stepId] !== undefined;
				if (!hasSubflow) {
					const art = run.artifacts.find((a) => a.step === stepId && a.docId);
					if (art) {
						navigate(`/runs/${runId}/step/${stepId}/artifact/${art.docId}`);
						return;
					}
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

	useEffect(() => {
		if (!run || !runId) return;
		const steps = run.steps;
		if (steps.length === 0) return;

		if (!urlStepId) {
			const currentStep =
				run.currentStep != null
					? (steps.find((step) => step.id === run.currentStep) ?? null)
					: null;
			const waitingStep = steps.find((step) => step.status === "waiting");
			const runningStep = steps.find((s) => s.status === "running");
			const completedSteps = steps.filter((s) => s.status === "completed");
			const completedWithArtifacts = completedSteps.filter((s) =>
				run.artifacts.some((a) => a.step === s.id),
			);
			const targetStep =
				currentStep ??
				waitingStep ??
				runningStep ??
				(completedWithArtifacts.length > 0
					? completedWithArtifacts[completedWithArtifacts.length - 1]
					: completedSteps.length > 0
						? completedSteps[completedSteps.length - 1]
						: steps[0]);
			const art = run.artifacts.find(
				(a) => a.step === targetStep.id && a.docId,
			);
			if (art) {
				navigate(`/runs/${runId}/step/${targetStep.id}/artifact/${art.docId}`, {
					replace: true,
				});
			} else {
				navigate(`/runs/${runId}/step/${targetStep.id}`, { replace: true });
			}
			return;
		}

		if (urlStepId && !urlDocId) {
			const hasSubflow = run.subflows && run.subflows[urlStepId] !== undefined;
			if (!hasSubflow) {
				const art = run.artifacts.find((a) => a.step === urlStepId && a.docId);
				if (art) {
					navigate(`/runs/${runId}/step/${urlStepId}/artifact/${art.docId}`, {
						replace: true,
					});
				}
			}
		}
	}, [run, runId, urlStepId, urlDocId, navigate]);

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

	const { workspaceCommands } = useWorkspaceDescriptor({
		title: run ? resolveRunDisplayName(run) || run.command : null,
		subtitle: workspaceSubtitle,
		projectId: run?.projectId ?? null,
		unavailable:
			!isLoading &&
			(error?.message === "Run not found" || (!error && run === null)),
	});

	useContextualShortcuts({
		viewId: "run-detail",
		viewLabel: "Run Detail",
		shortcuts: [],
		commands: [
			...workspaceCommands,
			...(run?.invocation
				? [
						{
							id: "toggle-run-metadata",
							label: showMetadata ? "Hide Debug Info" : "Show Debug Info",
							description: showMetadata
								? "Hide invocation metadata for this run"
								: "Show invocation metadata for this run",
							keywords: ["debug", "invocation", "metadata", "run details"],
							action: handleToggleMetadata,
						},
					]
				: []),
			...(selectedArtifact
				? [
						{
							id: "toggle-run-frontmatter",
							label: showFrontmatter ? "Hide Frontmatter" : "Show Frontmatter",
							description: showFrontmatter
								? "Hide frontmatter in the current artifact viewer"
								: "Show frontmatter in the current artifact viewer",
							keywords: ["frontmatter", "metadata", "yaml", "artifact"],
							action: handleToggleFrontmatter,
						},
					]
				: []),
		],
		enabled: !!runId,
	});

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

	const canEndRun = !TERMINAL_RUN_STATUSES.has(run.status);
	const statusMessage = run.statusMessage ?? run.error;

	return (
		<div className="flex h-full flex-col">
			{showMetadata && <RunInvocationCard invocation={run.invocation} />}

			<div className="border-b border-border bg-surface-base/60 px-md py-sm">
				<div className="flex flex-col gap-sm lg:flex-row lg:items-start lg:justify-between">
					<div className="min-w-0 space-y-2">
						<div className="flex flex-wrap items-center gap-sm">
							<StatusBadge status={run.status} size="sm" />
							{currentStepName && (
								<span className="type-secondary text-fg-ghost">
									Current step: {currentStepName}
								</span>
							)}
						</div>
						{statusMessage && (
							<p className="type-secondary text-fg-muted">{statusMessage}</p>
						)}
					</div>

					{canEndRun && (
						<div className="flex flex-wrap items-center gap-xs">
							<Button
								type="button"
								size="sm"
								variant="outline"
								disabled={endingOutcome !== null}
								onClick={() => handleEndRun("abandoned")}
							>
								{endingOutcome === "abandoned" ? "Abandoning..." : "Abandon"}
							</Button>
							<Button
								type="button"
								size="sm"
								variant="destructive"
								disabled={endingOutcome !== null}
								onClick={() => handleEndRun("cancelled")}
							>
								{endingOutcome === "cancelled" ? "Cancelling..." : "Cancel Run"}
							</Button>
						</div>
					)}
				</div>

				{endRunError && (
					<p className="pt-xs type-secondary text-failure">{endRunError}</p>
				)}
			</div>

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
								harness={run.harness}
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
							subflowDiagram={subflowDiagram}
							showFrontmatter={showFrontmatter}
						/>
					</ResizablePanel>
				</ResizablePanelGroup>
			</div>

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
						subflowDiagram={subflowDiagram}
						showFrontmatter={showFrontmatter}
					/>
				</div>
			</div>
		</div>
	);
}
