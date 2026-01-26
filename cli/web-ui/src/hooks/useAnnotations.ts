/**
 * Hook for working with annotations in components.
 * Provides filtered annotations, lookup functions, and memoized selectors.
 */

import { useCallback, useMemo } from "react";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { Anchor, Annotation, AnnotationFilter } from "@/types/annotations";

/** Options for useAnnotations hook */
export interface UseAnnotationsOptions {
	/** Filter to specific artifact path */
	readonly artifactPath?: string;
	/** Apply additional filters */
	readonly filter?: Partial<AnnotationFilter>;
}

/** Result returned by useAnnotations hook */
export interface UseAnnotationsResult {
	/** All annotations (optionally filtered by artifact) */
	readonly annotations: readonly Annotation[];
	/** Annotations grouped by status */
	readonly groupedAnnotations: {
		readonly open: readonly Annotation[];
		readonly resolved: readonly Annotation[];
		readonly orphaned: readonly Annotation[];
	};
	/** Total count of annotations */
	readonly count: number;
	/** Count by status */
	readonly countByStatus: {
		readonly open: number;
		readonly resolved: number;
		readonly orphaned: number;
	};
	/** Loading state */
	readonly isLoading: boolean;
	/** Error state */
	readonly error: string | null;
	/** Look up annotation by ID */
	readonly getAnnotationById: (id: string) => Annotation | undefined;
	/** Find annotations at a specific anchor position */
	readonly getAnnotationsAtPosition: (anchor: Anchor) => readonly Annotation[];
	/** Current filter */
	readonly filter: AnnotationFilter;
	/** Update filter */
	readonly setFilter: (filter: AnnotationFilter) => void;
	/** Refetch annotations */
	readonly refetch: () => Promise<void>;
}

/**
 * Check if a date is within a date range filter.
 */
function isInDateRange(
	date: string,
	range: AnnotationFilter["dateRange"],
): boolean {
	if (range === "all") return true;

	const annotationDate = new Date(date);
	const now = new Date();

	switch (range) {
		case "today": {
			const startOfDay = new Date(now.setHours(0, 0, 0, 0));
			return annotationDate >= startOfDay;
		}
		case "week": {
			const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
			return annotationDate >= weekAgo;
		}
		case "month": {
			const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
			return annotationDate >= monthAgo;
		}
		default:
			return true;
	}
}

/**
 * Check if an annotation matches a filter.
 */
function matchesFilter(
	annotation: Annotation,
	filter: AnnotationFilter,
): boolean {
	// Status filter
	if (filter.status !== "all" && annotation.status !== filter.status) {
		return false;
	}

	// Author filter
	if (filter.author !== null && annotation.author !== filter.author) {
		return false;
	}

	// Date range filter
	if (!isInDateRange(annotation.createdAt, filter.dateRange)) {
		return false;
	}

	return true;
}

/**
 * Check if two anchors refer to the same position.
 */
function anchorsMatch(a: Anchor, b: Anchor): boolean {
	if (a.type !== b.type) return false;

	switch (a.type) {
		case "text-selection":
			if (b.type !== "text-selection") return false;
			return (
				a.startOffset === b.startOffset &&
				a.endOffset === b.endOffset &&
				a.selectedText === b.selectedText
			);

		case "hidden-anchor":
			if (b.type !== "hidden-anchor") return false;
			return a.anchorId === b.anchorId;

		case "line":
			if (b.type !== "line") return false;
			return a.lineNumber === b.lineNumber;

		default:
			return false;
	}
}

/**
 * Hook for consuming annotation context with filtering and lookup utilities.
 *
 * @param options - Configuration options
 * @returns Filtered annotations and utility functions
 */
export function useAnnotations(
	options: UseAnnotationsOptions = {},
): UseAnnotationsResult {
	const { artifactPath, filter: filterOverride } = options;

	const context = useAnnotationContext();

	// Apply artifact path filter
	const artifactAnnotations = useMemo(() => {
		if (!artifactPath) return context.annotations;
		return context.annotations.filter((a) => a.artifactPath === artifactPath);
	}, [context.annotations, artifactPath]);

	// Merge filter from options with context filter
	const effectiveFilter = useMemo<AnnotationFilter>(
		() => ({
			...context.filter,
			...filterOverride,
		}),
		[context.filter, filterOverride],
	);

	// Apply filter to annotations
	const filteredAnnotations = useMemo(() => {
		return artifactAnnotations.filter((a) => matchesFilter(a, effectiveFilter));
	}, [artifactAnnotations, effectiveFilter]);

	// Group annotations by status
	const groupedAnnotations = useMemo(() => {
		const open: Annotation[] = [];
		const resolved: Annotation[] = [];
		const orphaned: Annotation[] = [];

		for (const annotation of filteredAnnotations) {
			if (annotation.orphaned) {
				orphaned.push(annotation);
			} else if (annotation.status === "resolved") {
				resolved.push(annotation);
			} else {
				open.push(annotation);
			}
		}

		// Sort each group by creation date (newest first)
		const sortByDate = (a: Annotation, b: Annotation) =>
			new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

		open.sort(sortByDate);
		resolved.sort(sortByDate);
		orphaned.sort(sortByDate);

		return { open, resolved, orphaned };
	}, [filteredAnnotations]);

	// Count annotations
	const count = filteredAnnotations.length;

	const countByStatus = useMemo(
		() => ({
			open: groupedAnnotations.open.length,
			resolved: groupedAnnotations.resolved.length,
			orphaned: groupedAnnotations.orphaned.length,
		}),
		[groupedAnnotations],
	);

	// Create lookup map for getAnnotationById
	const annotationMap = useMemo(() => {
		const map = new Map<string, Annotation>();
		for (const annotation of artifactAnnotations) {
			map.set(annotation.id, annotation);
		}
		return map;
	}, [artifactAnnotations]);

	// Lookup annotation by ID
	const getAnnotationById = useCallback(
		(id: string): Annotation | undefined => {
			return annotationMap.get(id);
		},
		[annotationMap],
	);

	// Find annotations at a specific anchor position
	const getAnnotationsAtPosition = useCallback(
		(anchor: Anchor): readonly Annotation[] => {
			return artifactAnnotations.filter(
				(a) => !a.orphaned && anchorsMatch(a.anchor, anchor),
			);
		},
		[artifactAnnotations],
	);

	return {
		annotations: filteredAnnotations,
		groupedAnnotations,
		count,
		countByStatus,
		isLoading: context.isLoading,
		error: context.error,
		getAnnotationById,
		getAnnotationsAtPosition,
		filter: context.filter,
		setFilter: context.setFilter,
		refetch: context.refetch,
	};
}
