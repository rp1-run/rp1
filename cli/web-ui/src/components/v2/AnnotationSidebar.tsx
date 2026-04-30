import {
	AlertTriangle,
	CornerDownRight,
	Filter,
	MessageSquare,
	X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAnnotations } from "@/hooks/useAnnotations";
import { needsTruncation, truncateContent } from "@/lib/content-truncation";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { Annotation, AnnotationFilter } from "@/types/annotations";
import { PanelHeader, PanelHeaderIconButton } from "./PanelHeader";
import { Select } from "./Select";

export interface AnnotationSidebarProps {
	artifactPath: string;
	onClose: () => void;
	className?: string;
}

type StatusFilterValue = AnnotationFilter["status"];
type DateRangeValue = AnnotationFilter["dateRange"];
type AuthorFilterValue = string | null;

const STATUS_OPTIONS: { value: StatusFilterValue; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "open", label: "Open" },
	{ value: "resolved", label: "Resolved" },
];

const DATE_OPTIONS: { value: DateRangeValue; label: string }[] = [
	{ value: "all", label: "All Time" },
	{ value: "today", label: "Today" },
	{ value: "week", label: "This Week" },
	{ value: "month", label: "This Month" },
];

const ALL_AUTHORS_VALUE = "__all__";

interface AnnotationItemProps {
	annotation: Annotation;
	onClick: () => void;
	isExpanded: boolean;
	onToggleExpand: () => void;
}

function AnnotationItem({
	annotation,
	onClick,
	isExpanded,
	onToggleExpand,
}: AnnotationItemProps) {
	const anchorPreview = getAnchorPreview(annotation);
	const isResolved = annotation.status === "resolved";
	const replyCount = annotation.replies.length;
	const showTruncation = needsTruncation(annotation.content);
	const displayContent = isExpanded
		? annotation.content
		: truncateContent(annotation.content);

	return (
		<div
			className={cn(
				"w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
				"hover:border-border hover:bg-muted/50",
				isResolved && "opacity-60",
			)}
		>
			<button
				type="button"
				onClick={onClick}
				className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
			>
				<div className="flex items-start gap-2">
					<div
						className={cn(
							"mt-1.5 h-2 w-2 shrink-0 rounded-full",
							isResolved ? "bg-terminal-green" : "bg-annotation-open",
						)}
						role="img"
						aria-label={isResolved ? "Resolved" : "Open"}
					/>
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs text-muted-foreground">
							{anchorPreview}
						</p>
						<p className="mt-0.5 whitespace-pre-wrap text-sm">
							{displayContent}
						</p>
						<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
							<span>{annotation.author}</span>
							<span>-</span>
							<span>{formatRelativeTime(annotation.createdAt)}</span>
							{replyCount > 0 && (
								<>
									<span>-</span>
									<span>
										{replyCount} {replyCount === 1 ? "reply" : "replies"}
									</span>
								</>
							)}
						</div>
					</div>
				</div>
			</button>
			{showTruncation && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleExpand();
					}}
					className="ml-4 mt-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
				>
					{isExpanded ? "Show less" : "Show more"}
				</button>
			)}
		</div>
	);
}

/**
 * Inline thread view for orphaned annotations.
 * Since the anchor is missing or the thread is closed, clicking cannot scroll
 * to an inline position. Instead, the full thread (parent + replies) is shown
 * directly inside the sidebar card.
 */
interface OrphanedAnnotationItemProps {
	annotation: Annotation;
	isThreadOpen: boolean;
	onToggleThread: () => void;
	expandedComments: Set<string>;
	onToggleExpand: (id: string) => void;
}

function OrphanedAnnotationItem({
	annotation,
	isThreadOpen,
	onToggleThread,
	expandedComments,
	onToggleExpand,
}: OrphanedAnnotationItemProps) {
	const anchorPreview = getAnchorPreview(annotation);
	const isResolved = annotation.status === "resolved";
	const replyCount = annotation.replies.length;
	const showTruncation = needsTruncation(annotation.content);
	const isContentExpanded = expandedComments.has(annotation.id);
	const displayContent = isContentExpanded
		? annotation.content
		: truncateContent(annotation.content);

	return (
		<div
			className={cn(
				"rp1-orphaned-card w-full rounded-md border px-2 py-1.5 text-left transition-colors",
				isThreadOpen
					? "border-border bg-muted/30"
					: "border-transparent hover:border-border hover:bg-muted/50",
				isResolved && "opacity-60",
			)}
		>
			<button
				type="button"
				onClick={onToggleThread}
				className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
			>
				<div className="flex items-start gap-2">
					<div
						className={cn(
							"mt-1.5 h-2 w-2 shrink-0 rounded-full",
							isResolved ? "bg-terminal-green" : "bg-annotation-open",
						)}
						role="img"
						aria-label={isResolved ? "Resolved" : "Open"}
					/>
					<div className="min-w-0 flex-1">
						<p className="truncate text-xs text-muted-foreground">
							{anchorPreview}
						</p>
						<p className="mt-0.5 whitespace-pre-wrap text-sm">
							{displayContent}
						</p>
						<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
							<span>{annotation.author}</span>
							<span>-</span>
							<span>{formatRelativeTime(annotation.createdAt)}</span>
							{replyCount > 0 && (
								<>
									<span>-</span>
									<span>
										{replyCount} {replyCount === 1 ? "reply" : "replies"}
									</span>
								</>
							)}
						</div>
						<p className="mt-1 text-xs text-status-warning">
							{isResolved ? "Thread closed" : "Anchor no longer present"}
						</p>
					</div>
				</div>
			</button>

			{showTruncation && !isThreadOpen && (
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						onToggleExpand(annotation.id);
					}}
					className="ml-4 mt-1 text-xs text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
				>
					{isContentExpanded ? "Show less" : "Show more"}
				</button>
			)}

			{isThreadOpen && (
				<div className="rp1-orphaned-thread mt-2 ml-4 border-t border-border pt-2">
					<p className="whitespace-pre-wrap text-sm text-fg">
						{annotation.content}
					</p>

					{annotation.replies.length > 0 && (
						<div className="mt-2 space-y-1">
							{annotation.replies.map((reply) => {
								const replyExpanded = expandedComments.has(reply.id);
								const replyShowTruncation = needsTruncation(reply.content);
								const replyDisplay = replyExpanded
									? reply.content
									: truncateContent(reply.content);

								return (
									<div key={reply.id} className="flex gap-2 py-1.5">
										<CornerDownRight
											className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
											strokeWidth={1.5}
											aria-hidden="true"
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2 text-xs text-muted-foreground">
												<span className="text-foreground">{reply.author}</span>
												<span>{formatRelativeTime(reply.createdAt)}</span>
											</div>
											<p className="mt-0.5 whitespace-pre-wrap text-sm">
												{replyDisplay}
											</p>
											{replyShowTruncation && (
												<button
													type="button"
													onClick={(e) => {
														e.stopPropagation();
														onToggleExpand(reply.id);
													}}
													className="text-xs text-muted-foreground hover:text-foreground transition-colors duration-150 mt-1"
												>
													{replyExpanded ? "Show less" : "Show more"}
												</button>
											)}
										</div>
									</div>
								);
							})}
						</div>
					)}
				</div>
			)}
		</div>
	);
}

function getAnchorPreview(annotation: Annotation): string {
	const anchor = annotation.anchor;
	switch (anchor.type) {
		case "text-selection":
			return `"${anchor.selectedText.slice(0, 50)}${anchor.selectedText.length > 50 ? "..." : ""}"`;
		case "hidden-anchor":
			return `#${anchor.anchorId}`;
		case "line":
			return `Line ${anchor.lineNumber}`;
		default:
			return "Unknown anchor";
	}
}

export function AnnotationSidebar({
	artifactPath,
	onClose,
	className,
}: AnnotationSidebarProps) {
	const [showFilters, setShowFilters] = useState(false);
	const [expandedComments, setExpandedComments] = useState<Set<string>>(
		new Set(),
	);
	const [orphanedExpandedComments, setOrphanedExpandedComments] = useState<
		Set<string>
	>(new Set());
	const [openOrphanedThreads, setOpenOrphanedThreads] = useState<Set<string>>(
		new Set(),
	);

	const toggleExpanded = useCallback((annotationId: string) => {
		setExpandedComments((prev) => {
			const next = new Set(prev);
			if (next.has(annotationId)) {
				next.delete(annotationId);
			} else {
				next.add(annotationId);
			}
			return next;
		});
	}, []);

	const toggleOrphanedExpand = useCallback((annotationId: string) => {
		setOrphanedExpandedComments((prev) => {
			const next = new Set(prev);
			if (next.has(annotationId)) {
				next.delete(annotationId);
			} else {
				next.add(annotationId);
			}
			return next;
		});
	}, []);

	const toggleOrphanedThread = useCallback((annotationId: string) => {
		setOpenOrphanedThreads((prev) => {
			const next = new Set(prev);
			if (next.has(annotationId)) {
				next.delete(annotationId);
			} else {
				next.add(annotationId);
			}
			return next;
		});
	}, []);

	const {
		groupedAnnotations,
		count,
		countByStatus,
		isLoading,
		filter,
		setFilter,
	} = useAnnotations({ artifactPath });

	const { annotations: allAnnotations } = useAnnotationContext();

	// Clean up stale orphaned-section state when annotations flip back to non-orphaned
	const orphanedIds = useMemo(
		() => new Set(groupedAnnotations.orphaned.map((a) => a.id)),
		[groupedAnnotations.orphaned],
	);

	useEffect(() => {
		setOrphanedExpandedComments((prev) => {
			const next = new Set<string>();
			for (const id of prev) {
				if (orphanedIds.has(id)) {
					next.add(id);
				}
			}
			return next.size === prev.size ? prev : next;
		});
		setOpenOrphanedThreads((prev) => {
			const next = new Set<string>();
			for (const id of prev) {
				if (orphanedIds.has(id)) {
					next.add(id);
				}
			}
			return next.size === prev.size ? prev : next;
		});
	}, [orphanedIds]);

	const totalCount = useMemo(() => {
		const artifactAnnotations = artifactPath
			? allAnnotations.filter((a) => a.artifactPath === artifactPath)
			: allAnnotations;
		return artifactAnnotations.length;
	}, [allAnnotations, artifactPath]);

	const hasActiveFilter =
		filter.status !== "all" ||
		filter.author !== null ||
		filter.dateRange !== "all";

	const authorOptions = useMemo(() => {
		const artifactAnnotations = artifactPath
			? allAnnotations.filter((a) => a.artifactPath === artifactPath)
			: allAnnotations;

		const uniqueAuthors = [
			...new Set(artifactAnnotations.map((a) => a.author)),
		].sort();

		return [
			{ value: ALL_AUTHORS_VALUE, label: "All Authors" },
			...uniqueAuthors.map((author) => ({ value: author, label: author })),
		];
	}, [allAnnotations, artifactPath]);

	const handleStatusChange = useCallback(
		(status: StatusFilterValue) => {
			setFilter({ ...filter, status });
		},
		[filter, setFilter],
	);

	const handleDateRangeChange = useCallback(
		(dateRange: DateRangeValue) => {
			setFilter({ ...filter, dateRange });
		},
		[filter, setFilter],
	);

	const handleAuthorChange = useCallback(
		(value: string) => {
			const author: AuthorFilterValue =
				value === ALL_AUTHORS_VALUE ? null : value;
			setFilter({ ...filter, author });
		},
		[filter, setFilter],
	);

	const handleClearFilters = useCallback(() => {
		setFilter({
			status: "all",
			author: null,
			dateRange: "all",
		});
	}, [setFilter]);

	const handleAnnotationClick = useCallback((annotation: Annotation) => {
		const indicator = document.querySelector(
			`[data-annotation-id="${annotation.id}"]`,
		);
		if (indicator instanceof HTMLElement) {
			indicator.scrollIntoView({ behavior: "instant", block: "center" });
			requestAnimationFrame(() => {
				indicator.click();
			});
		}
	}, []);

	const hasActiveFilters =
		filter.status !== "all" ||
		filter.author !== null ||
		filter.dateRange !== "all";

	return (
		<aside
			className={cn("flex h-full flex-col", className)}
			aria-label="Annotations panel"
		>
			<PanelHeader
				icon={MessageSquare}
				title="Annotations"
				meta={
					<span className="type-secondary text-fg-ghost tabular-nums">
						{hasActiveFilter && count !== totalCount
							? `${count} of ${totalCount}`
							: totalCount}
					</span>
				}
				actions={
					<>
						<PanelHeaderIconButton
							icon={Filter}
							ariaLabel="Toggle filters"
							onClick={() => setShowFilters(!showFilters)}
							ariaPressed={showFilters}
							className={cn(showFilters && "text-fg")}
						/>
						<PanelHeaderIconButton
							icon={X}
							ariaLabel="Close annotations panel"
							onClick={onClose}
						/>
					</>
				}
			/>

			{showFilters && (
				<div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
					<Select
						size="sm"
						value={filter.status}
						options={STATUS_OPTIONS}
						onChange={handleStatusChange}
						label="Filter by status"
					/>
					<Select
						size="sm"
						value={filter.author ?? ALL_AUTHORS_VALUE}
						options={authorOptions}
						onChange={handleAuthorChange}
						label="Filter by author"
					/>
					<Select
						size="sm"
						value={filter.dateRange}
						options={DATE_OPTIONS}
						onChange={handleDateRangeChange}
						label="Filter by date"
					/>
					{hasActiveFilters && (
						<button
							type="button"
							onClick={handleClearFilters}
							className={cn(
								"inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors",
								"hover:bg-muted hover:text-foreground",
								"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							)}
						>
							<X className="h-3 w-3" aria-hidden="true" />
							Clear
						</button>
					)}
				</div>
			)}

			<div className="flex-1 overflow-y-auto">
				{isLoading ? (
					<div className="flex items-center justify-center py-8">
						<span className="text-sm text-muted-foreground">Loading...</span>
					</div>
				) : count === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<MessageSquare
							className="mb-2 h-8 w-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="text-sm text-muted-foreground">No annotations yet</p>
						<p className="mt-1 text-xs text-muted-foreground">
							Select text to add a comment
						</p>
					</div>
				) : (
					<ul className="space-y-1 p-2">
						{[...groupedAnnotations.open, ...groupedAnnotations.resolved].map(
							(annotation) => (
								<li key={annotation.id}>
									<AnnotationItem
										annotation={annotation}
										onClick={() => handleAnnotationClick(annotation)}
										isExpanded={expandedComments.has(annotation.id)}
										onToggleExpand={() => toggleExpanded(annotation.id)}
									/>
								</li>
							),
						)}

						{groupedAnnotations.orphaned.length > 0 && (
							<>
								<li className="pt-2 pb-1">
									<div className="flex items-center gap-1.5 text-xs text-status-warning">
										<AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
										<span className="font-medium">Orphaned</span>
									</div>
								</li>
								{groupedAnnotations.orphaned.map((annotation) => (
									<li key={annotation.id}>
										<OrphanedAnnotationItem
											annotation={annotation}
											isThreadOpen={openOrphanedThreads.has(annotation.id)}
											onToggleThread={() => toggleOrphanedThread(annotation.id)}
											expandedComments={orphanedExpandedComments}
											onToggleExpand={toggleOrphanedExpand}
										/>
									</li>
								))}
							</>
						)}
					</ul>
				)}
			</div>

			<footer className="shrink-0 border-t border-border px-3 py-2">
				<p className="text-xs text-muted-foreground">
					{count} annotation{count !== 1 ? "s" : ""}
					{countByStatus.orphaned > 0 && (
						<span className="text-status-warning">
							{" "}
							({countByStatus.orphaned} orphaned)
						</span>
					)}
				</p>
			</footer>
		</aside>
	);
}
