import {
	AlertTriangle,
	Check,
	ChevronDown,
	ChevronRight,
	Filter,
	MessageSquare,
	PanelRightClose,
	PanelRightOpen,
	X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAnnotations } from "@/hooks/useAnnotations";
import { cn } from "@/lib/utils";
import { useAnnotationContext } from "@/providers/AnnotationProvider";
import type { Annotation, AnnotationFilter } from "@/types/annotations";

export interface AnnotationSidebarProps {
	artifactPath: string;
	isOpen: boolean;
	onToggle: () => void;
	onNavigateToAnnotation?: (annotation: Annotation) => void;
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

interface FilterDropdownProps<T extends string> {
	value: T;
	options: { value: T; label: string }[];
	onChange: (value: T) => void;
	label: string;
}

function FilterDropdown<T extends string>({
	value,
	options,
	onChange,
	label,
}: FilterDropdownProps<T>) {
	const [open, setOpen] = useState(false);
	const selectedOption = options.find((o) => o.value === value);

	return (
		<div className="relative">
			<button
				type="button"
				onClick={() => setOpen(!open)}
				className={cn(
					"inline-flex h-8 items-center justify-between gap-1 rounded-md border border-border bg-background px-2 text-xs transition-colors",
					"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					"min-w-[80px]",
				)}
				aria-label={label}
				aria-expanded={open}
				aria-haspopup="listbox"
			>
				<span>{selectedOption?.label ?? value}</span>
				<ChevronDown
					className={cn(
						"h-3 w-3 text-muted-foreground transition-transform",
						open && "rotate-180",
					)}
					aria-hidden="true"
				/>
			</button>

			{open && (
				<>
					{/* biome-ignore lint/a11y/noStaticElementInteractions: backdrop click handler */}
					<div
						className="fixed inset-0 z-40"
						onClick={() => setOpen(false)}
						onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
						role="presentation"
					/>
					<div
						role="listbox"
						aria-label={label}
						className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-background shadow-lg"
					>
						{options.map((option) => (
							<div
								key={option.value}
								role="option"
								aria-selected={option.value === value}
								className={cn(
									"flex cursor-pointer items-center gap-1 px-2 py-1.5 text-xs transition-colors",
									"hover:bg-muted",
									option.value === value && "bg-muted/50",
								)}
								onClick={() => {
									onChange(option.value);
									setOpen(false);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										e.preventDefault();
										onChange(option.value);
										setOpen(false);
									}
								}}
								tabIndex={0}
							>
								{option.value === value && (
									<Check
										className="h-3 w-3 text-foreground"
										aria-hidden="true"
									/>
								)}
								<span className={option.value !== value ? "pl-4" : ""}>
									{option.label}
								</span>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

interface AnnotationGroupProps {
	title: string;
	annotations: readonly Annotation[];
	defaultExpanded: boolean;
	icon: React.ReactNode;
	badge?: React.ReactNode;
	onAnnotationClick: (annotation: Annotation) => void;
}

function AnnotationGroup({
	title,
	annotations,
	defaultExpanded,
	icon,
	badge,
	onAnnotationClick,
}: AnnotationGroupProps) {
	const [isExpanded, setIsExpanded] = useState(defaultExpanded);

	if (annotations.length === 0) return null;

	return (
		<div className="border-b border-border last:border-b-0">
			<button
				type="button"
				onClick={() => setIsExpanded(!isExpanded)}
				className={cn(
					"flex w-full items-center gap-2 px-3 py-2 text-left transition-colors",
					"hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
				)}
				aria-expanded={isExpanded}
			>
				<span className="text-muted-foreground">
					{isExpanded ? (
						<ChevronDown className="h-3 w-3" />
					) : (
						<ChevronRight className="h-3 w-3" />
					)}
				</span>
				{icon}
				<span className="flex-1 text-sm font-medium">{title}</span>
				{badge}
				<span className="text-xs text-muted-foreground">
					{annotations.length}
				</span>
			</button>

			{isExpanded && (
				<ul className="space-y-1 px-3 pb-2">
					{annotations.map((annotation) => (
						<li key={annotation.id}>
							<AnnotationItem
								annotation={annotation}
								onClick={() => onAnnotationClick(annotation)}
							/>
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

interface AnnotationItemProps {
	annotation: Annotation;
	onClick: () => void;
}

function AnnotationItem({ annotation, onClick }: AnnotationItemProps) {
	const anchorPreview = getAnchorPreview(annotation);
	const isResolved = annotation.status === "resolved";
	const replyCount = annotation.replies.length;

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"w-full rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
				"hover:border-border hover:bg-muted/50",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
				isResolved && "opacity-60",
			)}
		>
			<div className="flex items-start gap-2">
				<MessageSquare
					className={cn(
						"mt-0.5 h-3.5 w-3.5 shrink-0",
						annotation.annotationType === "suggestion"
							? "text-terminal-green"
							: "text-muted-foreground",
					)}
					aria-hidden="true"
				/>
				<div className="min-w-0 flex-1">
					<p className="truncate text-xs text-muted-foreground">
						{anchorPreview}
					</p>
					<p className="mt-0.5 line-clamp-2 text-sm">{annotation.content}</p>
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

function formatRelativeTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	const diffMins = Math.floor(diffMs / (1000 * 60));
	const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
	const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

	if (diffMins < 1) return "just now";
	if (diffMins < 60) return `${diffMins}m ago`;
	if (diffHours < 24) return `${diffHours}h ago`;
	if (diffDays < 7) return `${diffDays}d ago`;

	return date.toLocaleDateString();
}

export function AnnotationSidebar({
	artifactPath,
	isOpen,
	onToggle,
	onNavigateToAnnotation,
	className,
}: AnnotationSidebarProps) {
	const [showFilters, setShowFilters] = useState(false);

	const {
		groupedAnnotations,
		count,
		countByStatus,
		isLoading,
		filter,
		setFilter,
	} = useAnnotations({ artifactPath });

	const { annotations: allAnnotations } = useAnnotationContext();

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
		setFilter({ status: "all", author: null, dateRange: "all" });
	}, [setFilter]);

	const handleAnnotationClick = useCallback(
		(annotation: Annotation) => {
			onNavigateToAnnotation?.(annotation);
		},
		[onNavigateToAnnotation],
	);

	const hasActiveFilters =
		filter.status !== "all" ||
		filter.author !== null ||
		filter.dateRange !== "all";

	if (!isOpen) {
		return (
			<button
				type="button"
				onClick={onToggle}
				className={cn(
					"flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background transition-colors",
					"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					className,
				)}
				aria-label="Open annotations panel"
			>
				<PanelRightOpen className="h-4 w-4" aria-hidden="true" />
				{count > 0 && (
					<span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">
						{count > 99 ? "99+" : count}
					</span>
				)}
			</button>
		);
	}

	return (
		<aside
			className={cn(
				"flex w-80 flex-col border-l border-border bg-background",
				className,
			)}
			aria-label="Annotations panel"
		>
			<header className="flex items-center justify-between border-b border-border px-3 py-2">
				<div className="flex items-center gap-2">
					<h2 className="text-sm font-semibold">Annotations</h2>
					<span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
						{count}
					</span>
				</div>
				<div className="flex items-center gap-1">
					<button
						type="button"
						onClick={() => setShowFilters(!showFilters)}
						className={cn(
							"rounded-md p-1.5 transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							showFilters && "bg-muted",
						)}
						aria-label="Toggle filters"
						aria-pressed={showFilters}
					>
						<Filter className="h-4 w-4" aria-hidden="true" />
					</button>
					<button
						type="button"
						onClick={onToggle}
						className={cn(
							"rounded-md p-1.5 transition-colors",
							"hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						)}
						aria-label="Close annotations panel"
					>
						<PanelRightClose className="h-4 w-4" aria-hidden="true" />
					</button>
				</div>
			</header>

			{showFilters && (
				<div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
					<FilterDropdown
						value={filter.status}
						options={STATUS_OPTIONS}
						onChange={handleStatusChange}
						label="Filter by status"
					/>
					<FilterDropdown
						value={filter.author ?? ALL_AUTHORS_VALUE}
						options={authorOptions}
						onChange={handleAuthorChange}
						label="Filter by author"
					/>
					<FilterDropdown
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

			<ScrollArea className="flex-1">
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
					<div>
						<AnnotationGroup
							title="Open"
							annotations={groupedAnnotations.open}
							defaultExpanded={true}
							icon={
								<MessageSquare
									className="h-4 w-4 text-status-running"
									aria-hidden="true"
								/>
							}
							onAnnotationClick={handleAnnotationClick}
						/>

						<AnnotationGroup
							title="Resolved"
							annotations={groupedAnnotations.resolved}
							defaultExpanded={false}
							icon={
								<Check
									className="h-4 w-4 text-terminal-green"
									aria-hidden="true"
								/>
							}
							onAnnotationClick={handleAnnotationClick}
						/>

						{groupedAnnotations.orphaned.length > 0 && (
							<AnnotationGroup
								title="Orphaned"
								annotations={groupedAnnotations.orphaned}
								defaultExpanded={true}
								icon={
									<AlertTriangle
										className="h-4 w-4 text-status-warning"
										aria-hidden="true"
									/>
								}
								badge={
									<span
										className="rounded bg-status-warning/10 px-1.5 py-0.5 text-[10px] font-medium text-status-warning"
										title="Anchor text no longer found in document"
									>
										anchor not found
									</span>
								}
								onAnnotationClick={handleAnnotationClick}
							/>
						)}
					</div>
				)}
			</ScrollArea>

			<footer className="border-t border-border px-3 py-2">
				<div className="flex items-center justify-between text-xs text-muted-foreground">
					<span>
						{countByStatus.open} open, {countByStatus.resolved} resolved
					</span>
					{countByStatus.orphaned > 0 && (
						<span className="text-status-warning">
							{countByStatus.orphaned} orphaned
						</span>
					)}
				</div>
			</footer>
		</aside>
	);
}
