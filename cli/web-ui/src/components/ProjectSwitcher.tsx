/**
 * Project switcher dropdown component.
 * Allows switching between registered rp1 projects.
 */

import { Check, ChevronDown, FolderOpen, Loader2 } from "lucide-react";
import {
	type KeyboardEvent,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useNavigate, useParams } from "react-router-dom";
import { cn } from "@/lib/utils";
import type { ProjectEntry } from "../server/registry";

interface ProjectsResponse {
	projects: ProjectEntry[];
	lastInvoked: string | null;
}

export function ProjectSwitcher() {
	const [isOpen, setIsOpen] = useState(false);
	const [projects, setProjects] = useState<ProjectEntry[]>([]);
	const [loading, setLoading] = useState(true);
	const [focusedIndex, setFocusedIndex] = useState(-1);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const buttonRef = useRef<HTMLButtonElement>(null);
	const navigate = useNavigate();
	const params = useParams();
	const currentProjectId = params.projectId;

	const fetchProjects = useCallback(async () => {
		try {
			const response = await fetch("/api/projects");
			if (!response.ok) return;
			const data = (await response.json()) as ProjectsResponse;
			setProjects(data.projects);
		} catch {
			// Ignore errors
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchProjects();
	}, [fetchProjects]);

	useEffect(() => {
		const handleGlobalKeyDown = (e: globalThis.KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				setIsOpen((prev) => !prev);
				if (!isOpen) {
					setFocusedIndex(projects.findIndex((p) => p.id === currentProjectId));
				}
			}
		};

		window.addEventListener("keydown", handleGlobalKeyDown);
		return () => window.removeEventListener("keydown", handleGlobalKeyDown);
	}, [isOpen, projects, currentProjectId]);

	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		};

		if (isOpen) {
			document.addEventListener("mousedown", handleClickOutside);
		}
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	useEffect(() => {
		if (isOpen && focusedIndex === -1) {
			const currentIndex = projects.findIndex((p) => p.id === currentProjectId);
			setFocusedIndex(currentIndex >= 0 ? currentIndex : 0);
		}
	}, [isOpen, focusedIndex, projects, currentProjectId]);

	const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
		if (!isOpen) {
			if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
				e.preventDefault();
				setIsOpen(true);
				setFocusedIndex(projects.findIndex((p) => p.id === currentProjectId));
			}
			return;
		}

		switch (e.key) {
			case "Escape":
				e.preventDefault();
				setIsOpen(false);
				buttonRef.current?.focus();
				break;
			case "ArrowDown":
				e.preventDefault();
				setFocusedIndex((prev) => (prev < projects.length - 1 ? prev + 1 : 0));
				break;
			case "ArrowUp":
				e.preventDefault();
				setFocusedIndex((prev) => (prev > 0 ? prev - 1 : projects.length - 1));
				break;
			case "Enter":
			case " ":
				e.preventDefault();
				if (focusedIndex >= 0 && focusedIndex < projects.length) {
					handleProjectSelect(projects[focusedIndex]);
				}
				break;
			case "Home":
				e.preventDefault();
				setFocusedIndex(0);
				break;
			case "End":
				e.preventDefault();
				setFocusedIndex(projects.length - 1);
				break;
		}
	};

	const handleProjectSelect = (project: ProjectEntry) => {
		if (!project.available) return;
		setIsOpen(false);
		navigate(`/project/${project.id}/view/context/index.md`);
	};

	const currentProject = projects.find((p) => p.id === currentProjectId);

	if (loading) {
		return (
			<div className="flex items-center gap-1.5 px-2 py-1 text-sm text-muted-foreground">
				<Loader2 className="h-3 w-3 animate-spin" />
			</div>
		);
	}

	if (projects.length === 0) {
		return null;
	}

	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: keydown handled by button inside
		<div ref={dropdownRef} className="relative" onKeyDown={handleKeyDown}>
			<button
				ref={buttonRef}
				type="button"
				onClick={() => setIsOpen(!isOpen)}
				className={cn(
					"flex items-center gap-1.5 px-2 py-1 rounded text-sm font-mono",
					"hover:bg-accent hover:text-accent-foreground",
					"focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-1",
					"transition-colors",
					isOpen && "bg-accent",
				)}
				aria-haspopup="listbox"
				aria-expanded={isOpen}
				aria-label="Switch project"
			>
				<FolderOpen className="h-3.5 w-3.5 text-terminal-mauve" />
				<span className="max-w-[150px] truncate">
					{currentProject?.name ?? currentProjectId ?? "Select project"}
				</span>
				<ChevronDown
					className={cn(
						"h-3.5 w-3.5 text-muted-foreground transition-transform",
						isOpen && "rotate-180",
					)}
				/>
			</button>

			{isOpen && (
				<div
					className={cn(
						"absolute top-full left-0 mt-1 z-50",
						"min-w-[200px] max-w-[300px] max-h-[300px] overflow-y-auto",
						"rounded-md border bg-popover shadow-md",
						"font-mono text-sm",
					)}
					role="listbox"
					tabIndex={0}
					aria-activedescendant={
						focusedIndex >= 0
							? `project-${projects[focusedIndex]?.id}`
							: undefined
					}
				>
					{projects.map((project, index) => (
						<button
							key={project.id}
							id={`project-${project.id}`}
							type="button"
							role="option"
							aria-selected={project.id === currentProjectId}
							disabled={!project.available}
							onClick={() => handleProjectSelect(project)}
							onMouseEnter={() => setFocusedIndex(index)}
							className={cn(
								"w-full flex items-center gap-2 px-3 py-2 text-left",
								"transition-colors",
								focusedIndex === index && "bg-accent",
								project.id === currentProjectId && "text-foreground",
								!project.available &&
									"text-muted-foreground italic opacity-60 cursor-not-allowed",
								project.available && "hover:bg-accent cursor-pointer",
							)}
						>
							{project.id === currentProjectId ? (
								<Check className="h-3.5 w-3.5 text-terminal-green flex-shrink-0" />
							) : (
								<span className="w-3.5" />
							)}
							<span className="truncate flex-1">{project.name}</span>
							{!project.available && (
								<span className="text-xs">(unavailable)</span>
							)}
						</button>
					))}
					<div className="border-t px-3 py-1.5 text-xs text-muted-foreground">
						<kbd className="px-1 py-0.5 rounded bg-muted font-mono">
							Cmd/Ctrl+K
						</kbd>{" "}
						to toggle
					</div>
				</div>
			)}
		</div>
	);
}
