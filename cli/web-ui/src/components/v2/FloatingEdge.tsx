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

function getNodeIntersection(
	node: { x: number; y: number; w: number; h: number },
	target: { x: number; y: number },
) {
	const dx = target.x - node.x;
	const dy = target.y - node.y;

	if (dx === 0 && dy === 0) return { x: node.x, y: node.y };

	const slope = Math.abs(dy / dx);
	const halfW = node.w / 2;
	const halfH = node.h / 2;

	let ix: number;
	let iy: number;

	if (slope <= halfH / halfW) {
		ix = node.x + Math.sign(dx) * halfW;
		iy = node.y + (dy * halfW) / Math.abs(dx);
	} else {
		ix = node.x + (dx * halfH) / Math.abs(dy);
		iy = node.y + Math.sign(dy) * halfH;
	}

	return { x: ix, y: iy };
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

	const sourceIntersection = getNodeIntersection(sourceCenter, targetCenter);
	const targetIntersection = getNodeIntersection(targetCenter, sourceCenter);

	const [path] = getStraightPath({
		sourceX: sourceIntersection.x,
		sourceY: sourceIntersection.y,
		targetX: targetIntersection.x,
		targetY: targetIntersection.y,
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
