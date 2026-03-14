import {
	type DefaultEdgeOptions,
	ReactFlow,
	ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useMemo } from "react";
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
	style: { stroke: "hsl(var(--border))" },
};

export interface WorkflowCanvasProps {
	readonly workflow: WorkflowDefinition | null;
	readonly steps: readonly Step[];
	readonly className?: string;
}

export function WorkflowCanvas({
	workflow,
	steps,
	className,
}: WorkflowCanvasProps) {
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

	if (!graph) {
		return (
			<div
				className={cn(
					"flex h-full items-center justify-center text-muted-foreground",
					className,
				)}
			>
				No workflow steps available
			</div>
		);
	}

	return (
		<div className={cn("h-full w-full", className)}>
			<ReactFlowProvider>
				<ReactFlow
					nodes={layoutNodes}
					edges={graph.edges}
					nodeTypes={nodeTypes}
					defaultEdgeOptions={defaultEdgeOptions}
					fitView
					fitViewOptions={{ padding: 0.2 }}
					panOnDrag
					zoomOnScroll
					zoomOnPinch
					nodesDraggable={false}
					nodesConnectable={false}
					edgesReconnectable={false}
					proOptions={{ hideAttribution: true }}
					style={{ opacity: isLayoutReady ? 1 : 0 }}
				/>
			</ReactFlowProvider>
		</div>
	);
}
