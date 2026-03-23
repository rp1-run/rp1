import { MessageSquare } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDismiss } from "@/hooks/useDismiss";
import type { SelectionPosition } from "@/hooks/useTextSelection";
import {
	findTextRange,
	getEditableText,
	getEditableTextNodes,
} from "@/lib/editable-text-nodes";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import type { Annotation } from "@/types/annotations";

interface AnnotationPosition {
	annotation: Annotation;
	top: number;
	height: number;
}

interface AnnotationGroup {
	annotations: Annotation[];
	top: number;
	height: number;
}

const GROUP_TOLERANCE = 20;

function computePosition(
	annotation: Annotation,
	containerRef: React.RefObject<HTMLElement | null>,
	gutterRef: React.RefObject<HTMLElement | null>,
): AnnotationPosition | null {
	if (annotation.anchor.type !== "text-selection" || !containerRef.current)
		return null;

	const container = containerRef.current;
	const { selectedText, contextBefore, contextAfter } = annotation.anchor;

	const nodes = getEditableTextNodes(container);
	const fullText = getEditableText(container);
	const searchPattern = contextBefore + selectedText + contextAfter;
	const patternIndex = fullText.indexOf(searchPattern);
	if (patternIndex === -1) return null;

	const startIndex = patternIndex + contextBefore.length;
	const endIndex = startIndex + selectedText.length;
	const found = findTextRange(nodes, startIndex, endIndex);

	if (found && gutterRef.current) {
		const { startNode, startOffset, endNode, endOffset } = found;
		try {
			const range = document.createRange();
			range.setStart(startNode, startOffset);
			range.setEnd(endNode, endOffset);
			const rect = range.getBoundingClientRect();
			const gutterRect = gutterRef.current.getBoundingClientRect();

			return {
				annotation,
				top: rect.top - gutterRect.top,
				height: rect.height,
			};
		} catch {
			return null;
		}
	}

	return null;
}

function groupByProximity(positions: AnnotationPosition[]): AnnotationGroup[] {
	if (positions.length === 0) return [];

	const sorted = [...positions].sort((a, b) => a.top - b.top);
	const groups: AnnotationGroup[] = [];
	let current: AnnotationGroup = {
		annotations: [sorted[0].annotation],
		top: sorted[0].top,
		height: sorted[0].height,
	};

	for (let i = 1; i < sorted.length; i++) {
		const pos = sorted[i];
		if (Math.abs(pos.top - current.top) <= GROUP_TOLERANCE) {
			current.annotations.push(pos.annotation);
			current.height = Math.max(current.height, pos.height);
		} else {
			groups.push(current);
			current = {
				annotations: [pos.annotation],
				top: pos.top,
				height: pos.height,
			};
		}
	}
	groups.push(current);
	return groups;
}

function GroupIndicator({
	group,
	gutterRef,
	onSingleClick,
	onGroupClick,
}: {
	readonly group: AnnotationGroup;
	readonly gutterRef: React.RefObject<HTMLElement | null>;
	readonly onSingleClick: (
		annotation: Annotation,
		position: SelectionPosition,
	) => void;
	readonly onGroupClick: (
		group: AnnotationGroup,
		position: SelectionPosition,
	) => void;
}) {
	const isSingle = group.annotations.length === 1;
	const allResolved = group.annotations.every((a) => a.status === "resolved");

	const handleClick = () => {
		const gutterRect = gutterRef.current?.getBoundingClientRect();
		if (!gutterRect) return;

		const pos: SelectionPosition = {
			x: gutterRect.right + 8,
			y: gutterRect.top + group.top,
			anchorRect: {
				left: gutterRect.left,
				right: gutterRect.right,
				top: gutterRect.top + group.top,
				bottom: gutterRect.top + group.top + group.height,
			},
		};

		if (isSingle) {
			onSingleClick(group.annotations[0], pos);
		} else {
			onGroupClick(group, pos);
		}
	};

	if (!gutterRef.current) return null;

	return createPortal(
		<button
			type="button"
			onClick={handleClick}
			className="absolute left-0 right-0 cursor-pointer group focus:outline-none"
			style={{
				top: group.top,
				height: Math.max(group.height, 24),
			}}
			aria-label={
				isSingle
					? `Annotation: ${group.annotations[0].content.slice(0, 50)}`
					: `${group.annotations.length} annotations`
			}
		>
			{/* Hidden spans for annotation navigation from sidebar */}
			{group.annotations.map((a) => (
				<span
					key={a.id}
					data-annotation-id={a.id}
					className="sr-only"
					aria-hidden="true"
				/>
			))}

			<div
				className={cn(
					"absolute right-0.5 top-0 flex items-center gap-0.5 rounded px-1 py-0.5 transition-colors",
					allResolved
						? "bg-fg-ghost/20 text-fg-ghost group-hover:text-fg-muted"
						: "bg-accent-amber/20 text-accent-amber group-hover:text-accent-amber/80",
				)}
			>
				<MessageSquare
					className="h-3 w-3"
					fill="currentColor"
					aria-hidden="true"
				/>
				{!isSingle && (
					<span className="text-[10px] font-medium tabular-nums">
						{group.annotations.length}
					</span>
				)}
			</div>
		</button>,
		gutterRef.current,
	);
}

function GroupPickerPopover({
	group,
	position,
	onSelect,
	onClose,
}: {
	readonly group: AnnotationGroup;
	readonly position: SelectionPosition;
	readonly onSelect: (
		annotation: Annotation,
		position: SelectionPosition,
	) => void;
	readonly onClose: () => void;
}) {
	const pickerRef = useRef<HTMLDivElement>(null);

	useDismiss({
		ref: pickerRef,
		onDismiss: onClose,
	});

	return (
		<div
			ref={pickerRef}
			data-group-picker
			className="fixed z-50 w-[240px] rounded border border-border bg-surface animate-in fade-in-0 duration-150"
			style={{
				left: `${position.anchorRect.right + 8}px`,
				top: `${position.anchorRect.top}px`,
			}}
			role="listbox"
			aria-label="Select annotation"
		>
			<p className="px-3 pt-2 pb-1 type-caption text-fg-ghost">
				{group.annotations.length} annotations on this line
			</p>
			{group.annotations.map((annotation) => {
				const isResolved = annotation.status === "resolved";
				return (
					<button
						key={annotation.id}
						type="button"
						role="option"
						aria-selected={false}
						onClick={() => onSelect(annotation, position)}
						className={cn(
							"flex w-full items-start gap-2 px-3 py-2 text-left transition-colors duration-150",
							"hover:bg-accent-ghost",
							isResolved && "opacity-60",
						)}
					>
						<span
							className={cn(
								"mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full",
								isResolved ? "bg-fg-ghost" : "bg-accent-amber",
							)}
						/>
						<div className="min-w-0 flex-1">
							<p className="type-secondary text-fg truncate">
								{annotation.content}
							</p>
							<p className="type-secondary text-fg-ghost">
								{annotation.author} · {formatRelativeTime(annotation.createdAt)}
								{annotation.replies.length > 0 &&
									` · ${annotation.replies.length} ${annotation.replies.length === 1 ? "reply" : "replies"}`}
							</p>
						</div>
					</button>
				);
			})}
		</div>
	);
}

export interface GroupedAnnotationIndicatorsProps {
	readonly annotations: readonly Annotation[];
	readonly containerRef: React.RefObject<HTMLElement | null>;
	readonly gutterRef: React.RefObject<HTMLElement | null>;
	readonly onAnnotationClick: (
		annotation: Annotation,
		position: SelectionPosition,
	) => void;
}

export function GroupedAnnotationIndicators({
	annotations,
	containerRef,
	gutterRef,
	onAnnotationClick,
}: GroupedAnnotationIndicatorsProps) {
	const [pickerState, setPickerState] = useState<{
		group: AnnotationGroup;
		position: SelectionPosition;
	} | null>(null);

	const [groups, setGroups] = useState<AnnotationGroup[]>([]);

	useEffect(() => {
		const compute = () => {
			const positions = annotations
				.map((a) => computePosition(a, containerRef, gutterRef))
				.filter((p): p is AnnotationPosition => p !== null);
			setGroups(groupByProximity(positions));
		};

		const timeoutId = setTimeout(compute, 100);

		let recomputeTimer: ReturnType<typeof setTimeout> | null = null;
		const debouncedCompute = () => {
			if (recomputeTimer) clearTimeout(recomputeTimer);
			recomputeTimer = setTimeout(compute, 50);
		};

		// Recompute when container DOM changes (e.g., Shiki highlighting completes)
		let mutationObserver: MutationObserver | null = null;
		let resizeObserver: ResizeObserver | null = null;
		if (containerRef.current) {
			mutationObserver = new MutationObserver(debouncedCompute);
			mutationObserver.observe(containerRef.current, {
				childList: true,
				subtree: true,
			});

			// Recompute when container resizes (e.g., sidebar opens/closes)
			resizeObserver = new ResizeObserver(debouncedCompute);
			resizeObserver.observe(containerRef.current);
		}

		return () => {
			clearTimeout(timeoutId);
			if (recomputeTimer) clearTimeout(recomputeTimer);
			mutationObserver?.disconnect();
			resizeObserver?.disconnect();
		};
	}, [annotations, containerRef, gutterRef]);

	const handleSingleClick = useCallback(
		(annotation: Annotation, position: SelectionPosition) => {
			setPickerState(null);
			onAnnotationClick(annotation, position);
		},
		[onAnnotationClick],
	);

	const handleGroupClick = useCallback(
		(group: AnnotationGroup, position: SelectionPosition) => {
			setPickerState({ group, position });
		},
		[],
	);

	const handlePickerSelect = useCallback(
		(annotation: Annotation, position: SelectionPosition) => {
			setPickerState(null);
			onAnnotationClick(annotation, position);
		},
		[onAnnotationClick],
	);

	const handlePickerClose = useCallback(() => {
		setPickerState(null);
	}, []);

	return (
		<>
			{groups.map((group) => (
				<GroupIndicator
					key={group.annotations.map((a) => a.id).join("-")}
					group={group}
					gutterRef={gutterRef}
					onSingleClick={handleSingleClick}
					onGroupClick={handleGroupClick}
				/>
			))}

			{pickerState && (
				<GroupPickerPopover
					group={pickerState.group}
					position={pickerState.position}
					onSelect={handlePickerSelect}
					onClose={handlePickerClose}
				/>
			)}
		</>
	);
}
