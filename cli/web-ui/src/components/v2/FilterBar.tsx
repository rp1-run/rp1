import { X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { getStatusLabel } from "@/lib/status-labels";
import { cn } from "@/lib/utils";
import type { RunStatus, RunsFilter } from "@/types/runs";
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

type StatusTab = RunStatus | "all";

const STATUS_TABS: { value: StatusTab; label: string }[] = [
	{ value: "all", label: "All" },
	{ value: "running", label: getStatusLabel("running") },
	{ value: "waiting", label: getStatusLabel("waiting") },
	{ value: "inactive", label: getStatusLabel("inactive") },
	{ value: "completed", label: getStatusLabel("completed") },
	{ value: "failed", label: getStatusLabel("failed") },
	{ value: "cancelled", label: getStatusLabel("cancelled") },
	{ value: "abandoned", label: getStatusLabel("abandoned") },
];

const DATE_RANGES: { value: RunsFilter["dateRange"]; label: string }[] = [
	{ value: "all", label: "All Time" },
	{ value: "today", label: "Today" },
	{ value: "week", label: "This Week" },
	{ value: "month", label: "This Month" },
];

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

	const handleStatusChange = useCallback(
		(status: StatusTab) => {
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
			status: "all",
			projectId: null,
			dateRange: "all",
		});
	}, [onFiltersChange]);

	const hasActiveFilters =
		filters.status !== "all" ||
		filters.projectId !== null ||
		filters.dateRange !== "all";

	const projectOptions: { value: string; label: string }[] = [
		{ value: "", label: "All Projects" },
		...projects.map((p) => ({ value: p.id, label: p.name })),
	];

	return (
		<div className={cn("flex w-full flex-col gap-2", className)}>
			<div
				role="tablist"
				aria-label="Filter by status"
				className="-mx-0.5 flex max-w-full items-center gap-0.5 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
			>
				{STATUS_TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={filters.status === tab.value}
						onClick={() => handleStatusChange(tab.value)}
						className={cn(
							"shrink-0 rounded-md px-1.5 py-1 type-secondary font-medium transition-colors duration-150",
							filters.status === tab.value
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
					value={filters.projectId ?? ""}
					options={projectOptions}
					onChange={(val) => handleProjectChange(val === "" ? null : val)}
					placeholder="All Projects"
					label="Filter by project"
				/>

				<Select
					size="sm"
					value={filters.dateRange}
					options={DATE_RANGES}
					onChange={(val) => handleDateRangeChange(val)}
					placeholder="All Time"
					label="Filter by date range"
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
