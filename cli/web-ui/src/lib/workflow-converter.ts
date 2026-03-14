import type { Edge, Node } from "@xyflow/react";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import type { Step, StepStatus } from "@/types/runs";

export interface StepNodeData {
	readonly stepId: string;
	readonly label: string;
	readonly status: StepStatus;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly taskCount: number | null;
	readonly completedTaskCount: number | null;
	[key: string]: unknown;
}

export interface ReactFlowGraph {
	readonly nodes: Node<StepNodeData>[];
	readonly edges: Edge[];
}

export interface ParsedState {
	readonly id: string;
	readonly label: string | null;
	readonly description: string | null;
}

export interface ParsedTransition {
	readonly sourceId: string;
	readonly targetId: string;
	readonly label: string | null;
}

export interface ParsedComposite {
	readonly id: string;
	readonly children: readonly ParsedState[];
	readonly transitions: readonly ParsedTransition[];
}

export interface ParsedNote {
	readonly targetId: string;
	readonly position: "right" | "left";
	readonly text: string;
}

export interface ParsedStateDiagram {
	readonly states: ParsedState[];
	readonly transitions: ParsedTransition[];
	readonly composites: ParsedComposite[];
	readonly notes: ParsedNote[];
	readonly direction: "TB" | "LR";
}

function buildStepNodeData(
	stepId: string,
	label: string,
	step: Step | undefined,
): StepNodeData {
	return {
		stepId,
		label,
		status: step?.status ?? "pending",
		startedAt: step?.startedAt ?? null,
		completedAt: step?.completedAt ?? null,
		taskCount: step?.taskCount ?? null,
		completedTaskCount: step?.completedTaskCount ?? null,
	};
}

/**
 * Transform a WorkflowDefinition and run step data into React Flow nodes and edges.
 * Creates a node for each workflow state, merging step status by matching state.id to step.id.
 * Adds virtual start/end nodes for initial/terminal states.
 */
export function workflowToReactFlow(
	workflow: WorkflowDefinition,
	steps: readonly Step[],
): ReactFlowGraph {
	const stepMap = new Map<string, Step>();
	for (const step of steps) {
		stepMap.set(step.id, step);
	}

	const nodes: Node<StepNodeData>[] = [];
	const edges: Edge[] = [];

	for (const state of workflow.states) {
		const step = stepMap.get(state.id);
		const label = state.label ?? state.id;
		nodes.push({
			id: state.id,
			type: "stepNode",
			position: { x: 0, y: 0 },
			data: buildStepNodeData(state.id, label, step),
		});
	}

	const stateIndex = new Map<string, number>();
	for (let i = 0; i < workflow.states.length; i++) {
		stateIndex.set(workflow.states[i].id, i);
	}

	for (const transition of workflow.transitions) {
		const srcIdx = stateIndex.get(transition.sourceId) ?? -1;
		const tgtIdx = stateIndex.get(transition.targetId) ?? -1;
		const isBackward = srcIdx > tgtIdx && srcIdx >= 0 && tgtIdx >= 0;

		edges.push({
			id: `edge-${transition.sourceId}-${transition.targetId}`,
			source: transition.sourceId,
			target: transition.targetId,
			type: "floating",
			animated: isBackward,
			style: isBackward
				? { stroke: "hsl(var(--border))", strokeDasharray: "5 3" }
				: undefined,
		});
	}

	return { nodes, edges };
}

/**
 * Fallback converter for runs without workflow definitions.
 * Produces a sequential vertical chain of step nodes connected by edges.
 */
export function stepsToReactFlow(steps: readonly Step[]): ReactFlowGraph {
	if (steps.length === 0) {
		return { nodes: [], edges: [] };
	}

	const nodes: Node<StepNodeData>[] = steps.map((step) => ({
		id: step.id,
		type: "stepNode",
		position: { x: 0, y: 0 },
		data: buildStepNodeData(step.id, step.name, step),
	}));

	const edges: Edge[] = [];
	for (let i = 0; i < steps.length - 1; i++) {
		edges.push({
			id: `edge-${steps[i].id}-${steps[i + 1].id}`,
			source: steps[i].id,
			target: steps[i + 1].id,
			type: "floating",
		});
	}

	return { nodes, edges };
}

function emptyDiagram(): ParsedStateDiagram {
	return {
		states: [],
		transitions: [],
		composites: [],
		notes: [],
		direction: "TB",
	};
}

/**
 * Parse a raw Mermaid stateDiagram-v2 text into a structured representation.
 * Handles state declarations, transitions, [*] markers, composite states, notes,
 * and direction declarations. Returns an empty diagram on parse failure (no throw).
 */
export function parseMermaidStateDiagram(source: string): ParsedStateDiagram {
	try {
		const lines = source.split("\n").map((l) => l.trim());

		if (!lines.some((l) => l.startsWith("stateDiagram"))) {
			return emptyDiagram();
		}

		const states: ParsedState[] = [];
		const transitions: ParsedTransition[] = [];
		const composites: ParsedComposite[] = [];
		const notes: ParsedNote[] = [];
		let direction: "TB" | "LR" = "TB";

		const stateIds = new Set<string>();

		function addStateIfNew(
			id: string,
			label: string | null = null,
			description: string | null = null,
		): void {
			if (id === "[*]" || stateIds.has(id)) return;
			stateIds.add(id);
			states.push({ id, label, description });
		}

		const compositeStack: {
			id: string;
			children: ParsedState[];
			transitions: ParsedTransition[];
		}[] = [];

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i];

			if (
				!line ||
				line.startsWith("stateDiagram") ||
				line.startsWith("classDef") ||
				line.startsWith("class ")
			) {
				continue;
			}

			// Direction declaration
			const dirMatch = line.match(/^direction\s+(TB|LR|BT|RL)$/);
			if (dirMatch) {
				const dir = dirMatch[1];
				direction = dir === "TB" || dir === "LR" ? dir : "TB";
				continue;
			}

			// Note
			const noteMatch = line.match(
				/^note\s+(right|left)\s+of\s+(\w+)\s*:\s*(.+)$/,
			);
			if (noteMatch) {
				notes.push({
					targetId: noteMatch[2],
					position: noteMatch[1] as "right" | "left",
					text: noteMatch[3].trim(),
				});
				continue;
			}

			// Composite state opening: state CompositeId {
			const compositeMatch = line.match(/^state\s+(\w+)\s*\{$/);
			if (compositeMatch) {
				compositeStack.push({
					id: compositeMatch[1],
					children: [],
					transitions: [],
				});
				continue;
			}

			// Composite state closing
			if (line === "}" && compositeStack.length > 0) {
				const comp = compositeStack.pop();
				if (comp) {
					composites.push({
						id: comp.id,
						children: comp.children,
						transitions: comp.transitions,
					});
					addStateIfNew(comp.id);
				}
				continue;
			}

			// State declaration with alias: state "Label" as id
			const stateAliasMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\w+)$/);
			if (stateAliasMatch) {
				const label = stateAliasMatch[1];
				const id = stateAliasMatch[2];
				addStateIfNew(id, label);
				if (compositeStack.length > 0) {
					compositeStack[compositeStack.length - 1].children.push({
						id,
						label,
						description: null,
					});
				}
				continue;
			}

			// State with description: id : Description
			const stateDescMatch = line.match(/^(\w+)\s*:\s*(.+)$/);
			if (stateDescMatch) {
				const id = stateDescMatch[1];
				const desc = stateDescMatch[2].trim();
				// Don't treat note-like lines as state descriptions
				if (id !== "note") {
					addStateIfNew(id, null, desc);
					if (compositeStack.length > 0) {
						compositeStack[compositeStack.length - 1].children.push({
							id,
							label: null,
							description: desc,
						});
					}
				}
				continue;
			}

			// Transition: A --> B or A --> B : label or [*] --> A or A --> [*]
			const transitionMatch = line.match(
				/^(\[?\*?\]?|\w+)\s*-->\s*(\[?\*?\]?|\w+)(?:\s*:\s*(.+))?$/,
			);
			if (transitionMatch) {
				const sourceId = transitionMatch[1];
				const targetId = transitionMatch[2];
				const label = transitionMatch[3]?.trim() ?? null;

				const transition: ParsedTransition = { sourceId, targetId, label };

				if (compositeStack.length > 0) {
					compositeStack[compositeStack.length - 1].transitions.push(
						transition,
					);
				} else {
					transitions.push(transition);
				}

				if (sourceId !== "[*]") addStateIfNew(sourceId);
				if (targetId !== "[*]") addStateIfNew(targetId);
			}
		}

		return { states, transitions, composites, notes, direction };
	} catch {
		return emptyDiagram();
	}
}
