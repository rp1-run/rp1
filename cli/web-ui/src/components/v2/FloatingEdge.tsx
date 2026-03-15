import {
	BaseEdge,
	type EdgeProps,
	getStraightPath,
	useInternalNode,
} from "@xyflow/react";

function getNodeCenter(node: {
	position: { x: number; y: number };
	measured?: { width?: number; height?: number };
}) {
	const w = node.measured?.width ?? 200;
	const h = node.measured?.height ?? 60;
	return { x: node.position.x + w / 2, y: node.position.y + h / 2, w, h };
}

function buildCurvedPath(
	sx: number,
	sy: number,
	tx: number,
	ty: number,
	offset: number,
) {
	const mx = (sx + tx) / 2;
	const my = (sy + ty) / 2 + offset;
	return `M ${sx},${sy} Q ${mx},${my} ${tx},${ty}`;
}

export function FloatingEdge({
	id,
	source,
	target,
	style,
	markerEnd,
	markerStart,
}: EdgeProps) {
	const sourceNode = useInternalNode(source);
	const targetNode = useInternalNode(target);

	if (!sourceNode || !targetNode) return null;

	const sourceCenter = getNodeCenter(sourceNode);
	const targetCenter = getNodeCenter(targetNode);

	const isBackward = sourceCenter.x > targetCenter.x;

	if (isBackward) {
		const srcBottom = {
			x: sourceCenter.x,
			y: sourceCenter.y + sourceCenter.h / 2,
		};
		const tgtBottom = {
			x: targetCenter.x,
			y: targetCenter.y + targetCenter.h / 2,
		};

		const distance = Math.abs(sourceCenter.x - targetCenter.x);
		const curveOffset = Math.min(distance * 0.3, 60);

		const path = buildCurvedPath(
			srcBottom.x,
			srcBottom.y,
			tgtBottom.x,
			tgtBottom.y,
			curveOffset,
		);

		return (
			<BaseEdge
				id={id}
				path={path}
				style={style}
				markerEnd={markerEnd}
				markerStart={markerStart}
			/>
		);
	}

	// For forward (LR) edges, connect at right-center of source
	// and left-center of target for clean horizontal connections,
	// especially when nodes have different heights (e.g. group nodes).
	const sx = sourceCenter.x + sourceCenter.w / 2;
	const sy = sourceCenter.y;
	const tx = targetCenter.x - targetCenter.w / 2;
	const ty = targetCenter.y;

	const [path] = getStraightPath({
		sourceX: sx,
		sourceY: sy,
		targetX: tx,
		targetY: ty,
	});

	return (
		<BaseEdge
			id={id}
			path={path}
			style={style}
			markerEnd={markerEnd}
			markerStart={markerStart}
		/>
	);
}
