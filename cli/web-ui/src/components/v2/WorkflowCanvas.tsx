import {
	type DefaultEdgeOptions,
	ReactFlow,
	ReactFlowProvider,
	useReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useEffect, useMemo } from "react";
import { useGraphLayout } from "@/hooks/useGraphLayout";
import type { WorkflowDefinition } from "@/hooks/useWorkflowSteps";
import { cn } from "@/lib/utils";
import {
	stepsToReactFlow,
	workflowToReactFlow,
} from "@/lib/workflow-converter";
import type { Step } from "@/types/runs";
import { StepNode } from "./StepNode";

const nodeTypes = { stepNode: StepNode } as const;

const defaultEdgeOptions: DefaultEdgeOptions = {
	type: "smoothstep",
	style: { stroke: "hsl(var(--border))", strokeWidth: 1.5 },
};

const fitViewOptions = { padding: 0.3, maxZoom: 1.2 } as const;

export interface WorkflowCanvasProps {
	readonly workflow: WorkflowDefinition | null;
	readonly steps: readonly Step[];
	readonly className?: string;
}

function WorkflowCanvasInner({
	workflow,
	steps,
}: Omit<WorkflowCanvasProps, "className">) {
	const { fitView } = useReactFlow();

	const graph = useMemo(() => {
		if (workflow) {
			return workflowToReactFlow(workflow, steps);
		}
		if (steps.length > 0) {
			return stepsToReactFlow(steps);
		}
		return null;
	}, [workflow, steps]);

	const { layoutNodes, isLayoutReady } = useGraphLayout(
		graph?.nodes ?? [],
		graph?.edges ?? [],
		{ direction: "LR" },
	);

	useEffect(() => {
		if (isLayoutReady && layoutNodes.length > 0) {
			requestAnimationFrame(() => fitView(fitViewOptions));
		}
	}, [isLayoutReady, layoutNodes, fitView]);

	if (!graph) {
		return null;
	}

	return (
		<ReactFlow
			nodes={layoutNodes}
			edges={graph.edges}
			nodeTypes={nodeTypes}
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
	);
}

export function WorkflowCanvas({
	workflow,
	steps,
	className,
}: WorkflowCanvasProps) {
	return (
		<div className={cn("h-full w-full", className)}>
			<ReactFlowProvider>
				{workflow || steps.length > 0 ? (
					<WorkflowCanvasInner workflow={workflow} steps={steps} />
				) : (
					<div className="flex h-full items-center justify-center text-muted-foreground">
						No workflow steps available
					</div>
				)}
			</ReactFlowProvider>
		</div>
	);
}
