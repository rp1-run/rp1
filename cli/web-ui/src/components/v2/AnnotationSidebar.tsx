import {
	AlertTriangle,
	ChevronDown,
	ChevronRight,
	Filter,
	MessageSquare,
	Pencil,
	X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useAnnotations } from "@/hooks/useAnnotations";
import type { LineDiffEntry } from "@/lib/diff-engine";
import { formatRelativeTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type {
	AnchorTypeFilter,
	Annotation,
	AnnotationFilter,
} from "@/types/annotations";
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

const ANCHOR_TYPE_OPTIONS: { value: AnchorTypeFilter; label: string }[] = [
	{ value: "all", label: "All Types" },
	{ value: "edit", label: "Edits" },
	{ value: "manual", label: "Manual" },
];

const ALL_AUTHORS_VALUE = "__all__";

function isEditAnnotation(annotation: Annotation): boolean {
	return annotation.anchor.type === "edit-diff";
}

function scrollToEditorLine(lineNumber: number) {
	const editor = document.querySelector(".milkdown-editor-root .ProseMirror");
	if (!editor) return;
	const textblocks = editor.querySelectorAll(
		"p, h1, h2, h3, h4, h5, h6, li, pre, blockquote, hr",
	);
	const idx = lineNumber - 1;
	if (idx >= 0 && idx < textblocks.length) {
		textblocks[idx].scrollIntoView({ behavior: "instant", block: "center" });
		// Wait one frame for layout to settle after scroll, then trigger the popover
		requestAnimationFrame(() => {
			const marker = document.querySelector(`[data-diff-line="${lineNumber}"]`);
			if (marker instanceof HTMLElement) {
				marker.click();
			}
		});
	}
}

function DiffEntryItem({
	entry,
	onClick,
}: {
	entry: LineDiffEntry;
	onClick?: () => void;
}) {
	const typeLabel =
		entry.type === "added" ? "+" : entry.type === "deleted" ? "-" : "~";
	const typeColor =
		entry.type === "added"
			? "text-accent"
			: entry.type === "deleted"
				? "text-failure"
				: "text-fg-muted";

	return (
		<button
			type="button"
			onClick={(e) => {
				e.stopPropagation();
				onClick?.();
			}}
			className="flex gap-1.5 py-0.5 font-mono text-xs leading-relaxed w-full text-left rounded-sm hover:bg-muted/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
		>
			<span className={cn("shrink-0 w-3 text-center", typeColor)}>
				{typeLabel}
			</span>
			<span className="text-fg-ghost tabular-nums shrink-0 w-5 text-right">
				{entry.line}
			</span>
			<div className="min-w-0 flex-1">
				{entry.before !== null && (
					<p className="text-failure/70 line-through truncate">
						{entry.before || "\u00A0"}
					</p>
				)}
				{entry.after !== null && (
					<p className="text-fg-muted truncate">{entry.after || "\u00A0"}</p>
				)}
			</div>
		</button>
	);
}

function EditDiffDetail({ diffs }: { diffs: readonly LineDiffEntry[] }) {
	const [isDetailExpanded, setIsDetailExpanded] = useState(false);
	const nonUnchangedDiffs = diffs.filter((d) => d.type !== "unchanged");

	if (nonUnchangedDiffs.length === 0) return null;

	return (
		<div className="mt-1.5 ml-4">
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					setIsDetailExpanded(!isDetailExpanded);
				}}
				className="flex items-center gap-1 text-xs text-fg-ghost hover:text-fg-muted transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
			>
				{isDetailExpanded ? (
					<ChevronDown className="h-3 w-3" />
				) : (
					<ChevronRight className="h-3 w-3" />
				)}
				<span>
					{nonUnchangedDiffs.length}{" "}
					{nonUnchangedDiffs.length === 1 ? "change" : "changes"}
				</span>
			</button>
			{isDetailExpanded && (
				<div className="mt-1 rounded border border-border bg-surface-void/50 px-2 py-1.5 max-h-48 overflow-y-auto">
					{nonUnchangedDiffs.map((entry, i) => (
						<DiffEntryItem
							key={`${entry.line}-${entry.type}-${i}`}
							entry={entry}
							onClick={() => scrollToEditorLine(entry.line)}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function EditAnnotationGroup({ annotations }: { annotations: Annotation[] }) {
	const [isExpanded, setIsExpanded] = useState(false);

	const { allDiffs, summary } = useMemo(() => {
		const diffs: LineDiffEntry[] = [];
		for (const a of annotations) {
			if (a.anchor.type === "edit-diff") {
				for (const d of a.anchor.diffs) {
					if (d.type !== "unchanged") diffs.push(d);
				}
			}
		}
		diffs.sort((a, b) => a.line - b.line);

		const counts = { modified: 0, added: 0, deleted: 0 };
		for (const d of diffs) counts[d.type as keyof typeof counts]++;
		const parts: string[] = [];
		if (counts.modified > 0) parts.push(`${counts.modified} modified`);
		if (counts.added > 0) parts.push(`${counts.added} added`);
		if (counts.deleted > 0) parts.push(`${counts.deleted} deleted`);

		return {
			allDiffs: diffs,
			summary: parts.length > 0 ? parts.join(", ") : "No changes",
		};
	}, [annotations]);

	if (allDiffs.length === 0) return null;

	const mostRecent = annotations.reduce((latest, a) =>
		new Date(a.createdAt) > new Date(latest.createdAt) ? a : latest,
	);

	return (
		<li>
			<div
				className={cn(
					"w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
					"hover:border-border hover:bg-muted/50",
				)}
			>
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className="w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
				>
					<div className="flex items-start gap-2">
						<Pencil
							className="mt-1 h-3 w-3 shrink-0 text-fg-muted"
							strokeWidth={1.5}
						/>
						<div className="min-w-0 flex-1">
							<p className="truncate text-xs text-fg-ghost">{summary}</p>
							<p className="mt-0.5 text-sm text-fg-muted">
								{allDiffs.length}{" "}
								{allDiffs.length === 1 ? "line change" : "line changes"}
								{annotations.length > 1 &&
									` across ${annotations.length} sessions`}
							</p>
							<div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
								<span>{mostRecent.author}</span>
								<span>-</span>
								<span>{formatRelativeTime(mostRecent.createdAt)}</span>
							</div>
						</div>
					</div>
				</button>
				{isExpanded && <EditDiffDetail diffs={allDiffs} />}
			</div>
		</li>
	);
}

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
	const isEdit = isEditAnnotation(annotation);
	const replyCount = annotation.replies.length;
	const showTruncation = !isEdit && needsTruncation(annotation.content);
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
					{isEdit ? (
						<Pencil
							className={cn(
								"mt-1 h-3 w-3 shrink-0",
								isResolved ? "text-terminal-green" : "text-fg-muted",
							)}
							strokeWidth={1.5}
							role="img"
							aria-label={isResolved ? "Resolved edit" : "Edit"}
						/>
					) : (
						<div
							className={cn(
								"mt-1.5 h-2 w-2 shrink-0 rounded-full",
								isResolved ? "bg-terminal-green" : "bg-annotation-open",
							)}
							role="img"
							aria-label={isResolved ? "Resolved" : "Open"}
						/>
					)}
					<div className="min-w-0 flex-1">
						<p
							className={cn(
								"truncate text-xs",
								isEdit ? "text-fg-ghost" : "text-muted-foreground",
							)}
						>
							{anchorPreview}
						</p>
						<p
							className={cn(
								"mt-0.5 whitespace-pre-wrap text-sm",
								isEdit && "text-fg-muted",
							)}
						>
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
			{isEdit && annotation.anchor.type === "edit-diff" && (
				<EditDiffDetail diffs={annotation.anchor.diffs} />
			)}
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

function getAnchorPreview(annotation: Annotation): string {
	const anchor = annotation.anchor;
	switch (anchor.type) {
		case "text-selection":
			return `"${anchor.selectedText.slice(0, 50)}${anchor.selectedText.length > 50 ? "..." : ""}"`;
		case "hidden-anchor":
			return `#${anchor.anchorId}`;
		case "line":
			return `Line ${anchor.lineNumber}`;
		case "edit-diff": {
			const counts = { added: 0, modified: 0, deleted: 0 };
			for (const d of anchor.diffs) {
				if (d.type !== "unchanged") {
					counts[d.type]++;
				}
			}
			const parts: string[] = [];
			if (counts.modified > 0) parts.push(`${counts.modified} modified`);
			if (counts.added > 0) parts.push(`${counts.added} added`);
			if (counts.deleted > 0) parts.push(`${counts.deleted} deleted`);
			return parts.length > 0 ? parts.join(", ") : "No changes";
		}
		default:
			return "Unknown anchor";
	}
}

const TRUNCATION_LINES = 3;
const TRUNCATION_CHARS = 200;

function needsTruncation(content: string): boolean {
	const lineCount = content.split("\n").length;
	return lineCount > TRUNCATION_LINES || content.length > TRUNCATION_CHARS;
}

function truncateContent(content: string): string {
	const lines = content.split("\n");
	if (lines.length > TRUNCATION_LINES) {
		return `${lines.slice(0, TRUNCATION_LINES).join("\n")}...`;
	}
	if (content.length > TRUNCATION_CHARS) {
		return `${content.slice(0, TRUNCATION_CHARS)}...`;
	}
	return content;
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

	const {
		groupedAnnotations,
		count,
		countByStatus,
		isLoading,
		filter,
		setFilter,
	} = useAnnotations({ artifactPath });

	const { annotations: allAnnotations } = useAnnotationContext();

	const totalCount = useMemo(() => {
		const artifactAnnotations = artifactPath
			? allAnnotations.filter((a) => a.artifactPath === artifactPath)
			: allAnnotations;
		return artifactAnnotations.length;
	}, [allAnnotations, artifactPath]);

	const hasActiveFilter =
		filter.status !== "all" ||
		filter.author !== null ||
		filter.dateRange !== "all" ||
		filter.anchorType !== "all";

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

	const handleAnchorTypeChange = useCallback(
		(anchorType: AnchorTypeFilter) => {
			setFilter({ ...filter, anchorType });
		},
		[filter, setFilter],
	);

	const handleClearFilters = useCallback(() => {
		setFilter({
			status: "all",
			author: null,
			dateRange: "all",
			anchorType: "all",
		});
	}, [setFilter]);

	const handleAnnotationClick = useCallback((annotation: Annotation) => {
		// For edit-diff annotations, scroll to the first changed line
		if (annotation.anchor.type === "edit-diff") {
			const firstDiff = annotation.anchor.diffs.find(
				(d) => d.type !== "unchanged",
			);
			if (firstDiff) {
				scrollToEditorLine(firstDiff.line);
			}
			return;
		}

		// For all other annotations, find the gutter indicator by ID and click it
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
		filter.dateRange !== "all" ||
		filter.anchorType !== "all";

	return (
		<aside
			className={cn("flex h-full flex-col", className)}
			aria-label="Annotations panel"
		>
			<header className="shrink-0 flex items-center justify-between px-4 pt-3 pb-2">
				<div className="flex items-center gap-2">
					<MessageSquare
						className="h-3.5 w-3.5 text-fg-ghost"
						strokeWidth={1.5}
					/>
					<h2 className="type-secondary text-fg-muted tracking-wider uppercase">
						Annotations
					</h2>
					<span className="type-secondary text-fg-ghost tabular-nums">
						{hasActiveFilter && count !== totalCount
							? `${count} of ${totalCount}`
							: totalCount}
					</span>
				</div>
				<div className="flex items-center gap-2">
					<button
						type="button"
						onClick={() => setShowFilters(!showFilters)}
						className={cn(
							"text-fg-ghost transition-colors duration-150 hover:text-fg",
							showFilters && "text-fg",
						)}
						aria-label="Toggle filters"
						aria-pressed={showFilters}
					>
						<Filter className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
					<button
						type="button"
						onClick={onClose}
						className="text-fg-ghost transition-colors duration-150 hover:text-fg"
						aria-label="Close annotations panel"
					>
						<X className="h-3.5 w-3.5" strokeWidth={1.5} />
					</button>
				</div>
			</header>

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
						value={filter.anchorType}
						options={ANCHOR_TYPE_OPTIONS}
						onChange={handleAnchorTypeChange}
						label="Filter by type"
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
						{(() => {
							const all = [
								...groupedAnnotations.open,
								...groupedAnnotations.resolved,
							];
							const editAnnotations = all.filter(isEditAnnotation);
							const manualAnnotations = all.filter((a) => !isEditAnnotation(a));
							return (
								<>
									{editAnnotations.length > 0 && (
										<EditAnnotationGroup annotations={editAnnotations} />
									)}
									{manualAnnotations.map((annotation) => (
										<li key={annotation.id}>
											<AnnotationItem
												annotation={annotation}
												onClick={() => handleAnnotationClick(annotation)}
												isExpanded={expandedComments.has(annotation.id)}
												onToggleExpand={() => toggleExpanded(annotation.id)}
											/>
										</li>
									))}
								</>
							);
						})()}

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
										<AnnotationItem
											annotation={annotation}
											onClick={() => handleAnnotationClick(annotation)}
											isExpanded={expandedComments.has(annotation.id)}
											onToggleExpand={() => toggleExpanded(annotation.id)}
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
