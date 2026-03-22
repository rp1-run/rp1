import {
	BarChart3,
	Check,
	ChevronRight,
	Circle,
	Code,
	File,
	FileText,
	GitCompare,
	Image,
	Minus,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type {
	AgentTask,
	Artifact,
	ArtifactType,
	Step,
	StepStatus,
} from "@/types/runs";

export interface VerticalStepListProps {
	readonly steps: readonly Step[];
	readonly artifacts: readonly Artifact[];
	readonly agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null;
	readonly selectedStepId: string | null;
	readonly onStepSelect: (stepId: string) => void;
	readonly onArtifactSelect: (artifact: Artifact) => void;
	readonly workflowName?: string | null;
}

const artifactIconMap: Record<ArtifactType, typeof FileText> = {
	markdown: FileText,
	code: Code,
	diff: GitCompare,
	report: BarChart3,
	diagram: Image,
	other: File,
};

function formatStepDuration(
	startedAt: string | null,
	completedAt: string | null,
): string | null {
	if (!startedAt) return null;
	const start = new Date(startedAt);
	const end = completedAt ? new Date(completedAt) : new Date();
	const diffMs = end.getTime() - start.getTime();
	const diffSeconds = Math.floor(diffMs / 1000);
	const diffMinutes = Math.floor(diffSeconds / 60);
	const diffHours = Math.floor(diffMinutes / 60);

	if (diffHours > 0) {
		return `${diffHours}h ${diffMinutes % 60}m`;
	}
	if (diffMinutes > 0) {
		return `${diffMinutes}m ${diffSeconds % 60}s`;
	}
	return `${diffSeconds}s`;
}

function StatusDot({ status }: { readonly status: StepStatus }) {
	switch (status) {
		case "completed":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Completed"
				>
					<Check className="h-3 w-3 text-fg-ghost" strokeWidth={2} />
				</span>
			);
		case "running":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Running"
				>
					<span className="block h-2.5 w-2.5 rounded-full bg-accent-amber animate-status-pulse" />
				</span>
			);
		case "not_started":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Pending"
				>
					<Circle className="h-3 w-3 text-fg-ghost" strokeWidth={1.5} />
				</span>
			);
		case "waiting":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Waiting"
				>
					<span className="block h-2.5 w-2.5 rounded-full bg-accent-amber" />
				</span>
			);
		case "failed":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Failed"
				>
					<span className="block h-2.5 w-2.5 rounded-full bg-failure" />
				</span>
			);
		case "skipped":
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Skipped"
				>
					<Minus className="h-3 w-3 text-fg-ghost" strokeWidth={2} />
				</span>
			);
		default:
			return (
				<span
					role="img"
					className="flex h-5 w-5 items-center justify-center rounded-full bg-surface-base"
					aria-label="Unknown"
				>
					<Circle className="h-3 w-3 text-fg-ghost" strokeWidth={1.5} />
				</span>
			);
	}
}

function SubTaskStatusDot({ status }: { readonly status: string }) {
	switch (status) {
		case "completed":
			return (
				<span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-base">
					<Check className="h-2.5 w-2.5 text-fg-ghost" strokeWidth={2} />
				</span>
			);
		case "running":
			return (
				<span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-base">
					<span className="block h-2 w-2 rounded-full bg-accent-amber animate-status-pulse" />
				</span>
			);
		case "waiting":
			return (
				<span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-base">
					<span className="block h-2 w-2 rounded-full bg-accent-amber" />
				</span>
			);
		case "failed":
			return (
				<span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-base">
					<span className="block h-2 w-2 rounded-full bg-failure" />
				</span>
			);
		default:
			return (
				<span className="flex h-4 w-4 items-center justify-center rounded-full bg-surface-base">
					<Circle className="h-2.5 w-2.5 text-fg-ghost" strokeWidth={1.5} />
				</span>
			);
	}
}

export function VerticalStepList({
	steps,
	artifacts,
	agentSteps,
	selectedStepId,
	onStepSelect,
	onArtifactSelect,
	workflowName,
}: VerticalStepListProps) {
	const [expandedComposites, setExpandedComposites] = useState<Set<string>>(
		() => new Set<string>(),
	);

	const artifactsByStep = useMemo(() => {
		const map = new Map<string, Artifact[]>();
		for (const artifact of artifacts) {
			if (artifact.step) {
				const existing = map.get(artifact.step);
				if (existing) {
					existing.push(artifact);
				} else {
					map.set(artifact.step, [artifact]);
				}
			}
		}
		return map;
	}, [artifacts]);

	const toggleComposite = useCallback((stepId: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setExpandedComposites((prev) => {
			const next = new Set(prev);
			if (next.has(stepId)) {
				next.delete(stepId);
			} else {
				next.add(stepId);
			}
			return next;
		});
	}, []);

	const hasBackEdge = useCallback(
		(step: Step, index: number) => {
			if (index === 0) return false;
			for (let i = 0; i < index; i++) {
				if (steps[i].name === step.name && steps[i].id !== step.id) {
					return true;
				}
			}
			return false;
		},
		[steps],
	);

	return (
		<nav aria-label="Workflow steps" className="relative py-md px-md">
			{workflowName && (
				<p className="type-caption text-fg-ghost mb-sm ml-[9px] pl-md">
					/{workflowName}
				</p>
			)}
			<ol className="relative ml-[9px] border-l border-border">
				{steps.map((step, index) => {
					const isSelected = step.id === selectedStepId;
					const stepArtifacts = artifactsByStep.get(step.id) ?? [];
					const subTasks = agentSteps?.[step.id] ?? null;
					const isComposite = subTasks !== null && subTasks.length > 0;
					const isCompositeExpanded = expandedComposites.has(step.id);
					const isBackEdge = hasBackEdge(step, index);
					const duration = formatStepDuration(step.startedAt, step.completedAt);
					const isLast = index === steps.length - 1;

					return (
						<li
							key={step.id}
							className={cn(
								"relative",
								isLast && "border-l border-transparent",
							)}
						>
							<button
								type="button"
								onClick={() => onStepSelect(step.id)}
								className={cn(
									"flex w-full items-start gap-sm py-xs pr-sm pl-md text-left transition-colors duration-150",
									isSelected
										? "bg-accent-ghost text-fg"
										: "text-fg-muted hover:text-fg",
								)}
							>
								<span className="absolute -left-[10px] top-[6px]">
									<StatusDot status={step.status} />
								</span>

								<div className="flex min-w-0 flex-1 items-start gap-xs">
									{isComposite && (
										<button
											type="button"
											onClick={(e) => toggleComposite(step.id, e)}
											className="mt-[1px] flex-shrink-0 p-0.5"
											aria-label={
												isCompositeExpanded
													? "Collapse sub-tasks"
													: "Expand sub-tasks"
											}
										>
											<ChevronRight
												className={cn(
													"h-3 w-3 text-fg-ghost transition-transform duration-150",
													isCompositeExpanded && "rotate-90",
												)}
												strokeWidth={1.5}
											/>
										</button>
									)}

									<span
										className={cn(
											"type-body font-medium min-w-0 truncate",
											isSelected ? "text-fg" : "",
										)}
									>
										{step.name}
									</span>

									{isBackEdge && (
										<span
											className="flex-shrink-0 text-fg-ghost type-secondary cursor-help"
											title="Retry of a previous step"
										>
											{"\u21A9"}
										</span>
									)}
								</div>

								<div className="flex flex-shrink-0 items-center gap-sm type-secondary text-fg-ghost">
									{stepArtifacts.length > 0 && (
										<span className="tabular-nums">{stepArtifacts.length}</span>
									)}
									{duration && <span className="tabular-nums">{duration}</span>}
								</div>
							</button>

							{isSelected && stepArtifacts.length > 0 && (
								<ul className="ml-md pl-md py-xs border-l border-transparent">
									{stepArtifacts.map((artifact) => {
										const IconComponent =
											artifactIconMap[artifact.type] ?? File;
										const fileName =
											artifact.path.split("/").pop() ?? artifact.path;
										const dirPath = artifact.path.includes("/")
											? artifact.path.substring(
													0,
													artifact.path.lastIndexOf("/"),
												)
											: null;
										return (
											<li key={artifact.docId}>
												<button
													type="button"
													onClick={() => onArtifactSelect(artifact)}
													className="flex w-full items-center gap-xs py-[2px] text-left type-secondary text-fg-muted hover:text-fg transition-colors duration-150"
												>
													<IconComponent
														className="h-3 w-3 flex-shrink-0 self-start mt-[2px]"
														strokeWidth={1.5}
													/>
													<span className="min-w-0 flex flex-col">
														<span className="truncate">{fileName}</span>
														{dirPath && (
															<span
																className="truncate type-caption text-fg-ghost"
																dir="rtl"
															>
																{dirPath}
															</span>
														)}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
							)}

							{isComposite && isCompositeExpanded && (
								<div className="ml-lg pl-[9px] border-l border-border">
									<ol>
										{subTasks.map((task) => (
											<li
												key={task.id}
												className="relative flex items-center gap-xs py-[3px] pl-sm"
											>
												<span className="absolute -left-[10px]">
													<SubTaskStatusDot status={task.status} />
												</span>
												<span className="type-secondary text-fg-muted tabular-nums">
													{task.id}
												</span>
												<span className="type-secondary text-fg-ghost">
													{task.agent}
												</span>
											</li>
										))}
									</ol>
								</div>
							)}
						</li>
					);
				})}
			</ol>
		</nav>
	);
}
