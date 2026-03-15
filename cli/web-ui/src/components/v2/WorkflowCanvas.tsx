import {
	type DefaultEdgeOptions,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGraphLayout } from "@/hooks/useGraphLayout";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import { cn } from "@/lib/utils";
import { buildCanvasGraph } from "@/lib/workflow-converter";
import type { AgentTask, Artifact, Step } from "@/types/runs";
import { FloatingEdge } from "./FloatingEdge";
import { GroupStepNode } from "./GroupStepNode";
import { StepNode } from "./StepNode";
import { TaskNode } from "./TaskNode";

const nodeTypes = {
	stepNode: StepNode,
	taskNode: TaskNode,
	groupStepNode: GroupStepNode,
} as const;
const edgeTypes = { floating: FloatingEdge } as const;

const defaultEdgeOptions: DefaultEdgeOptions = {
	type: "floating",
	style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
};

const fitViewOptions = { padding: 0.12, maxZoom: 1.2 } as const;

export interface WorkflowCanvasProps {
	readonly workflow: WorkflowDefinition | null;
	readonly steps: readonly Step[];
	readonly artifacts?: readonly Artifact[];
	readonly agentSteps?: Readonly<Record<string, readonly AgentTask[]>> | null;
	readonly subflows?: Readonly<Record<string, string>> | null;
	readonly className?: string;
}

function WorkflowCanvasInner({
	workflow,
	steps,
	artifacts,
	agentSteps,
	subflows,
}: Omit<WorkflowCanvasProps, "className">) {
	const { fitView } = useReactFlow();
	const containerRef = useRef<HTMLDivElement>(null);

	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(
		() => new Set<string>(),
	);

	const handleToggle = useCallback((stepId: string) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(stepId)) {
				next.delete(stepId);
			} else {
				next.add(stepId);
			}
			return next;
		});
	}, []);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const listener = (e: Event) => {
			const detail = (e as CustomEvent).detail;
			if (detail?.stepId) {
				handleToggle(detail.stepId);
			}
		};

		container.addEventListener("stepnode:toggle-expand", listener);
		return () =>
			container.removeEventListener("stepnode:toggle-expand", listener);
	}, [handleToggle]);

	const graph = useMemo(() => {
		if (!workflow && steps.length === 0) return null;

		return buildCanvasGraph(workflow, steps, {
			agentSteps,
			expandedSteps,
			artifacts,
			subflows: subflows ?? undefined,
		});
	}, [workflow, steps, artifacts, agentSteps, expandedSteps, subflows]);

	const { layoutNodes, isLayoutReady } = useGraphLayout(
		graph?.nodes ?? [],
		graph?.edges ?? [],
		{ direction: "LR" },
	);

	useEffect(() => {
		if (isLayoutReady && layoutNodes.length > 0) {
			// Double-RAF: first frame lets React Flow measure the container,
			// second frame fits the view once dimensions are known.
			requestAnimationFrame(() => {
				requestAnimationFrame(() => fitView(fitViewOptions));
			});
		}
	}, [isLayoutReady, layoutNodes, fitView]);

	if (!graph) {
		return null;
	}

	return (
		<div ref={containerRef} className="h-full w-full">
			<ReactFlow
				nodes={layoutNodes}
				edges={graph.edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				defaultEdgeOptions={defaultEdgeOptions}
				fitView
				fitViewOptions={fitViewOptions}
				minZoom={0.5}
				maxZoom={1.5}
				panOnDrag
				zoomOnScroll
				zoomOnPinch
				nodesDraggable={false}
				nodesConnectable={false}
				edgesReconnectable={false}
				proOptions={{ hideAttribution: true }}
				style={{ opacity: isLayoutReady ? 1 : 0 }}
			/>
		</div>
	);
}

export function WorkflowCanvas({
	workflow,
	steps,
	artifacts,
	agentSteps,
	subflows,
	className,
}: WorkflowCanvasProps) {
	return (
		<div className={cn("h-full w-full", className)}>
			<ReactFlowProvider>
				{workflow || steps.length > 0 ? (
					<WorkflowCanvasInner
						workflow={workflow}
						steps={steps}
						artifacts={artifacts}
						agentSteps={agentSteps}
						subflows={subflows}
					/>
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground">
						No workflow steps available
					</div>
				)}
			</ReactFlowProvider>
		</div>
	);
}
