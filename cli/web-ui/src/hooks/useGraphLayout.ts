import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import { useMemo } from "react";
import type { StepNodeData } from "@/lib/workflow-converter";

interface UseGraphLayoutOptions {
	readonly direction?: "TB" | "LR";
	readonly nodeWidth?: number;
	readonly nodeHeight?: number;
}

interface UseGraphLayoutResult {
	readonly layoutNodes: Node<StepNodeData>[];
	readonly isLayoutReady: boolean;
}

/**
 * Compute dagre-based graph layout positions for React Flow nodes.
 * Creates a new dagre graph when nodes or edges change, applies layout,
 * and returns positioned nodes with centered coordinates.
 */
export function useGraphLayout(
	nodes: Node<StepNodeData>[],
	edges: Edge[],
	options?: UseGraphLayoutOptions,
): UseGraphLayoutResult {
	const direction = options?.direction ?? "TB";
	const nodeWidth = options?.nodeWidth ?? 280;
	const nodeHeight = options?.nodeHeight ?? 120;

	const layoutNodes = useMemo(() => {
		if (nodes.length === 0) {
			return [];
		}

		const g = new dagre.graphlib.Graph();
		g.setGraph({
			rankdir: direction,
			nodesep: 50,
			ranksep: 80,
			marginx: 40,
			marginy: 40,
		});
		g.setDefaultEdgeLabel(() => ({}));

		for (const node of nodes) {
			const w = (node.style?.width as number) ?? nodeWidth;
			const h = (node.style?.height as number) ?? nodeHeight;
			g.setNode(node.id, { width: w, height: h });
		}

		for (const edge of edges) {
			g.setEdge(edge.source, edge.target);
		}

		dagre.layout(g);

		return nodes.map((node) => {
			const dagreNode = g.node(node.id);
			const w = (node.style?.width as number) ?? nodeWidth;
			const h = (node.style?.height as number) ?? nodeHeight;

			return {
				...node,
				position: {
					x: dagreNode.x - w / 2,
					y: dagreNode.y - h / 2,
				},
			};
		});
	}, [nodes, edges, direction, nodeWidth, nodeHeight]);

	return {
		layoutNodes,
		isLayoutReady: layoutNodes.length > 0 || nodes.length === 0,
	};
}
