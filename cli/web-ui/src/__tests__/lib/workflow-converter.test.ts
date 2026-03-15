import { describe, expect, test } from "bun:test";
import type { WorkflowDefinition } from "../../hooks/useWorkflowSteps";
import {
	buildCanvasGraph,
	getStepsWithSubFlows,
	layoutSubFlowFromDiagram,
	parseMermaidStateDiagram,
	stepsToReactFlow,
	workflowToReactFlow,
} from "../../lib/workflow-converter";
import type { AgentTask, Step } from "../../types/runs";

function makeStep(id: string, overrides: Partial<Step> = {}): Step {
	return {
		id,
		name: overrides.name ?? id,
		status: overrides.status ?? "not_started",
		startedAt: overrides.startedAt ?? null,
		completedAt: overrides.completedAt ?? null,
		taskCount: overrides.taskCount ?? null,
		completedTaskCount: overrides.completedTaskCount ?? null,
	};
}

function makeWorkflow(
	overrides: Partial<WorkflowDefinition> = {},
): WorkflowDefinition {
	return {
		name: overrides.name ?? "test-workflow",
		states: overrides.states ?? [],
		transitions: overrides.transitions ?? [],
		orderedSteps: overrides.orderedSteps ?? [],
	};
}

describe("workflowToReactFlow", () => {
	test("produces one node per workflow state and one edge per transition", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: false, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: false },
			],
			transitions: [{ sourceId: "plan", targetId: "build", label: null }],
		});

		const result = workflowToReactFlow(workflow, []);

		const stepNodes = result.nodes.filter(
			(n) => n.id === "plan" || n.id === "build",
		);
		expect(stepNodes).toHaveLength(2);

		const transitionEdges = result.edges.filter(
			(e) => e.source === "plan" && e.target === "build",
		);
		expect(transitionEdges).toHaveLength(1);
	});

	test("does not produce virtual start or end nodes", () => {
		const workflow = makeWorkflow({
			states: [
				{
					id: "requirements",
					label: "Requirements",
					isInitial: true,
					isTerminal: false,
				},
				{ id: "archive", label: "Archive", isInitial: false, isTerminal: true },
			],
			transitions: [
				{ sourceId: "requirements", targetId: "archive", label: null },
			],
		});

		const result = workflowToReactFlow(workflow, []);

		expect(result.nodes.find((n) => n.id === "__start__")).toBeUndefined();
		expect(result.nodes.find((n) => n.id === "__end__")).toBeUndefined();
		expect(result.nodes).toHaveLength(2);

		const virtualEdges = result.edges.filter(
			(e) => e.source === "__start__" || e.target === "__end__",
		);
		expect(virtualEdges).toHaveLength(0);
	});

	test("step status is correctly merged by matching step.id to state.id", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: true, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: false },
			],
			transitions: [],
		});

		const steps: Step[] = [
			makeStep("plan", {
				status: "completed",
				startedAt: "2026-01-01T00:00:00Z",
				completedAt: "2026-01-01T00:05:00Z",
			}),
			makeStep("build", {
				status: "running",
				startedAt: "2026-01-01T00:05:00Z",
			}),
		];

		const result = workflowToReactFlow(workflow, steps);

		const planNode = result.nodes.find((n) => n.id === "plan");
		expect(planNode?.data.status).toBe("completed");
		expect(planNode?.data.startedAt).toBe("2026-01-01T00:00:00Z");
		expect(planNode?.data.completedAt).toBe("2026-01-01T00:05:00Z");

		const buildNode = result.nodes.find((n) => n.id === "build");
		expect(buildNode?.data.status).toBe("running");
		expect(buildNode?.data.startedAt).toBe("2026-01-01T00:05:00Z");
	});

	test("unmatched states default to not_started status", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: true, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: false },
				{ id: "verify", label: "Verify", isInitial: false, isTerminal: true },
			],
			transitions: [],
		});

		const steps: Step[] = [makeStep("plan", { status: "completed" })];

		const result = workflowToReactFlow(workflow, steps);

		const buildNode = result.nodes.find((n) => n.id === "build");
		expect(buildNode?.data.status).toBe("not_started");

		const verifyNode = result.nodes.find((n) => n.id === "verify");
		expect(verifyNode?.data.status).toBe("not_started");
	});

	test("transition labels are omitted from edges to reduce clutter", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "requirements", label: null, isInitial: true, isTerminal: false },
				{ id: "design", label: null, isInitial: false, isTerminal: true },
			],
			transitions: [
				{
					sourceId: "requirements",
					targetId: "design",
					label: "reqs_complete",
				},
			],
		});

		const result = workflowToReactFlow(workflow, []);

		const edge = result.edges.find(
			(e) => e.source === "requirements" && e.target === "design",
		);
		expect(edge?.label).toBeUndefined();
	});

	test("uses state.label as node label, falls back to state.id", () => {
		const workflow = makeWorkflow({
			states: [
				{
					id: "plan",
					label: "Planning Phase",
					isInitial: false,
					isTerminal: false,
				},
				{ id: "build", label: null, isInitial: false, isTerminal: false },
			],
			transitions: [],
		});

		const result = workflowToReactFlow(workflow, []);

		const planNode = result.nodes.find((n) => n.id === "plan");
		expect(planNode?.data.label).toBe("Planning Phase");

		const buildNode = result.nodes.find((n) => n.id === "build");
		expect(buildNode?.data.label).toBe("build");
	});
});

describe("stepsToReactFlow", () => {
	test("produces a sequential chain with N nodes and N-1 edges", () => {
		const steps: Step[] = [
			makeStep("step-1", { name: "Step 1" }),
			makeStep("step-2", { name: "Step 2" }),
			makeStep("step-3", { name: "Step 3" }),
		];

		const result = stepsToReactFlow(steps);

		expect(result.nodes).toHaveLength(3);
		expect(result.edges).toHaveLength(2);

		expect(result.edges[0].source).toBe("step-1");
		expect(result.edges[0].target).toBe("step-2");
		expect(result.edges[1].source).toBe("step-2");
		expect(result.edges[1].target).toBe("step-3");
	});

	test("with empty steps produces an empty graph", () => {
		const result = stepsToReactFlow([]);

		expect(result.nodes).toHaveLength(0);
		expect(result.edges).toHaveLength(0);
	});

	test("single step produces one node and no edges", () => {
		const steps: Step[] = [makeStep("only-step")];

		const result = stepsToReactFlow(steps);

		expect(result.nodes).toHaveLength(1);
		expect(result.edges).toHaveLength(0);
		expect(result.nodes[0].data.stepId).toBe("only-step");
	});

	test("preserves step status data in node data", () => {
		const steps: Step[] = [
			makeStep("s1", {
				name: "First",
				status: "completed",
				startedAt: "2026-01-01T00:00:00Z",
				completedAt: "2026-01-01T00:01:00Z",
				taskCount: 5,
				completedTaskCount: 5,
			}),
		];

		const result = stepsToReactFlow(steps);

		const node = result.nodes[0];
		expect(node.data.status).toBe("completed");
		expect(node.data.startedAt).toBe("2026-01-01T00:00:00Z");
		expect(node.data.completedAt).toBe("2026-01-01T00:01:00Z");
		expect(node.data.taskCount).toBe(5);
		expect(node.data.completedTaskCount).toBe(5);
	});
});

describe("parseMermaidStateDiagram", () => {
	test("parses basic states and transitions", () => {
		const source = `stateDiagram-v2
    [*] --> plan
    plan --> build : plan_ready
    build --> [*]`;

		const result = parseMermaidStateDiagram(source);

		expect(result.states).toHaveLength(2);
		expect(result.states.map((s) => s.id)).toContain("plan");
		expect(result.states.map((s) => s.id)).toContain("build");

		expect(result.transitions).toHaveLength(3);
	});

	test("handles [*] initial and terminal markers", () => {
		const source = `stateDiagram-v2
    [*] --> requirements
    requirements --> design
    design --> [*]`;

		const result = parseMermaidStateDiagram(source);

		const initialTransition = result.transitions.find(
			(t) => t.sourceId === "[*]" && t.targetId === "requirements",
		);
		expect(initialTransition).toBeDefined();

		const terminalTransition = result.transitions.find(
			(t) => t.sourceId === "design" && t.targetId === "[*]",
		);
		expect(terminalTransition).toBeDefined();

		expect(result.states.map((s) => s.id)).not.toContain("[*]");
	});

	test("preserves transition labels", () => {
		const source = `stateDiagram-v2
    plan --> build : plan_ready
    build --> verify : build_complete`;

		const result = parseMermaidStateDiagram(source);

		const planToBuild = result.transitions.find(
			(t) => t.sourceId === "plan" && t.targetId === "build",
		);
		expect(planToBuild?.label).toBe("plan_ready");

		const buildToVerify = result.transitions.find(
			(t) => t.sourceId === "build" && t.targetId === "verify",
		);
		expect(buildToVerify?.label).toBe("build_complete");
	});

	test("handles composite states", () => {
		const source = `stateDiagram-v2
    state buildPhase {
        compile --> test
        test --> package
    }
    [*] --> buildPhase`;

		const result = parseMermaidStateDiagram(source);

		expect(result.composites).toHaveLength(1);
		expect(result.composites[0].id).toBe("buildPhase");
		expect(result.composites[0].transitions).toHaveLength(2);
	});

	test("handles state declarations with aliases", () => {
		const source = `stateDiagram-v2
    state "Planning Phase" as plan
    state "Building Phase" as build
    plan --> build`;

		const result = parseMermaidStateDiagram(source);

		const planState = result.states.find((s) => s.id === "plan");
		expect(planState?.label).toBe("Planning Phase");

		const buildState = result.states.find((s) => s.id === "build");
		expect(buildState?.label).toBe("Building Phase");
	});

	test("handles state descriptions", () => {
		const source = `stateDiagram-v2
    plan : This is the planning state
    plan --> build`;

		const result = parseMermaidStateDiagram(source);

		const planState = result.states.find((s) => s.id === "plan");
		expect(planState?.description).toBe("This is the planning state");
	});

	test("handles notes", () => {
		const source = `stateDiagram-v2
    plan --> build
    note right of plan : Important note here`;

		const result = parseMermaidStateDiagram(source);

		expect(result.notes).toHaveLength(1);
		expect(result.notes[0].targetId).toBe("plan");
		expect(result.notes[0].position).toBe("right");
		expect(result.notes[0].text).toBe("Important note here");
	});

	test("handles direction declarations", () => {
		const source = `stateDiagram-v2
    direction LR
    plan --> build`;

		const result = parseMermaidStateDiagram(source);

		expect(result.direction).toBe("LR");
	});

	test("returns empty diagram for invalid input (no throw)", () => {
		const result = parseMermaidStateDiagram("this is not a mermaid diagram");

		expect(result.states).toHaveLength(0);
		expect(result.transitions).toHaveLength(0);
		expect(result.composites).toHaveLength(0);
		expect(result.notes).toHaveLength(0);
		expect(result.direction).toBe("TB");
	});

	test("returns empty diagram for empty string", () => {
		const result = parseMermaidStateDiagram("");

		expect(result.states).toHaveLength(0);
		expect(result.transitions).toHaveLength(0);
	});

	test("parses a full build workflow matching rp1 conventions", () => {
		const source = `stateDiagram-v2
    [*] --> requirements
    requirements --> design : reqs_complete
    design --> tasks : design_complete
    tasks --> build : tasks_ready
    build --> verify : build_complete
    verify --> build : verify_failed
    verify --> archive : verify_passed
    archive --> [*] : done`;

		const result = parseMermaidStateDiagram(source);

		expect(result.states).toHaveLength(6);
		expect(result.transitions).toHaveLength(8);

		const stateIds = result.states.map((s) => s.id);
		expect(stateIds).toContain("requirements");
		expect(stateIds).toContain("design");
		expect(stateIds).toContain("tasks");
		expect(stateIds).toContain("build");
		expect(stateIds).toContain("verify");
		expect(stateIds).toContain("archive");
	});
});

function makeAgentTask(
	id: string,
	overrides: Partial<AgentTask> = {},
): AgentTask {
	return {
		id,
		name: overrides.name ?? `Task ${id}`,
		status: overrides.status ?? "not_started",
		agent: overrides.agent ?? "task-builder",
	};
}

describe("buildCanvasGraph", () => {
	test("without agentSteps returns the same graph as workflowToReactFlow", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: true, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: true },
			],
			transitions: [{ sourceId: "plan", targetId: "build", label: null }],
		});

		const result = buildCanvasGraph(workflow, []);

		expect(result.nodes).toHaveLength(2);
		expect(result.edges).toHaveLength(1);
		expect(result.nodes[0].type).toBe("stepNode");
	});

	test("expanded step with tasks creates groupStepNode with child taskNodes", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [
				makeAgentTask("t1", { name: "Auth module", status: "completed" }),
				makeAgentTask("t2", { name: "Add tests", status: "running" }),
			],
		};

		const expanded = new Set(["build"]);
		const result = buildCanvasGraph(workflow, [], {
			agentSteps,
			expandedSteps: expanded,
		});

		const groupNode = result.nodes.find((n) => n.id === "build");
		expect(groupNode?.type).toBe("groupStepNode");
		expect(groupNode?.data.hasSubFlow).toBe(true);
		expect(groupNode?.data.isExpanded).toBe(true);
		expect(groupNode?.style?.width).toBeGreaterThan(0);
		expect(groupNode?.style?.height).toBeGreaterThan(0);

		const childNodes = result.nodes.filter((n) => n.parentId === "build");
		expect(childNodes).toHaveLength(2);
		expect(childNodes[0].type).toBe("taskNode");
		expect(childNodes[0].extent).toBe("parent");
		expect(childNodes[0].data.taskId).toBe("t1");
		expect(childNodes[1].data.taskId).toBe("t2");

		const childEdges = result.edges.filter(
			(e) => e.source === "build-task-t1" && e.target === "build-task-t2",
		);
		expect(childEdges).toHaveLength(1);
		expect(childEdges[0].type).toBe("floating");
	});

	test("collapsed step with tasks renders as stepNode with hasSubFlow true", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [makeAgentTask("t1")],
		};

		const collapsed = new Set<string>();
		const result = buildCanvasGraph(workflow, [], {
			agentSteps,
			expandedSteps: collapsed,
		});

		const node = result.nodes.find((n) => n.id === "build");
		expect(node?.type).toBe("stepNode");
		expect(node?.data.hasSubFlow).toBe(true);
		expect(node?.data.isExpanded).toBe(false);

		const childNodes = result.nodes.filter((n) => n.parentId === "build");
		expect(childNodes).toHaveLength(0);
	});

	test("defaults to expanded when expandedSteps is not provided", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [makeAgentTask("t1"), makeAgentTask("t2")],
		};

		const result = buildCanvasGraph(workflow, [], { agentSteps });

		const groupNode = result.nodes.find((n) => n.id === "build");
		expect(groupNode?.type).toBe("groupStepNode");
		expect(groupNode?.data.isExpanded).toBe(true);
	});

	test("steps without agent tasks render as regular stepNode", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: true, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: true },
			],
			transitions: [{ sourceId: "plan", targetId: "build", label: null }],
		});

		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [makeAgentTask("t1")],
		};

		const result = buildCanvasGraph(workflow, [], {
			agentSteps,
			expandedSteps: new Set(["build"]),
		});

		const planNode = result.nodes.find((n) => n.id === "plan");
		expect(planNode?.type).toBe("stepNode");
		expect(planNode?.data.hasSubFlow).toBe(false);
	});

	test("works with stepsToReactFlow fallback when no workflow", () => {
		const steps: Step[] = [
			makeStep("s1", { name: "Step 1" }),
			makeStep("s2", { name: "Step 2" }),
		];

		const agentSteps: Record<string, readonly AgentTask[]> = {
			s1: [makeAgentTask("t1")],
		};

		const result = buildCanvasGraph(null, steps, {
			agentSteps,
			expandedSteps: new Set(["s1"]),
		});

		const groupNode = result.nodes.find((n) => n.id === "s1");
		expect(groupNode?.type).toBe("groupStepNode");

		const regularNode = result.nodes.find((n) => n.id === "s2");
		expect(regularNode?.type).toBe("stepNode");
	});
});

describe("layoutSubFlowFromDiagram", () => {
	test("parses a stateDiagram-v2 and produces correct nodes and edges", () => {
		const diagram = `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T2 --> T3
    T3 --> [*]`;

		const tasks: AgentTask[] = [
			makeAgentTask("T1", { name: "Auth module", status: "completed" }),
			makeAgentTask("T2", { name: "Add routes", status: "running" }),
			makeAgentTask("T3", { name: "Write tests", status: "not_started" }),
		];

		const result = layoutSubFlowFromDiagram("build", diagram, tasks);

		expect(result.childNodes).toHaveLength(3);
		expect(result.childEdges).toHaveLength(2);

		const nodeIds = result.childNodes.map((n) => n.id);
		expect(nodeIds).toContain("build-task-T1");
		expect(nodeIds).toContain("build-task-T2");
		expect(nodeIds).toContain("build-task-T3");

		const t1Node = result.childNodes.find((n) => n.id === "build-task-T1");
		expect(t1Node?.data.taskId).toBe("T1");
		expect(t1Node?.data.status).toBe("completed");
		expect(t1Node?.data.label).toBe("Auth module");
		expect(t1Node?.parentId).toBe("build");
		expect(t1Node?.extent).toBe("parent");
		expect(t1Node?.type).toBe("taskNode");

		const t2Node = result.childNodes.find((n) => n.id === "build-task-T2");
		expect(t2Node?.data.status).toBe("running");

		const edge1 = result.childEdges.find(
			(e) => e.source === "build-task-T1" && e.target === "build-task-T2",
		);
		expect(edge1).toBeDefined();
		expect(edge1?.type).toBe("floating");

		const edge2 = result.childEdges.find(
			(e) => e.source === "build-task-T2" && e.target === "build-task-T3",
		);
		expect(edge2).toBeDefined();
	});

	test("handles branching diagram with non-linear dependencies", () => {
		const diagram = `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T1 --> T3
    T2 --> T4
    T3 --> T4
    T4 --> [*]`;

		const tasks: AgentTask[] = [
			makeAgentTask("T1", { name: "Setup" }),
			makeAgentTask("T2", { name: "Branch A" }),
			makeAgentTask("T3", { name: "Branch B" }),
			makeAgentTask("T4", { name: "Merge" }),
		];

		const result = layoutSubFlowFromDiagram("step", diagram, tasks);

		expect(result.childNodes).toHaveLength(4);
		expect(result.childEdges).toHaveLength(4);

		const edgeSources = result.childEdges.map((e) => [e.source, e.target]);
		expect(edgeSources).toContainEqual(["step-task-T1", "step-task-T2"]);
		expect(edgeSources).toContainEqual(["step-task-T1", "step-task-T3"]);
		expect(edgeSources).toContainEqual(["step-task-T2", "step-task-T4"]);
		expect(edgeSources).toContainEqual(["step-task-T3", "step-task-T4"]);
	});

	test("merges task status by matching state ID to task ID", () => {
		const diagram = `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T2 --> [*]`;

		const tasks: AgentTask[] = [
			makeAgentTask("T1", {
				name: "First task",
				status: "completed",
				agent: "builder",
			}),
			makeAgentTask("T2", {
				name: "Second task",
				status: "not_started",
				agent: "reviewer",
			}),
		];

		const result = layoutSubFlowFromDiagram("parent", diagram, tasks);

		const t1 = result.childNodes.find((n) => n.id === "parent-task-T1");
		expect(t1?.data.status).toBe("completed");
		expect(t1?.data.agent).toBe("builder");

		const t2 = result.childNodes.find((n) => n.id === "parent-task-T2");
		expect(t2?.data.status).toBe("not_started");
		expect(t2?.data.agent).toBe("reviewer");
	});

	test("defaults to not_started status for diagram states with no matching task", () => {
		const diagram = `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T2 --> [*]`;

		const tasks: AgentTask[] = [
			makeAgentTask("T1", { name: "Known task", status: "completed" }),
		];

		const result = layoutSubFlowFromDiagram("step", diagram, tasks);

		expect(result.childNodes).toHaveLength(2);
		const t2 = result.childNodes.find((n) => n.id === "step-task-T2");
		expect(t2?.data.status).toBe("not_started");
		expect(t2?.data.label).toBe("T2");
		expect(t2?.data.agent).toBe("");
	});

	test("falls back to sequential layout for invalid diagram input", () => {
		const tasks: AgentTask[] = [
			makeAgentTask("t1", { name: "Task 1" }),
			makeAgentTask("t2", { name: "Task 2" }),
		];

		const result = layoutSubFlowFromDiagram("step", "not a diagram", tasks);

		expect(result.childNodes).toHaveLength(2);
		expect(result.childEdges).toHaveLength(1);
		expect(result.childEdges[0].source).toBe("step-task-t1");
		expect(result.childEdges[0].target).toBe("step-task-t2");
	});

	test("produces positive width and height dimensions", () => {
		const diagram = `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T2 --> [*]`;

		const tasks: AgentTask[] = [
			makeAgentTask("T1", { name: "First" }),
			makeAgentTask("T2", { name: "Second" }),
		];

		const result = layoutSubFlowFromDiagram("build", diagram, tasks);

		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);
	});
});

describe("buildCanvasGraph with subflows", () => {
	test("subflow diagram is preferred over flat sequential agentSteps chain", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [
				makeAgentTask("T1", { name: "Setup", status: "completed" }),
				makeAgentTask("T2", { name: "Branch A", status: "running" }),
				makeAgentTask("T3", { name: "Branch B", status: "not_started" }),
			],
		};

		const subflows: Record<string, string> = {
			build: `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T1 --> T3
    T2 --> [*]
    T3 --> [*]`,
		};

		const result = buildCanvasGraph(workflow, [], {
			agentSteps,
			subflows,
		});

		const groupNode = result.nodes.find((n) => n.id === "build");
		expect(groupNode?.type).toBe("groupStepNode");
		expect(groupNode?.data.hasSubFlow).toBe(true);
		expect(groupNode?.data.isExpanded).toBe(true);

		const childNodes = result.nodes.filter((n) => n.parentId === "build");
		expect(childNodes).toHaveLength(3);

		const childEdges = result.edges.filter(
			(e) =>
				e.source.startsWith("build-task-") &&
				e.target.startsWith("build-task-"),
		);
		expect(childEdges).toHaveLength(2);

		const edgePairs = childEdges.map((e) => [e.source, e.target]);
		expect(edgePairs).toContainEqual(["build-task-T1", "build-task-T2"]);
		expect(edgePairs).toContainEqual(["build-task-T1", "build-task-T3"]);

		const sequentialEdge = childEdges.find(
			(e) => e.source === "build-task-T2" && e.target === "build-task-T3",
		);
		expect(sequentialEdge).toBeUndefined();
	});

	test("step with subflow but no agentSteps still renders as expanded group", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const subflows: Record<string, string> = {
			build: `stateDiagram-v2
    [*] --> T1
    T1 --> T2
    T2 --> [*]`,
		};

		const result = buildCanvasGraph(workflow, [], { subflows });

		const groupNode = result.nodes.find((n) => n.id === "build");
		expect(groupNode?.type).toBe("groupStepNode");
		expect(groupNode?.data.hasSubFlow).toBe(true);

		const childNodes = result.nodes.filter((n) => n.parentId === "build");
		expect(childNodes).toHaveLength(2);
		expect(childNodes[0].data.taskId).toBe("T1");
		expect(childNodes[1].data.taskId).toBe("T2");
	});

	test("collapsed step with subflow renders as stepNode", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "build", label: "Build", isInitial: true, isTerminal: true },
			],
			transitions: [],
		});

		const subflows: Record<string, string> = {
			build: `stateDiagram-v2
    [*] --> T1
    T1 --> [*]`,
		};

		const result = buildCanvasGraph(workflow, [], {
			subflows,
			expandedSteps: new Set<string>(),
		});

		const node = result.nodes.find((n) => n.id === "build");
		expect(node?.type).toBe("stepNode");
		expect(node?.data.hasSubFlow).toBe(true);
		expect(node?.data.isExpanded).toBe(false);
	});

	test("steps without subflows remain as regular stepNodes", () => {
		const workflow = makeWorkflow({
			states: [
				{ id: "plan", label: "Plan", isInitial: true, isTerminal: false },
				{ id: "build", label: "Build", isInitial: false, isTerminal: true },
			],
			transitions: [{ sourceId: "plan", targetId: "build", label: null }],
		});

		const subflows: Record<string, string> = {
			build: `stateDiagram-v2
    [*] --> T1
    T1 --> [*]`,
		};

		const result = buildCanvasGraph(workflow, [], { subflows });

		const planNode = result.nodes.find((n) => n.id === "plan");
		expect(planNode?.type).toBe("stepNode");
		expect(planNode?.data.hasSubFlow).toBe(false);

		const buildNode = result.nodes.find((n) => n.id === "build");
		expect(buildNode?.type).toBe("groupStepNode");
	});
});

describe("getStepsWithSubFlows", () => {
	test("returns step ids that have tasks", () => {
		const agentSteps: Record<string, readonly AgentTask[]> = {
			build: [makeAgentTask("t1")],
			plan: [],
			verify: [makeAgentTask("t2"), makeAgentTask("t3")],
		};

		const result = getStepsWithSubFlows(agentSteps);

		expect(result.has("build")).toBe(true);
		expect(result.has("verify")).toBe(true);
		expect(result.has("plan")).toBe(false);
	});

	test("returns empty set for null agentSteps", () => {
		expect(getStepsWithSubFlows(null).size).toBe(0);
		expect(getStepsWithSubFlows(undefined).size).toBe(0);
	});
});
