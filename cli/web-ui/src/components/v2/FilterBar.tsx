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
	{ value: "completed", label: getStatusLabel("completed") },
	{ value: "failed", label: getStatusLabel("failed") },
	{ value: "waiting", label: getStatusLabel("waiting") },
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
		<div className={cn("flex flex-wrap items-center gap-4", className)}>
			<div
				role="tablist"
				aria-label="Filter by status"
				className="flex rounded-md border border-border bg-muted/30 p-0.5"
			>
				{STATUS_TABS.map((tab) => (
					<button
						key={tab.value}
						type="button"
						role="tab"
						aria-selected={filters.status === tab.value}
						onClick={() => handleStatusChange(tab.value)}
						className={cn(
							"rounded px-3 py-1.5 text-sm font-medium transition-colors",
							"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
							filters.status === tab.value
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground",
						)}
					>
						{tab.label}
					</button>
				))}
			</div>

			<Select
				size="md"
				value={filters.projectId ?? ""}
				options={projectOptions}
				onChange={(val) => handleProjectChange(val === "" ? null : val)}
				placeholder="All Projects"
				label="Filter by project"
			/>

			<Select
				size="md"
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
					className={cn(
						"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors",
						"hover:bg-muted hover:text-foreground",
						"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
					)}
				>
					<X className="h-4 w-4" aria-hidden="true" />
					Clear filters
				</button>
			)}
		</div>
	);
}
