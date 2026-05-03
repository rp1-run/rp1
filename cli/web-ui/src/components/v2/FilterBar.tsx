import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import {
	DEFAULT_RUN_VIEW_FILTER,
	RELEVANT_HIDDEN_RUN_STATUSES,
	type RunStatus,
	type RunStatusFilter,
	type RunsFilter,
	type RunViewFilter,
} from "@/types/runs";
import { Select } from "./Select";

interface Project {
	id: string;
	name: string;
	path: string;
	available: boolean;
}

export interface FilterBarProps {
	filters: RunsFilter;
	onFiltersChange: (filters: RunsFilter) => void;
	className?: string;
}

const VIEW_TABS: { value: RunViewFilter; label: string }[] = [
	{ value: DEFAULT_RUN_VIEW_FILTER, label: "Relevant" },
	{ value: "all", label: "All" },
];

const STATUS_OPTIONS: { value: RunStatus; label: string }[] = [
	{ value: "running", label: getStatusLabel("running") },
	{ value: "waiting", label: getStatusLabel("waiting") },
	{ value: "inactive", label: getStatusLabel("inactive") },
	{ value: "completed", label: getStatusLabel("completed") },
	{ value: "failed", label: getStatusLabel("failed") },
	{ value: "cancelled", label: getStatusLabel("cancelled") },
	{ value: "abandoned", label: getStatusLabel("abandoned") },
];

const DATE_RANGES: { value: RunsFilter["dateRange"]; label: string }[] = [
	{ value: "all", label: "Time" },
	{ value: "today", label: "Today" },
	{ value: "week", label: "This Week" },
	{ value: "month", label: "This Month" },
];

const relevantHiddenRunStatusSet = new Set<RunStatus>(
	RELEVANT_HIDDEN_RUN_STATUSES,
);

function isHiddenInRelevantView(status: RunStatusFilter): boolean {
	return status !== "all" && relevantHiddenRunStatusSet.has(status);
}

export function FilterBar({
	filters,
	onFiltersChange,
	className,
}: FilterBarProps) {
	const [projects, setProjects] = useState<Project[]>([]);

	useEffect(() => {
		async function fetchProjects() {
			try {
				const response = await fetch("/api/v2/projects");
				if (response.ok) {
					const data = (await response.json()) as { projects: Project[] };
					setProjects(data.projects);
				}
			} catch {}
		}
		fetchProjects();
	}, []);

	const handleViewChange = useCallback(
		(view: RunViewFilter) => {
			onFiltersChange({
				...filters,
				view,
				status:
					view === DEFAULT_RUN_VIEW_FILTER &&
					isHiddenInRelevantView(filters.status)
						? "all"
						: filters.status,
			});
		},
		[filters, onFiltersChange],
	);

	const handleStatusChange = useCallback(
		(status: RunStatusFilter) => {
			onFiltersChange({ ...filters, status });
		},
		[filters, onFiltersChange],
	);

	const handleProjectChange = useCallback(
		(projectId: string | null) => {
			onFiltersChange({ ...filters, projectId });
		},
		[filters, onFiltersChange],
	);

	const handleDateRangeChange = useCallback(
		(dateRange: RunsFilter["dateRange"] | null) => {
			onFiltersChange({ ...filters, dateRange: dateRange ?? "all" });
		},
		[filters, onFiltersChange],
	);

	const handleClearFilters = useCallback(() => {
		onFiltersChange({
			view: DEFAULT_RUN_VIEW_FILTER,
			status: "all",
			projectId: null,
			dateRange: "all",
		});
	}, [onFiltersChange]);

	const hasActiveFilters =
		filters.view !== DEFAULT_RUN_VIEW_FILTER ||
		filters.status !== "all" ||
		filters.projectId !== null ||
		filters.dateRange !== "all";

	const projectOptions: { value: string; label: string }[] = [
		{ value: "", label: "Project" },
		...projects.map((p) => ({ value: p.id, label: p.name })),
	];
	const statusOptions: { value: RunStatusFilter; label: string }[] = [
		{ value: "all", label: "Status" },
		...STATUS_OPTIONS.filter(
			(option) =>
				filters.view === "all" || !relevantHiddenRunStatusSet.has(option.value),
		),
	];

	return (
		<div
			className={cn("flex w-full flex-wrap items-center gap-1.5", className)}
		>
			<div
				role="tablist"
				aria-label="Activity view"
				className="-mx-0.5 flex max-w-full items-center gap-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{VIEW_TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={filters.view === tab.value}
						onClick={() => handleViewChange(tab.value)}
						className={cn(
							"shrink-0 rounded-md px-1.5 py-1 type-secondary font-medium transition-colors duration-150",
							filters.view === tab.value
								? "bg-surface text-fg"
								: "text-fg-ghost hover:text-fg-muted hover:bg-surface/50",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<div className="flex min-w-0 flex-wrap items-center gap-1.5">
				<Select
					size="sm"
					value={filters.status}
					options={statusOptions}
					onChange={(val) => handleStatusChange(val)}
					placeholder="Status"
					label="Filter by status"
				/>

				<Select
					size="sm"
					value={filters.projectId ?? ""}
					options={projectOptions}
					onChange={(val) => handleProjectChange(val === "" ? null : val)}
					placeholder="Project"
					label="Filter by project"
				/>

				<Select
					size="sm"
					value={filters.dateRange}
					options={DATE_RANGES}
					onChange={(val) => handleDateRangeChange(val)}
					placeholder="Time"
					label="Filter by time"
				/>

				{hasActiveFilters && (
					<button
						type="button"
						onClick={handleClearFilters}
						className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-fg-ghost transition-colors duration-150 hover:bg-surface/50 hover:text-fg"
						aria-label="Clear filters"
					>
						<X className="h-3.5 w-3.5" />
					</button>
				)}
			</div>
		</div>
	);
}
