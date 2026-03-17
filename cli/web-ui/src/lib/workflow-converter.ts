import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import type { AgentTask, Artifact, Step, StepStatus } from "@/types/runs";

export interface StepNodeData {
	readonly stepId: string;
	readonly label: string;
	readonly status: StepStatus;
	readonly startedAt: string | null;
	readonly completedAt: string | null;
	readonly taskCount: number | null;
	readonly completedTaskCount: number | null;
	readonly artifacts: readonly Artifact[];
	readonly hasSubFlow: boolean;
	readonly isExpanded: boolean;
	[key: string]: unknown;
}

export interface TaskNodeData {
	readonly taskId: string;
	readonly label: string;
	readonly status: string;
	readonly agent: string;
	[key: string]: unknown;
}

export interface CanvasGraph {
	readonly nodes: Node[];
	readonly edges: Edge[];
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

function computeStepNodeHeight(
	step: Step | undefined,
	artifactCount: number,
): number {
	let height = STEP_NODE_HEIGHT;
	if (artifactCount > 0 && step?.status !== "not_started") {
		height += 8 + artifactCount * ARTIFACT_ROW_HEIGHT;
	}
	return height;
}

function buildStepNodeData(
	stepId: string,
	label: string,
	step: Step | undefined,
	stepArtifacts?: readonly Artifact[],
): StepNodeData {
	return {
		stepId,
		label,
		status: step?.status ?? "not_started",
		startedAt: step?.startedAt ?? null,
		completedAt: step?.completedAt ?? null,
		taskCount: step?.taskCount ?? null,
		completedTaskCount: step?.completedTaskCount ?? null,
		artifacts: stepArtifacts ?? [],
		hasSubFlow: false,
		isExpanded: false,
	};
}

function groupArtifactsByStep(
	artifacts: readonly Artifact[],
): Map<string, Artifact[]> {
	const map = new Map<string, Artifact[]>();
	for (const artifact of artifacts) {
		if (artifact.step !== null) {
			const existing = map.get(artifact.step);
			if (existing) {
				existing.push(artifact);
			} else {
				map.set(artifact.step, [artifact]);
			}
		}
	}
	return map;
}

/**
 * Transform a WorkflowDefinition and run step data into React Flow nodes and edges.
 * Creates a node for each workflow state, merging step status by matching state.id to step.id.
 * Adds virtual start/end nodes for initial/terminal states.
 */
export function workflowToReactFlow(
	workflow: WorkflowDefinition,
	steps: readonly Step[],
	artifacts?: readonly Artifact[],
): ReactFlowGraph {
	const stepMap = new Map<string, Step>();
	for (const step of steps) {
		stepMap.set(step.id, step);
	}

	const artifactsByStep = artifacts
		? groupArtifactsByStep(artifacts)
		: new Map<string, Artifact[]>();

	const nodes: Node<StepNodeData>[] = [];
	const edges: Edge[] = [];

	for (const state of workflow.states) {
		const step = stepMap.get(state.id);
		const label = state.label ?? state.id;
		const stepArtifacts = artifactsByStep.get(state.id) ?? [];
		const nodeHeight = computeStepNodeHeight(step, stepArtifacts.length);
		nodes.push({
			id: state.id,
			type: "stepNode",
			position: { x: 0, y: 0 },
			data: buildStepNodeData(state.id, label, step, stepArtifacts),
			style: { width: STEP_NODE_WIDTH, height: nodeHeight },
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
export function stepsToReactFlow(
	steps: readonly Step[],
	artifacts?: readonly Artifact[],
): ReactFlowGraph {
	if (steps.length === 0) {
		return { nodes: [], edges: [] };
	}

	const artifactsByStep = artifacts
		? groupArtifactsByStep(artifacts)
		: new Map<string, Artifact[]>();

	const nodes: Node<StepNodeData>[] = steps.map((step) => {
		const stepArtifacts = artifactsByStep.get(step.id) ?? [];
		const nodeHeight = computeStepNodeHeight(step, stepArtifacts.length);
		return {
			id: step.id,
			type: "stepNode",
			position: { x: 0, y: 0 },
			data: buildStepNodeData(step.id, step.name, step, stepArtifacts),
			style: { width: STEP_NODE_WIDTH, height: nodeHeight },
		};
	});

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

const TASK_NODE_WIDTH = 140;
const TASK_NODE_HEIGHT = 40;
const STEP_NODE_WIDTH = 260;
const STEP_NODE_HEIGHT = 80;
const ARTIFACT_ROW_HEIGHT = 28;
const GROUP_HEADER_HEIGHT = 80;
const GROUP_PADDING_X = 20;
const GROUP_PADDING_BOTTOM = 20;
const MAX_GROUP_HEIGHT = 500;

interface SubFlowLayout {
	readonly width: number;
	readonly height: number;
	readonly childNodes: Node<TaskNodeData>[];
	readonly childEdges: Edge[];
}

/**
 * Layout a sub-flow from a Mermaid stateDiagram-v2 source string.
 * Parses the diagram to produce child TaskNode nodes and edges that respect
 * the actual dependency graph (rather than a flat sequential chain).
 * Merges agent task statuses into subflow nodes by matching state ID to task ID.
 */
export function layoutSubFlowFromDiagram(
	parentId: string,
	diagramSource: string,
	tasks: readonly AgentTask[],
	artifactCount = 0,
): SubFlowLayout {
	const parsed = parseMermaidStateDiagram(diagramSource);

	if (parsed.states.length === 0) {
		return layoutSubFlow(parentId, tasks, artifactCount);
	}

	const taskStatusMap = new Map<string, AgentTask>();
	for (const task of tasks) {
		taskStatusMap.set(task.id, task);
	}

	const g = new dagre.graphlib.Graph();
	g.setGraph({
		rankdir: "TB",
		nodesep: 20,
		ranksep: 30,
		marginx: 10,
		marginy: 10,
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const state of parsed.states) {
		const nodeId = `${parentId}-task-${state.id}`;
		g.setNode(nodeId, { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT });
	}

	for (const transition of parsed.transitions) {
		if (transition.sourceId === "[*]" || transition.targetId === "[*]")
			continue;
		const srcId = `${parentId}-task-${transition.sourceId}`;
		const tgtId = `${parentId}-task-${transition.targetId}`;
		if (g.hasNode(srcId) && g.hasNode(tgtId)) {
			g.setEdge(srcId, tgtId);
		}
	}

	dagre.layout(g);

	const childNodes: Node<TaskNodeData>[] = [];
	const childEdges: Edge[] = [];

	const artifactOffset =
		artifactCount > 0 ? 8 + artifactCount * ARTIFACT_ROW_HEIGHT : 0;
	const headerHeight = GROUP_HEADER_HEIGHT + artifactOffset;

	let maxX = 0;
	let maxY = 0;

	for (const state of parsed.states) {
		const nodeId = `${parentId}-task-${state.id}`;
		const dagreNode = g.node(nodeId);
		const x = dagreNode.x - TASK_NODE_WIDTH / 2 + GROUP_PADDING_X;
		const y = dagreNode.y - TASK_NODE_HEIGHT / 2 + headerHeight;

		maxX = Math.max(maxX, x + TASK_NODE_WIDTH);
		maxY = Math.max(maxY, y + TASK_NODE_HEIGHT);

		const matchedTask = taskStatusMap.get(state.id);
		const label =
			state.description ?? state.label ?? matchedTask?.name ?? state.id;
		const status = matchedTask?.status ?? "not_started";
		const agent = matchedTask?.agent ?? "";

		childNodes.push({
			id: nodeId,
			type: "taskNode",
			position: { x, y },
			parentId,
			extent: "parent",
			data: {
				taskId: state.id,
				label,
				status,
				agent,
			},
		} as Node<TaskNodeData>);
	}

	for (const transition of parsed.transitions) {
		if (transition.sourceId === "[*]" || transition.targetId === "[*]")
			continue;
		const srcId = `${parentId}-task-${transition.sourceId}`;
		const tgtId = `${parentId}-task-${transition.targetId}`;
		if (
			childNodes.some((n) => n.id === srcId) &&
			childNodes.some((n) => n.id === tgtId)
		) {
			childEdges.push({
				id: `edge-${srcId}-${tgtId}`,
				source: srcId,
				target: tgtId,
				type: "floating",
			});
		}
	}

	const groupWidth = Math.max(maxX + GROUP_PADDING_X, STEP_NODE_WIDTH);
	const groupHeight = Math.min(maxY + GROUP_PADDING_BOTTOM, MAX_GROUP_HEIGHT);

	return { width: groupWidth, height: groupHeight, childNodes, childEdges };
}

function layoutSubFlow(
	parentId: string,
	tasks: readonly AgentTask[],
	artifactCount = 0,
): SubFlowLayout {
	if (tasks.length === 0) {
		return {
			width: STEP_NODE_WIDTH,
			height: STEP_NODE_HEIGHT,
			childNodes: [],
			childEdges: [],
		};
	}

	const g = new dagre.graphlib.Graph();
	g.setGraph({
		rankdir: "TB",
		nodesep: 20,
		ranksep: 30,
		marginx: 10,
		marginy: 10,
	});
	g.setDefaultEdgeLabel(() => ({}));

	for (const task of tasks) {
		const nodeId = `${parentId}-task-${task.id}`;
		g.setNode(nodeId, { width: TASK_NODE_WIDTH, height: TASK_NODE_HEIGHT });
	}

	for (let i = 0; i < tasks.length - 1; i++) {
		const srcId = `${parentId}-task-${tasks[i].id}`;
		const tgtId = `${parentId}-task-${tasks[i + 1].id}`;
		g.setEdge(srcId, tgtId);
	}

	dagre.layout(g);

	const childNodes: Node<TaskNodeData>[] = [];
	const childEdges: Edge[] = [];

	const artifactOffset =
		artifactCount > 0 ? 8 + artifactCount * ARTIFACT_ROW_HEIGHT : 0;
	const headerHeight = GROUP_HEADER_HEIGHT + artifactOffset;

	let maxX = 0;
	let maxY = 0;

	for (const task of tasks) {
		const nodeId = `${parentId}-task-${task.id}`;
		const dagreNode = g.node(nodeId);
		const x = dagreNode.x - TASK_NODE_WIDTH / 2 + GROUP_PADDING_X;
		const y = dagreNode.y - TASK_NODE_HEIGHT / 2 + headerHeight;

		maxX = Math.max(maxX, x + TASK_NODE_WIDTH);
		maxY = Math.max(maxY, y + TASK_NODE_HEIGHT);

		childNodes.push({
			id: nodeId,
			type: "taskNode",
			position: { x, y },
			parentId,
			extent: "parent",
			data: {
				taskId: task.id,
				label: task.name,
				status: task.status,
				agent: task.agent,
			},
		} as Node<TaskNodeData>);
	}

	for (let i = 0; i < tasks.length - 1; i++) {
		const srcId = `${parentId}-task-${tasks[i].id}`;
		const tgtId = `${parentId}-task-${tasks[i + 1].id}`;
		childEdges.push({
			id: `edge-${srcId}-${tgtId}`,
			source: srcId,
			target: tgtId,
			type: "floating",
		});
	}

	const groupWidth = Math.max(maxX + GROUP_PADDING_X, STEP_NODE_WIDTH);
	const groupHeight = Math.min(maxY + GROUP_PADDING_BOTTOM, MAX_GROUP_HEIGHT);

	return { width: groupWidth, height: groupHeight, childNodes, childEdges };
}

export interface BuildCanvasGraphOptions {
	readonly agentSteps?: Readonly<Record<string, readonly AgentTask[]>> | null;
	readonly expandedSteps?: ReadonlySet<string>;
	readonly artifacts?: readonly Artifact[];
	readonly subflows?: Readonly<Record<string, string>>;
}

/**
 * Build a full canvas graph from a workflow or steps, with sub-flow support.
 * Expanded steps with agent tasks become groupStepNode containers with child taskNodes.
 * Uses a two-pass layout: child sub-graphs first, then top-level with expanded dimensions.
 */
export function buildCanvasGraph(
	workflow: WorkflowDefinition | null,
	steps: readonly Step[],
	options: BuildCanvasGraphOptions = {},
): CanvasGraph {
	const { agentSteps, expandedSteps, artifacts, subflows } = options;

	const base = workflow
		? workflowToReactFlow(workflow, steps, artifacts)
		: stepsToReactFlow(steps, artifacts);

	const hasAgentSteps = agentSteps && Object.keys(agentSteps).length > 0;
	const hasSubflows = subflows && Object.keys(subflows).length > 0;

	if (!hasAgentSteps && !hasSubflows) {
		return base;
	}

	const allNodes: Node[] = [];
	const allEdges: Edge[] = [...base.edges];

	for (const node of base.nodes) {
		const stepId = node.data.stepId;
		const tasks = agentSteps?.[stepId];
		const hasTasks = tasks && tasks.length > 0;
		const hasSubflow = hasSubflows && stepId in subflows;
		const hasAnySubFlow = hasTasks || hasSubflow;
		const isExpanded = expandedSteps ? expandedSteps.has(stepId) : true;

		if (!hasAnySubFlow) {
			allNodes.push(node);
			continue;
		}

		if (!isExpanded) {
			allNodes.push({
				...node,
				type: "groupStepNode",
				data: { ...node.data, hasSubFlow: true, isExpanded: false },
			});
			continue;
		}

		const stepArtifactCount = (node.data as StepNodeData).artifacts.length;
		const subFlow =
			hasSubflow && subflows[stepId]
				? layoutSubFlowFromDiagram(
						stepId,
						subflows[stepId],
						tasks ?? [],
						stepArtifactCount,
					)
				: layoutSubFlow(stepId, tasks ?? [], stepArtifactCount);

		allNodes.push({
			...node,
			type: "groupStepNode",
			data: { ...node.data, hasSubFlow: true, isExpanded: true },
			style: {
				width: subFlow.width,
				height: subFlow.height,
			},
		});

		for (const childNode of subFlow.childNodes) {
			allNodes.push(childNode);
		}
		for (const childEdge of subFlow.childEdges) {
			allEdges.push(childEdge);
		}
	}

	return { nodes: allNodes, edges: allEdges };
}

/**
 * Determine which steps have agent sub-flows so they can
 * be expanded by default on initial load.
 */
export function getStepsWithSubFlows(
	agentSteps: Readonly<Record<string, readonly AgentTask[]>> | null | undefined,
): Set<string> {
	const result = new Set<string>();
	if (!agentSteps) return result;
	for (const [stepId, tasks] of Object.entries(agentSteps)) {
		if (tasks.length > 0) {
			result.add(stepId);
		}
	}
	return result;
}
