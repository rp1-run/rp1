import { useCallback, useEffect, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import type { RunsFilter, RunStatus } from "@/types/runs";
import { cn } from "@/lib/utils";

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
  { value: "running", label: "Running" },
  { value: "completed", label: "Completed" },
  { value: "failed", label: "Failed" },
  { value: "waiting-input", label: "Waiting" },
];

const DATE_RANGES: { value: RunsFilter["dateRange"]; label: string }[] = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "week", label: "This Week" },
  { value: "month", label: "This Month" },
];

function Dropdown<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T | null) => void;
  placeholder: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selectedOption = options.find((o) => o.value === value);

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "inline-flex h-9 items-center justify-between gap-2 rounded-md border border-border bg-background px-3 text-sm transition-colors",
          "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "min-w-[140px]"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className={cn(!selectedOption && "text-muted-foreground")}>
          {selectedOption?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform",
            open && "rotate-180"
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
            role="presentation"
          />
          <ul
            role="listbox"
            className="absolute left-0 top-full z-50 mt-1 min-w-full overflow-hidden rounded-md border border-border bg-background shadow-lg"
          >
            {options.map((option) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm transition-colors",
                  "hover:bg-muted",
                  option.value === value && "bg-muted/50"
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
                  <Check className="h-4 w-4 text-foreground" aria-hidden="true" />
                )}
                <span className={option.value !== value ? "pl-6" : ""}>
                  {option.label}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

export function FilterBar({ filters, onFiltersChange, className }: FilterBarProps) {
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    async function fetchProjects() {
      try {
        const response = await fetch("/api/v2/projects");
        if (response.ok) {
          const data = (await response.json()) as { projects: Project[] };
          setProjects(data.projects);
        }
      } catch {
        // Silently fail, projects dropdown will be empty
      }
    }
    fetchProjects();
  }, []);

  const handleStatusChange = useCallback(
    (status: StatusTab) => {
      onFiltersChange({ ...filters, status });
    },
    [filters, onFiltersChange]
  );

  const handleProjectChange = useCallback(
    (projectId: string | null) => {
      onFiltersChange({ ...filters, projectId });
    },
    [filters, onFiltersChange]
  );

  const handleDateRangeChange = useCallback(
    (dateRange: RunsFilter["dateRange"] | null) => {
      onFiltersChange({ ...filters, dateRange: dateRange ?? "all" });
    },
    [filters, onFiltersChange]
  );

  const handleClearFilters = useCallback(() => {
    onFiltersChange({
      status: "all",
      projectId: null,
      dateRange: "all",
    });
  }, [onFiltersChange]);

  const hasActiveFilters =
    filters.status !== "all" || filters.projectId !== null || filters.dateRange !== "all";

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
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Dropdown
        value={filters.projectId ?? ""}
        options={projectOptions}
        onChange={(val) => handleProjectChange(val === "" ? null : val)}
        placeholder="All Projects"
      />

      <Dropdown
        value={filters.dateRange}
        options={DATE_RANGES}
        onChange={(val) => handleDateRangeChange(val)}
        placeholder="All Time"
      />

      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearFilters}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors",
            "hover:bg-muted hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          )}
        >
          <X className="h-4 w-4" aria-hidden="true" />
          Clear filters
        </button>
      )}
    </div>
  );
}
