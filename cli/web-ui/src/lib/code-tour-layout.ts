import type { EdgeLabel, GraphLabel, NodeLabel } from "@dagrejs/dagre";
import { layout as dagreLayout, Graph } from "@dagrejs/dagre";
import type {
	CodeTourViewEdge,
	CodeTourViewModel,
} from "@/lib/code-tour-view-model";

export interface CodeTourLayoutPoint {
	readonly x: number;
	readonly y: number;
	readonly z: number;
}

export interface CodeTourSceneLayout {
	readonly concepts: ReadonlyMap<string, CodeTourLayoutPoint>;
}

interface LayoutNode {
	readonly id: string;
	readonly label: string;
	readonly weight: number;
	readonly lane: number;
	readonly epicenter?: boolean;
}

interface LayoutEdge {
	readonly id: string;
	readonly from: string;
	readonly to: string;
	readonly weight: number;
	readonly minlen: number;
}

interface LayoutOptions {
	readonly nodeWidthBase: number;
	readonly nodeHeight: number;
	readonly targetWidth: number;
	readonly targetDepth: number;
	readonly ranksep: number;
	readonly nodesep: number;
	readonly laneSpacing: number;
	readonly verticalLift: number;
	readonly collisionRadius: number;
	readonly collisionIterations: number;
}

const CONCEPT_LAYOUT: LayoutOptions = {
	nodeWidthBase: 3.8,
	nodeHeight: 1.8,
	targetWidth: 25,
	targetDepth: 16,
	ranksep: 5.8,
	nodesep: 3.2,
	laneSpacing: 4.8,
	verticalLift: 1.3,
	collisionRadius: 2.45,
	collisionIterations: 10,
};

export function buildCodeTourSceneLayout(
	tour: CodeTourViewModel,
): CodeTourSceneLayout {
	return {
		concepts: layoutConcepts(tour),
	};
}

function layoutConcepts(
	tour: CodeTourViewModel,
): ReadonlyMap<string, CodeTourLayoutPoint> {
	const domainLaneById = new Map(
		tour.domains.map((domain, index) => [domain.id, index]),
	);
	const nodes = tour.concepts.map((concept, index) => ({
		id: concept.id,
		label: concept.label,
		weight: concept.changeCount,
		lane: domainLaneById.get(concept.domain.id) ?? index,
		epicenter: concept.epicenter,
	}));
	const edges = visibleEdges(tour.conceptEdges, 3);

	return layoutNodes(nodes, edges, CONCEPT_LAYOUT);
}

function layoutNodes(
	nodes: readonly LayoutNode[],
	edges: readonly LayoutEdge[],
	options: LayoutOptions,
): ReadonlyMap<string, CodeTourLayoutPoint> {
	if (nodes.length === 0) return new Map();
	if (nodes.length === 1) {
		return new Map([[nodes[0].id, { x: 0, y: 0, z: 0 }]]);
	}

	const graph = new Graph<GraphLabel, NodeLabel, EdgeLabel>({
		directed: true,
		multigraph: true,
	});
	graph.setGraph({
		rankdir: "LR",
		ranker: "network-simplex",
		acyclicer: "greedy",
		ranksep: options.ranksep,
		nodesep: options.nodesep,
		edgesep: 1.2,
		marginx: 0,
		marginy: 0,
	});
	graph.setDefaultEdgeLabel(() => ({}));

	for (const node of nodes) {
		graph.setNode(node.id, {
			width: nodeWidth(node, options),
			height: options.nodeHeight,
		});
	}

	for (const edge of edges) {
		if (edge.from === edge.to) continue;
		if (!graph.hasNode(edge.from) || !graph.hasNode(edge.to)) continue;
		// Dagre's rankers can stall on some dense graphs with fractional weights.
		// Keep weights integral and use the values only as relative priorities.
		graph.setEdge(
			edge.from,
			edge.to,
			{
				weight: edge.weight,
				minlen: edge.minlen,
			},
			edge.id,
		);
	}

	dagreLayout(graph);
	return normalizeLayout(nodes, graph, options);
}

function normalizeLayout(
	nodes: readonly LayoutNode[],
	graph: Graph<GraphLabel, NodeLabel, EdgeLabel>,
	options: LayoutOptions,
): ReadonlyMap<string, CodeTourLayoutPoint> {
	const laneIndexByValue = new Map(
		Array.from(new Set(nodes.map((node) => node.lane)))
			.sort((left, right) => left - right)
			.map((lane, index) => [lane, index]),
	);
	const laneCenter = (laneIndexByValue.size - 1) / 2;
	const rawPositions = nodes
		.map((node, index) => {
			const point = graph.node(node.id);
			const laneIndex = laneIndexByValue.get(node.lane) ?? 0;
			const laneOffset = (laneIndex - laneCenter) * options.laneSpacing;
			return {
				node,
				index,
				x: finiteNumber(point?.x) ? point.x : index * options.nodesep,
				z: (finiteNumber(point?.y) ? point.y : 0) + laneOffset,
			};
		})
		.sort((left, right) => left.index - right.index);
	const bounds = rawPositions.reduce(
		(current, position) => ({
			minX: Math.min(current.minX, position.x),
			maxX: Math.max(current.maxX, position.x),
			minZ: Math.min(current.minZ, position.z),
			maxZ: Math.max(current.maxZ, position.z),
		}),
		{
			minX: Number.POSITIVE_INFINITY,
			maxX: Number.NEGATIVE_INFINITY,
			minZ: Number.POSITIVE_INFINITY,
			maxZ: Number.NEGATIVE_INFINITY,
		},
	);
	const width = Math.max(bounds.maxX - bounds.minX, 1);
	const depth = Math.max(bounds.maxZ - bounds.minZ, 1);
	const scale = Math.min(
		options.targetWidth / width,
		options.targetDepth / depth,
		1.65,
	);
	const centerX = (bounds.minX + bounds.maxX) / 2;
	const centerZ = (bounds.minZ + bounds.maxZ) / 2;

	const normalizedPositions = rawPositions.map((position) => {
		const lift =
			((position.index % 3) - 1) *
			options.verticalLift *
			(position.node.epicenter ? 0 : 1);
		return {
			...position,
			x: (position.x - centerX) * scale,
			y: position.node.epicenter ? 0 : lift,
			z: (position.z - centerZ) * scale,
			radius: collisionRadius(position.node, options),
		};
	});

	return new Map(
		separateLayoutCollisions(normalizedPositions, options).map((position) => [
			position.node.id,
			{
				x: position.x,
				y: position.y,
				z: position.z,
			},
		]),
	);
}

function separateLayoutCollisions(
	positions: readonly {
		readonly node: LayoutNode;
		readonly index: number;
		readonly x: number;
		readonly y: number;
		readonly z: number;
		readonly radius: number;
	}[],
	options: LayoutOptions,
): readonly {
	readonly node: LayoutNode;
	readonly x: number;
	readonly y: number;
	readonly z: number;
}[] {
	const separated = positions.map((position) => ({ ...position }));
	for (
		let iteration = 0;
		iteration < options.collisionIterations;
		iteration += 1
	) {
		let moved = false;
		for (let leftIndex = 0; leftIndex < separated.length; leftIndex += 1) {
			for (
				let rightIndex = leftIndex + 1;
				rightIndex < separated.length;
				rightIndex += 1
			) {
				const left = separated[leftIndex];
				const right = separated[rightIndex];
				const minDistance = left.radius + right.radius;
				const delta = separationDelta(left, right, minDistance);
				if (delta.distance >= minDistance) continue;

				const push = (minDistance - delta.distance) * 0.54;
				left.x -= delta.x * push;
				left.z -= delta.z * push;
				right.x += delta.x * push;
				right.z += delta.z * push;
				moved = true;
			}
		}
		if (!moved) break;
	}
	return separated;
}

function separationDelta(
	left: { readonly index: number; readonly x: number; readonly z: number },
	right: { readonly index: number; readonly x: number; readonly z: number },
	minDistance: number,
): { readonly x: number; readonly z: number; readonly distance: number } {
	const dx = right.x - left.x;
	const dz = right.z - left.z;
	const distance = Math.hypot(dx, dz);
	const sameRank = Math.abs(dx) < minDistance * 0.85;
	if (distance < 0.001 || sameRank) {
		const z =
			Math.abs(dz) > 0.001 ? Math.sign(dz) : indexDirection(left, right);
		return { x: Math.sign(dx) * 0.08, z, distance };
	}
	return {
		x: dx / distance,
		z: dz / distance,
		distance,
	};
}

function indexDirection(
	left: { readonly index: number },
	right: { readonly index: number },
): number {
	return left.index < right.index ? 1 : -1;
}

function collisionRadius(node: LayoutNode, options: LayoutOptions): number {
	const labelUnits = Math.min(node.label.length * 0.018, 0.7);
	const weightUnits = Math.min(Math.max(node.weight, 0) * 0.035, 0.55);
	const epicenterUnits = node.epicenter ? 0.65 : 0;
	return options.collisionRadius + labelUnits + weightUnits + epicenterUnits;
}

function nodeWidth(node: LayoutNode, options: LayoutOptions): number {
	const labelUnits = Math.min(node.label.length * 0.085, 2.7);
	const weightUnits = Math.min(Math.max(node.weight, 0) * 0.09, 1.4);
	return options.nodeWidthBase + labelUnits + weightUnits;
}

function visibleEdges(
	edges: readonly CodeTourViewEdge[],
	weight: number,
): readonly LayoutEdge[] {
	return edges.map((edge, index) => ({
		id: `visible:${edge.id}:${index}`,
		from: edge.from,
		to: edge.to,
		weight,
		minlen: 1,
	}));
}

function finiteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}
