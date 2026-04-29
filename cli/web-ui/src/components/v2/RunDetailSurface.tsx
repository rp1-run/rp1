import {
	AlertCircle,
	ArrowLeft,
	Ban,
	Check,
	Loader2,
	OctagonX,
	RefreshCw,
	Workflow,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogOverlay,
	DialogPortal,
} from "@/components/ui/dialog";
import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@/components/ui/resizable";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/ui/tooltip";
import { useBreadcrumbContext } from "@/hooks/useBreadcrumbContext";
import { useContextualShortcuts } from "@/hooks/useContextualShortcuts";
import { useRunDetail } from "@/hooks/useRunDetail";
import {
	commandToWorkflowName,
	useWorkflowSteps,
} from "@/hooks/useWorkflowSteps";
import { useWorkspaceDescriptor } from "@/hooks/useWorkspaceDescriptor";
import {
	buildArtifactRoute,
	groupArtifactsByWorkflowStep,
} from "@/lib/artifact-groups";
import { resolveRunDisplayName } from "@/lib/run-display";
import {
	getSocraticDuelStepLabel,
	isSocraticDuelFlow,
} from "@/lib/socratic-duel-status";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact, Run, Step } from "@/types/runs";
import { RunArtifactsPanel } from "./RunArtifactsPanel";
import { RunInvocationCard } from "./RunInvocationCard";
import { VerticalStepList } from "./VerticalStepList";

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

export type RunDetailSurfaceMode = "workspace" | "activity-preview";

export interface RunDetailSurfaceProps {
	readonly runId: string | undefined;
	readonly routeStepId?: string | null;
	readonly routeDocId?: string | null;
	readonly mode: RunDetailSurfaceMode;
	readonly onRouteReplace?: (route: string) => void;
	readonly onArtifactRouteSelect?: (route: string) => void;
	readonly onBackToRuns?: () => void;
}

export interface RunDetailTarget {
	readonly stepId: string;
	readonly artifact: Artifact | null;
}

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

function WorkflowStepsToggleButton({
	onOpen,
}: {
	readonly onOpen: () => void;
}) {
	return (
		<TooltipProvider>
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						variant="ghost"
						size="icon"
						className="h-8 w-8 relative"
						onClick={onOpen}
						aria-label="Open workflow steps"
						aria-expanded="false"
					>
						<Workflow
							className="h-4 w-4"
							strokeWidth={1.5}
							aria-hidden="true"
						/>
					</Button>
				</TooltipTrigger>
				<TooltipContent>
					<p>Workflow steps</p>
				</TooltipContent>
			</Tooltip>
		</TooltipProvider>
	);
}

export function selectDefaultRunTarget(run: Run): RunDetailTarget | null {
	const steps = run.steps;
	if (steps.length === 0) return null;
	const fallbackStep = steps[0];
	if (!fallbackStep) return null;

	const currentStep =
		run.currentStep != null
			? (steps.find((step) => step.id === run.currentStep) ?? null)
			: null;
	const waitingStep = steps.find((step) => step.status === "waiting");
	const runningStep = steps.find((step) => step.status === "running");
	const completedSteps = steps.filter((step) => step.status === "completed");
	const completedWithArtifacts = completedSteps.filter((step) =>
		run.artifacts.some((artifact) => artifact.step === step.id),
	);
	const targetStep =
		currentStep ??
		waitingStep ??
		runningStep ??
		completedWithArtifacts.at(-1) ??
		completedSteps.at(-1) ??
		fallbackStep;
	const artifact =
		run.artifacts.find(
			(candidate) => candidate.step === targetStep.id && candidate.docId,
		) ??
		run.artifacts.find((candidate) => candidate.docId) ??
		null;

	return {
		stepId: artifact?.step ?? targetStep.id,
		artifact,
	};
}

export function RunDetailSurface({
	runId,
	routeStepId = null,
	routeDocId = null,
	mode,
	onRouteReplace,
	onArtifactRouteSelect,
	onBackToRuns,
}: RunDetailSurfaceProps) {
	const { run, isLoading, error, refetch } = useRunDetail(runId);
	const [endingOutcome, setEndingOutcome] = useState<
		"cancelled" | "abandoned" | null
	>(null);
	const [endRunError, setEndRunError] = useState<string | null>(null);
	const [confirmAction, setConfirmAction] = useState<
		"cancelled" | "abandoned" | null
	>(null);
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
	const [previewDocId, setPreviewDocId] = useState<string | null>(null);
	const [stepPanelOpen, setStepPanelOpen] = useState(false);

	const workflowName = useMemo(
		() => (run ? commandToWorkflowName(run.command) : null),
		[run],
	);
	const { isLoading: isWorkflowLoading } = useWorkflowSteps(workflowName);

	const defaultTarget = useMemo(() => {
		return run ? selectDefaultRunTarget(run) : null;
	}, [run]);

	useEffect(() => {
		if (mode !== "activity-preview") return;
		setPreviewDocId(defaultTarget?.artifact?.docId ?? null);
	}, [mode, defaultTarget?.artifact?.docId]);

	const selectedArtifact = useMemo(() => {
		if (!run) return null;
		const selectedDocId =
			mode === "workspace" ? routeDocId : (previewDocId ?? routeDocId);
		if (!selectedDocId) return null;
		return (
			run.artifacts.find((artifact) => artifact.docId === selectedDocId) ?? null
		);
	}, [mode, previewDocId, routeDocId, run]);
	const routeFocusedStepId =
		(mode === "workspace" ? routeStepId : null) ??
		selectedArtifact?.step ??
		defaultTarget?.stepId ??
		run?.currentStep ??
		run?.steps[0]?.id ??
		null;
	const [focusedStepId, setFocusedStepId] = useState<string | null>(null);
	const selectedStepId = focusedStepId ?? routeFocusedStepId;

	useEffect(() => {
		setFocusedStepId(routeFocusedStepId);
	}, [routeFocusedStepId]);

	const workspaceSubtitle = useMemo(() => {
		if (!run) return null;
		const artifactName = selectedArtifact?.path.split("/").at(-1) ?? null;
		return artifactName ?? run.projectName;
	}, [run, selectedArtifact]);

	const displaySteps = useMemo<readonly Step[]>(() => {
		return run ? run.steps : [];
	}, [run]);

	const artifactGroups = useMemo(() => {
		return run ? groupArtifactsByWorkflowStep(run.artifacts, run.steps) : [];
	}, [run]);

	const currentStepName = useMemo(() => {
		if (!run?.currentStep) return null;
		if (isSocraticDuelFlow(run.command)) {
			const label = getSocraticDuelStepLabel(run.currentStep);
			if (label) return label;
		}
		return (
			run.steps.find((step) => step.id === run.currentStep)?.name ??
			run.currentStep
		);
	}, [run]);
	const headerStatusMessage =
		run?.statusMessage && run.statusMessage !== currentStepName
			? run.statusMessage
			: null;

	const subflowDiagram = useMemo(() => {
		if (!selectedStepId || !run?.subflows) return null;
		return run.subflows[selectedStepId] ?? null;
	}, [selectedStepId, run?.subflows]);

	const {
		setActiveArtifact,
		setProject,
		setRunInfo,
		setHeaderLeft,
		setHeaderRight,
	} = useBreadcrumbContext();
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
					const errorBody = (await response.json().catch(() => null)) as {
						error?: string;
					} | null;
					if (typeof errorBody?.error === "string") {
						message = errorBody.error;
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
		if (mode !== "workspace") return;
		if (run?.projectName && run?.projectId) {
			setProject(run.projectId, run.projectName);
			setProjectId(run.projectId);
		}
		return () => {
			setProject(null, null);
			setProjectId(null);
		};
	}, [mode, run?.projectName, run?.projectId, setProject, setProjectId]);

	useEffect(() => {
		if (mode !== "workspace") return;
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
	}, [mode, run, setRunInfo]);

	useEffect(() => {
		if (mode !== "workspace") return;
		if (run) {
			const canEnd = !TERMINAL_RUN_STATUSES.has(run.status);

			const statusIndicator =
				run.status === "running" ? (
					<Loader2
						size={16}
						strokeWidth={1.5}
						className="animate-spin text-fg-muted"
					/>
				) : run.status === "completed" ? (
					<Check size={16} strokeWidth={1.5} className="text-fg-ghost" />
				) : run.status === "failed" || run.status === "abandoned" ? (
					<AlertCircle
						size={16}
						strokeWidth={1.5}
						className="text-accent-amber"
					/>
				) : run.status === "waiting" ? (
					<span className="flex items-center justify-center h-4 w-4">
						<span className="h-2 w-2 rounded-full bg-accent-amber animate-pulse" />
					</span>
				) : null;

			setHeaderLeft(null);
			setHeaderRight(
				<>
					{statusIndicator}
					{currentStepName && (
						<span className="type-secondary text-fg-ghost">
							Current step: {currentStepName}
						</span>
					)}
					{headerStatusMessage && (
						<span className="min-w-0 max-w-[42vw] truncate type-secondary italic text-fg-ghost">
							{headerStatusMessage}
						</span>
					)}
					{canEnd && (
						<>
							<button
								type="button"
								title="Abandon Run"
								aria-label="Abandon Run"
								disabled={endingOutcome !== null}
								onClick={() => setConfirmAction("abandoned")}
								className="text-fg-muted hover:text-fg transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
							>
								<Ban size={16} strokeWidth={1.5} />
							</button>
							<button
								type="button"
								title="Cancel Run"
								aria-label="Cancel Run"
								disabled={endingOutcome !== null}
								onClick={() => setConfirmAction("cancelled")}
								className="text-fg-muted hover:text-accent-amber transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none"
							>
								<OctagonX size={16} strokeWidth={1.5} />
							</button>
						</>
					)}
				</>,
			);
		}
		return () => {
			setHeaderLeft(null);
			setHeaderRight(null);
		};
	}, [
		mode,
		run,
		currentStepName,
		headerStatusMessage,
		endingOutcome,
		setHeaderLeft,
		setHeaderRight,
	]);

	const handleStepSelect = useCallback((stepId: string) => {
		setFocusedStepId(stepId);
	}, []);

	const handleArtifactSelect = useCallback(
		(artifact: Artifact) => {
			if (!runId) return;
			setFocusedStepId(artifact.step ?? null);
			if (mode === "workspace") {
				onArtifactRouteSelect?.(buildArtifactRoute(runId, artifact));
				return;
			}
			setPreviewDocId(artifact.docId);
		},
		[mode, runId, onArtifactRouteSelect],
	);

	useEffect(() => {
		if (mode !== "workspace") return;
		if (!run || !runId || routeStepId || routeDocId || !defaultTarget) return;

		if (defaultTarget.artifact) {
			onRouteReplace?.(buildArtifactRoute(runId, defaultTarget.artifact));
		} else {
			onRouteReplace?.(`/runs/${runId}/step/${defaultTarget.stepId}`);
		}
	}, [
		mode,
		run,
		runId,
		routeStepId,
		routeDocId,
		defaultTarget,
		onRouteReplace,
	]);

	useEffect(() => {
		if (mode !== "workspace") return;
		if (selectedArtifact && runId) {
			setActiveArtifact(runId, selectedArtifact.path);
		} else {
			setActiveArtifact(runId ?? "", null);
		}
	}, [mode, selectedArtifact, runId, setActiveArtifact]);

	useEffect(() => {
		if (mode !== "workspace") return;
		return () => {
			setActiveArtifact(runId ?? "", null);
		};
	}, [mode, runId, setActiveArtifact]);

	const { workspaceCommands } = useWorkspaceDescriptor({
		title:
			mode === "workspace" && run
				? resolveRunDisplayName(run) || run.command
				: null,
		subtitle: mode === "workspace" ? workspaceSubtitle : null,
		projectId: mode === "workspace" ? (run?.projectId ?? null) : null,
		unavailable:
			mode === "workspace" &&
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
		enabled: mode === "workspace" && !!runId,
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
					{onBackToRuns && (
						<button
							type="button"
							onClick={onBackToRuns}
							className="inline-flex items-center gap-xs rounded border border-border px-sm py-xs type-secondary hover:bg-surface-base transition-colors duration-150"
						>
							<ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
							Back to Runs
						</button>
					)}
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
				{onBackToRuns && (
					<button
						type="button"
						onClick={onBackToRuns}
						className="inline-flex items-center gap-xs rounded border border-border px-sm py-xs type-secondary hover:bg-surface-base transition-colors duration-150"
					>
						<ArrowLeft className="h-4 w-4" strokeWidth={1.5} />
						Back to Runs
					</button>
				)}
			</div>
		);
	}

	const bodyStatusMessage =
		run.error && run.error !== headerStatusMessage ? run.error : null;

	const artifactPanel = (
		<RunArtifactsPanel
			artifactGroups={artifactGroups}
			selectedArtifact={selectedArtifact}
			onArtifactSelect={handleArtifactSelect}
			runId={runId}
			subflowDiagram={subflowDiagram}
			showFrontmatter={showFrontmatter}
			leadingControl={
				stepPanelOpen ? undefined : (
					<WorkflowStepsToggleButton onOpen={() => setStepPanelOpen(true)} />
				)
			}
		/>
	);

	return (
		<div className="flex h-full flex-col">
			{showMetadata && <RunInvocationCard invocation={run.invocation} />}

			{(bodyStatusMessage || endRunError) && (
				<div className="border-b border-border px-md py-sm">
					{bodyStatusMessage && (
						<p className="type-secondary text-fg-muted">{bodyStatusMessage}</p>
					)}
					{endRunError && (
						<p className="pt-xs type-secondary text-failure">{endRunError}</p>
					)}
				</div>
			)}

			<div className="hidden md:flex flex-1 min-h-0">
				{stepPanelOpen ? (
					<ResizablePanelGroup direction="horizontal">
						<ResizablePanel
							defaultSize={22}
							minSize={15}
							maxSize={50}
							className="bg-surface-void"
						>
							<div className="flex h-full flex-col">
								<header className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
									<div className="flex items-center gap-2">
										<Workflow
											className="h-3.5 w-3.5 text-fg-ghost"
											strokeWidth={1.5}
										/>
										<h2 className="type-secondary text-fg-muted tracking-wider uppercase">
											Steps
										</h2>
									</div>
									<button
										type="button"
										onClick={() => setStepPanelOpen(false)}
										className="text-fg-ghost transition-colors duration-150 hover:text-fg"
										aria-label="Close workflow steps panel"
										title="Close workflow steps panel"
									>
										<X className="h-3.5 w-3.5" strokeWidth={1.5} />
									</button>
								</header>
								<div className="min-h-0 flex-1 overflow-y-auto">
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
							</div>
						</ResizablePanel>

						<ResizableHandle className="cursor-col-resize" />

						<ResizablePanel defaultSize={78} minSize={40}>
							{artifactPanel}
						</ResizablePanel>
					</ResizablePanelGroup>
				) : (
					<div className="min-w-0 flex-1 overflow-hidden">{artifactPanel}</div>
				)}
			</div>

			<div className="flex flex-col flex-1 min-h-0 md:hidden">
				<MobileStepSelector
					steps={displaySteps}
					selectedStepId={selectedStepId}
					onStepSelect={handleStepSelect}
				/>

				<div className="flex-1 min-h-0 overflow-y-auto">
					<RunArtifactsPanel
						artifactGroups={artifactGroups}
						selectedArtifact={selectedArtifact}
						onArtifactSelect={handleArtifactSelect}
						runId={runId}
						subflowDiagram={subflowDiagram}
						showFrontmatter={showFrontmatter}
					/>
				</div>
			</div>

			<Dialog
				open={confirmAction !== null}
				onOpenChange={(open) => {
					if (!open) setConfirmAction(null);
				}}
			>
				<DialogPortal>
					<DialogOverlay className="bg-black/50" />
					<div className="fixed inset-0 z-50 flex items-center justify-center">
						<div className="w-full max-w-sm rounded border border-border bg-surface p-lg shadow-sm">
							<p className="font-mono text-[13px] text-fg">
								{confirmAction === "abandoned"
									? "Abandon this run? Progress will be marked as abandoned."
									: "Cancel this run? The running process will be stopped."}
							</p>
							<div className="mt-md flex justify-end gap-sm">
								<DialogClose asChild>
									<button
										type="button"
										className="rounded px-sm py-xs font-mono text-[12px] text-fg-ghost hover:text-fg transition-colors duration-150"
									>
										Dismiss
									</button>
								</DialogClose>
								<button
									type="button"
									className="rounded px-sm py-xs font-mono text-[12px] text-accent-amber hover:text-fg transition-colors duration-150"
									onClick={() => {
										if (confirmAction) {
											handleEndRun(confirmAction);
										}
										setConfirmAction(null);
									}}
								>
									Confirm
								</button>
							</div>
						</div>
					</div>
				</DialogPortal>
			</Dialog>
		</div>
	);
}
