import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { MermaidDiagram } from "@/components/MarkdownViewer/MermaidDiagram";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";
import type { AgentSubState, Step, StepStatus } from "@/types/runs";
import { StatusBadge } from "./StatusBadge";

interface ThemeColors {
	readonly current: { fill: string; stroke: string; color: string };
	readonly completed: { fill: string; stroke: string; color: string };
	readonly failed: { fill: string; stroke: string; color: string };
	readonly pending: { fill: string; stroke: string; color: string };
}

const darkColors: ThemeColors = {
	current: { fill: "#89b4fa", stroke: "#74c7ec", color: "#11111b" },
	completed: { fill: "#a6e3a1", stroke: "#94e2d5", color: "#11111b" },
	failed: { fill: "#f38ba8", stroke: "#eba0ac", color: "#11111b" },
	pending: { fill: "#45475a", stroke: "#6c7086", color: "#a6adc8" },
};

const lightColors: ThemeColors = {
	current: { fill: "#1e66f5", stroke: "#209fb5", color: "#eff1f5" },
	completed: { fill: "#40a02b", stroke: "#179299", color: "#eff1f5" },
	failed: { fill: "#d20f39", stroke: "#e64553", color: "#eff1f5" },
	pending: { fill: "#e6e9ef", stroke: "#9ca0b0", color: "#8c8fa1" },
};

function stepStatusToClass(status: StepStatus): string {
	switch (status) {
		case "running":
			return "currentState";
		case "completed":
			return "completedState";
		case "failed":
			return "failedState";
		default:
			return "pendingState";
	}
}

/**
 * Find the single active (frontier) state: the last "running" state in workflow order.
 * All other "running" states are treated as completed for visual purposes.
 */
function findActiveStateId(
	workflow: WorkflowDefinition,
	stepStatusMap: Map<string, StepStatus>,
): string | null {
	let activeId: string | null = null;
	for (const state of workflow.states) {
		if (stepStatusMap.get(state.id) === "running") {
			activeId = state.id;
		}
	}
	return activeId;
}

function buildMermaidSource(
	workflow: WorkflowDefinition,
	steps: readonly Step[],
	colors: ThemeColors,
): string {
	const stepStatusMap = new Map<string, StepStatus>();
	for (const step of steps) {
		stepStatusMap.set(step.id, step.status);
	}

	const activeStateId = findActiveStateId(workflow, stepStatusMap);

	const lines: string[] = ["stateDiagram-v2"];

	lines.push(
		`    classDef currentState fill:${colors.current.fill},stroke:${colors.current.stroke},color:${colors.current.color},stroke-width:3px`,
	);
	lines.push(
		`    classDef completedState fill:${colors.completed.fill},stroke:${colors.completed.stroke},color:${colors.completed.color},stroke-width:2px`,
	);
	lines.push(
		`    classDef failedState fill:${colors.failed.fill},stroke:${colors.failed.stroke},color:${colors.failed.color},stroke-width:2px`,
	);
	lines.push(
		`    classDef pendingState fill:${colors.pending.fill},stroke:${colors.pending.stroke},color:${colors.pending.color},stroke-dasharray:5 5`,
	);

	lines.push("");

	const initialStates = new Set(
		workflow.states.filter((s) => s.isInitial).map((s) => s.id),
	);
	const terminalStates = new Set(
		workflow.states.filter((s) => s.isTerminal).map((s) => s.id),
	);

	for (const stateId of initialStates) {
		lines.push(`    [*] --> ${stateId}`);
	}

	for (const t of workflow.transitions) {
		if (t.label) {
			lines.push(`    ${t.sourceId} --> ${t.targetId} : ${t.label}`);
		} else {
			lines.push(`    ${t.sourceId} --> ${t.targetId}`);
		}
	}

	for (const stateId of terminalStates) {
		const hasExplicitTerminal = workflow.transitions.some(
			(t) => t.sourceId === stateId && t.targetId === "[*]",
		);
		if (!hasExplicitTerminal) {
			lines.push(`    ${stateId} --> [*]`);
		}
	}

	lines.push("");

	for (const state of workflow.states) {
		const status = stepStatusMap.get(state.id) ?? "pending";
		let className: string;
		if (state.id === activeStateId) {
			className = "currentState";
		} else if (status === "running") {
			className = "completedState";
		} else {
			className = stepStatusToClass(status);
		}
		lines.push(`    class ${state.id} ${className}`);
	}

	return lines.join("\n");
}

function buildLegendItems(
	steps: readonly Step[],
): readonly { label: string; status: StepStatus }[] {
	const hasStatus = (s: StepStatus) => steps.some((step) => step.status === s);
	const items: { label: string; status: StepStatus }[] = [];

	if (hasStatus("running")) items.push({ label: "Current", status: "running" });
	if (hasStatus("completed"))
		items.push({ label: "Completed", status: "completed" });
	if (hasStatus("failed")) items.push({ label: "Failed", status: "failed" });
	if (hasStatus("pending")) items.push({ label: "Pending", status: "pending" });

	return items;
}

function legendColorForStatus(
	status: StepStatus,
	colors: ThemeColors,
): { fill: string; border: string } {
	switch (status) {
		case "running":
			return { fill: colors.current.fill, border: colors.current.stroke };
		case "completed":
			return { fill: colors.completed.fill, border: colors.completed.stroke };
		case "failed":
			return { fill: colors.failed.fill, border: colors.failed.stroke };
		default:
			return { fill: colors.pending.fill, border: colors.pending.stroke };
	}
}

function humanizeLabel(id: string): string {
	return id
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function AgentSubStateRow({ subState }: { subState: AgentSubState }) {
	return (
		<div className="flex items-center gap-3 py-1.5 px-3 text-sm">
			<Bot
				className="h-3.5 w-3.5 text-muted-foreground shrink-0"
				aria-hidden="true"
			/>
			<span className="font-medium text-foreground">
				{humanizeLabel(subState.agentName)}
			</span>
			{subState.task && (
				<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
					{subState.task}
				</code>
			)}
			<span className="text-xs text-muted-foreground">
				{humanizeLabel(subState.step)}
			</span>
			<div className="ml-auto">
				<StatusBadge status={subState.status} size="sm" />
			</div>
		</div>
	);
}

function AgentActivityPanel({ steps }: { steps: readonly Step[] }) {
	const stepsWithAgents = useMemo(
		() => steps.filter((s) => s.agentSubStates && s.agentSubStates.length > 0),
		[steps],
	);

	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		for (const step of stepsWithAgents) {
			if (step.status === "running") {
				initial.add(step.id);
			}
		}
		return initial;
	});

	if (stepsWithAgents.length === 0) return null;

	const toggleStep = (stepId: string) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(stepId)) {
				next.delete(stepId);
			} else {
				next.add(stepId);
			}
			return next;
		});
	};

	return (
		<section className="border-t border-border" aria-label="Agent Activity">
			<div className="px-4 py-2">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Agent Activity
				</h3>
			</div>
			<div className="divide-y divide-border/50">
				{stepsWithAgents.map((step) => {
					const isExpanded = expandedSteps.has(step.id);
					const subStates = step.agentSubStates ?? [];

					return (
						<div key={step.id}>
							<button
								type="button"
								onClick={() => toggleStep(step.id)}
								className={cn(
									"flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
									"hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
								)}
								aria-expanded={isExpanded}
							>
								{isExpanded ? (
									<ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								) : (
									<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								)}
								<span className="font-medium text-foreground">
									{humanizeLabel(step.id)}
								</span>
								<StatusBadge status={step.status} size="sm" showLabel={false} />
								<span className="ml-auto text-xs text-muted-foreground">
									{subStates.length} agent{subStates.length !== 1 ? "s" : ""}
								</span>
							</button>
							{isExpanded && (
								<div className="bg-muted/10 border-t border-border/30 py-1">
									{subStates.map((subState, idx) => (
										<AgentSubStateRow
											key={`${subState.agentName}-${subState.task ?? idx}`}
											subState={subState}
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}

export interface WorkflowDiagramProps {
	workflow: WorkflowDefinition;
	steps: readonly Step[];
	className?: string;
}

export function WorkflowDiagram({
	workflow,
	steps,
	className,
}: WorkflowDiagramProps) {
	const { theme } = useTheme();
	const colors = theme === "dark" ? darkColors : lightColors;

	const stepsRef = useRef(steps);
	stepsRef.current = steps;

	const stepStatusKey = useMemo(
		() => steps.map((s) => `${s.id}:${s.status}`).join("|"),
		[steps],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: stepStatusKey is an intentional stable proxy for steps status changes to avoid re-rendering on every new steps array reference
	const mermaidCode = useMemo(
		() => buildMermaidSource(workflow, stepsRef.current, colors),
		[workflow, stepStatusKey, colors],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: stepStatusKey captures all relevant status changes
	const legendItems = useMemo(
		() => buildLegendItems(stepsRef.current),
		[stepStatusKey],
	);

	const stateCount = workflow.states.length;

	return (
		<section
			className={cn(
				"rounded-lg border border-border bg-card overflow-hidden",
				className,
			)}
			aria-label="Workflow State"
		>
			<div className="flex items-center gap-2 px-4 py-3">
				<h2 className="font-medium text-foreground">Workflow State</h2>
				<span className="text-sm text-muted-foreground">
					({stateCount} states)
				</span>
				{legendItems.length > 0 && (
					<div className="ml-auto flex items-center gap-3">
						{legendItems.map((item) => {
							const color = legendColorForStatus(item.status, colors);
							return (
								<div
									key={item.status}
									className="flex items-center gap-1.5 text-xs text-muted-foreground"
								>
									<span
										className="inline-block h-2.5 w-2.5 rounded-sm"
										style={{
											backgroundColor: color.fill,
											border: `1.5px solid ${color.border}`,
											...(item.status === "pending"
												? {
														backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 2px, ${color.border} 2px, ${color.border} 3px)`,
													}
												: {}),
										}}
										aria-hidden="true"
									/>
									<span>{item.label}</span>
								</div>
							);
						})}
					</div>
				)}
			</div>
			<div className="border-t border-border">
				<MermaidDiagram code={mermaidCode} title={null} />
			</div>
			<AgentActivityPanel steps={steps} />
		</section>
	);
}
