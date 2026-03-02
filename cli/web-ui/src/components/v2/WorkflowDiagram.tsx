import { useMemo } from "react";
import { MermaidDiagram } from "@/components/MarkdownViewer/MermaidDiagram";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import { cn } from "@/lib/utils";
import { useTheme } from "@/providers/ThemeProvider";
import type { Step, StepStatus } from "@/types/runs";

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
	// Walk states in workflow order; the last one with "running" status is the active frontier
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
			// Only the frontier running state gets currentState (with glow)
			className = "currentState";
		} else if (status === "running") {
			// Other running states are visually completed (they finished before the active one started)
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

	const mermaidCode = useMemo(
		() => buildMermaidSource(workflow, steps, colors),
		[workflow, steps, colors],
	);

	const legendItems = useMemo(() => buildLegendItems(steps), [steps]);

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
			</div>
			<div className="border-t border-border">
				<MermaidDiagram code={mermaidCode} title={null} />
				{legendItems.length > 0 && (
					<div className="flex items-center justify-center gap-4 border-t border-border px-4 py-2">
						{legendItems.map((item) => {
							const color = legendColorForStatus(item.status, colors);
							return (
								<div
									key={item.status}
									className="flex items-center gap-1.5 text-xs text-muted-foreground"
								>
									<span
										className="inline-block h-3 w-3 rounded-sm"
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
		</section>
	);
}
