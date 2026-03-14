import dagre from "@dagrejs/dagre";
import type { Edge, Node } from "@xyflow/react";
import { useMemo } from "react";

interface UseGraphLayoutOptions {
	readonly direction?: "TB" | "LR";
	readonly nodeWidth?: number;
	readonly nodeHeight?: number;
}

interface UseGraphLayoutResult {
	readonly layoutNodes: Node[];
	readonly isLayoutReady: boolean;
}

/**
 * Compute dagre-based graph layout positions for React Flow nodes.
 * Creates a new dagre graph when nodes or edges change, applies layout,
 * and returns positioned nodes with centered coordinates.
 *
 * Child nodes (those with parentId) are excluded from the top-level layout
 * since their positions are relative to their parent and computed during
 * the sub-flow layout pass in buildCanvasGraph.
 */
export function useGraphLayout(
	nodes: Node[],
	edges: Edge[],
	options?: UseGraphLayoutOptions,
): UseGraphLayoutResult {
	const direction = options?.direction ?? "TB";
	const nodeWidth = options?.nodeWidth ?? 200;
	const nodeHeight = options?.nodeHeight ?? 60;

	const layoutNodes = useMemo(() => {
		if (nodes.length === 0) {
			return [];
		}

		const topLevelNodes = nodes.filter((n) => !n.parentId);
		const childNodes = nodes.filter((n) => !!n.parentId);

		const topLevelEdges = edges.filter((e) => {
			const srcIsChild = nodes.some((n) => n.id === e.source && n.parentId);
			const tgtIsChild = nodes.some((n) => n.id === e.target && n.parentId);
			return !srcIsChild && !tgtIsChild;
		});

		const g = new dagre.graphlib.Graph();
		g.setGraph({
			rankdir: direction,
			nodesep: direction === "LR" ? 40 : 50,
			ranksep: direction === "LR" ? 60 : 80,
			marginx: 20,
			marginy: 20,
		});
		g.setDefaultEdgeLabel(() => ({}));

		for (const node of topLevelNodes) {
			const w = (node.style?.width as number) ?? nodeWidth;
			const h = (node.style?.height as number) ?? nodeHeight;
			g.setNode(node.id, { width: w, height: h });
		}

		for (const edge of topLevelEdges) {
			g.setEdge(edge.source, edge.target);
		}

		dagre.layout(g);

		const positionedTopLevel = topLevelNodes.map((node) => {
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

		return [...positionedTopLevel, ...childNodes];
	}, [nodes, edges, direction, nodeWidth, nodeHeight]);

	return {
		layoutNodes,
		isLayoutReady: layoutNodes.length > 0 || nodes.length === 0,
	};
}
