import {
	BaseEdge,
	type EdgeProps,
	getStraightPath,
	type InternalNode,
	useInternalNode,
} from "@xyflow/react";

/**
 * Get the absolute center and dimensions of a node.
 * Uses internals.positionAbsolute so child nodes (inside groups)
 * resolve to flow-space coordinates rather than parent-relative ones.
 */
function getNodeAbsoluteCenter(node: InternalNode) {
	const w = node.measured?.width ?? 200;
	const h = node.measured?.height ?? 60;
	const pos = node.internals.positionAbsolute;
	return { x: pos.x + w / 2, y: pos.y + h / 2, w, h };
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

	const src = getNodeAbsoluteCenter(sourceNode);
	const tgt = getNodeAbsoluteCenter(targetNode);

	const dx = tgt.x - src.x;
	const dy = tgt.y - src.y;
	const absDx = Math.abs(dx);
	const absDy = Math.abs(dy);

	// Determine layout direction by comparing horizontal vs vertical offset.
	const isVertical = absDy > absDx;

	// Detect backward edges (going against the primary flow direction).
	const isBackward = isVertical ? dy < 0 : dx < 0;

	if (isBackward) {
		// Backward edges curve outward from the node edges.
		let sx: number;
		let sy: number;
		let tx: number;
		let ty: number;
		let curveOffset: number;

		if (isVertical) {
			// Vertical backward: curve out to the right
			sx = src.x + src.w / 2;
			sy = src.y;
			tx = tgt.x + tgt.w / 2;
			ty = tgt.y;
			const distance = Math.abs(src.y - tgt.y);
			curveOffset = Math.min(distance * 0.3, 60);
			// Use horizontal offset for vertical backward
			const mx = Math.max(sx, tx) + curveOffset;
			const my = (sy + ty) / 2;
			const path = `M ${sx},${sy} Q ${mx},${my} ${tx},${ty}`;
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

		// Horizontal backward: curve downward below nodes
		sx = src.x;
		sy = src.y + src.h / 2;
		tx = tgt.x;
		ty = tgt.y + tgt.h / 2;
		const distance = Math.abs(src.x - tgt.x);
		curveOffset = Math.min(distance * 0.3, 60);

		const path = buildCurvedPath(sx, sy, tx, ty, curveOffset);
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

	// Forward edges: straight line from source edge to target edge.
	let sx: number;
	let sy: number;
	let tx: number;
	let ty: number;

	if (isVertical) {
		// TB layout: connect bottom-center → top-center
		sx = src.x;
		sy = src.y + src.h / 2;
		tx = tgt.x;
		ty = tgt.y - tgt.h / 2;
	} else {
		// LR layout: connect right-center → left-center
		sx = src.x + src.w / 2;
		sy = src.y;
		tx = tgt.x - tgt.w / 2;
		ty = tgt.y;
	}

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
