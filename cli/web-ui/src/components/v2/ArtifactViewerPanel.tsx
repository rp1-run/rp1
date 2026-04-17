import { Check, FileText, GitBranch, List } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MermaidDiagram } from "@/components/MarkdownViewer/MermaidDiagram";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AnnotationSidebar } from "@/components/v2/AnnotationSidebar";
import { AnnotationToggleBtn } from "@/components/v2/AnnotationToggleBtn";
import { ContentPanel } from "@/components/v2/ContentPanel";
import { TableOfContents } from "@/components/v2/TableOfContents";
import {
	type SaveStatus,
	SaveStatusIndicator,
} from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { cn } from "@/lib/utils";
import { AnnotationProvider } from "@/providers/AnnotationProvider";
import { useWebSocket } from "@/providers/WebSocketProvider";

import type { Artifact, Step } from "@/types/runs";

const artifactContentCache = new Map<string, string>();

export interface ArtifactViewerPanelProps {
	readonly step: Step | null;
	readonly artifacts: readonly Artifact[];
	readonly selectedArtifact: Artifact | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly runId?: string;
	readonly subflowDiagram?: string | null;
	readonly showFrontmatter?: boolean;
}

function getFileName(path: string): string {
	return path.split("/").pop() || path;
}

function ArtifactViewerInner({
	step,
	artifacts,
	selectedArtifact,
	onArtifactSelect,
	runId,
	subflowDiagram,
	showFrontmatter = false,
}: ArtifactViewerPanelProps) {
	const artifactPath = selectedArtifact?.path ?? null;
	const artifactCacheKey =
		runId && artifactPath ? `${runId}:${artifactPath}` : null;
	const [content, setContent] = useState<string | null>(() =>
		artifactCacheKey
			? (artifactContentCache.get(artifactCacheKey) ?? null)
			: null,
	);
	const [contentLoading, setContentLoading] = useState(
		() =>
			artifactCacheKey !== null && !artifactContentCache.has(artifactCacheKey),
	);
	const [contentError, setContentError] = useState<string | null>(null);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const [copiedPath, setCopiedPath] = useState<string | null>(null);
	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const { onFileChange } = useWebSocket();

	const hasSubflow =
		typeof subflowDiagram === "string" && subflowDiagram.length > 0;
	const [showSubflow, setShowSubflow] = useState(false);

	const shouldShowSubflow = useMemo(
		() => hasSubflow && !selectedArtifact,
		[hasSubflow, selectedArtifact],
	);

	useEffect(() => {
		setShowSubflow(shouldShowSubflow);
	}, [shouldShowSubflow]);

	const fetchContent = useCallback(
		async (preserveScroll: boolean) => {
			if (!artifactPath || !runId) {
				setContent(null);
				return;
			}

			const cachedContent = artifactCacheKey
				? (artifactContentCache.get(artifactCacheKey) ?? null)
				: null;

			if (!preserveScroll && cachedContent === null) {
				setContentLoading(true);
				setHeadings([]);
			}
			setContentError(null);

			try {
				const response = await fetch(
					`/api/v2/runs/${runId}/artifacts/${encodeURIComponent(artifactPath)}`,
				);
				if (!response.ok) {
					let errorMessage = `Failed to fetch artifact: ${response.statusText}`;
					try {
						const errorData = (await response.json()) as {
							error?: string;
						};
						if (errorData.error) {
							errorMessage = errorData.error;
						}
					} catch {
						// fall through
					}
					throw new Error(errorMessage);
				}
				const data = (await response.json()) as { content: string };
				if (artifactCacheKey) {
					artifactContentCache.set(artifactCacheKey, data.content);
				}
				setContent((current) =>
					current === data.content ? current : data.content,
				);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				const isTerminalError =
					message.startsWith("Artifact not found:") ||
					message.startsWith("Run not found");
				if (isTerminalError || cachedContent === null) {
					if (isTerminalError && artifactCacheKey) {
						artifactContentCache.delete(artifactCacheKey);
					}
					setContentError(message);
					setContent(null);
				}
			} finally {
				if (!preserveScroll) {
					setContentLoading(false);
				}
			}
		},
		[artifactPath, artifactCacheKey, runId],
	);

	useEffect(() => {
		if (!artifactCacheKey) {
			setContent(null);
			setContentLoading(false);
			setContentError(null);
			return;
		}

		const cachedContent = artifactContentCache.get(artifactCacheKey) ?? null;
		setContent(cachedContent);
		setContentLoading(cachedContent === null);
		setContentError(null);
		void fetchContent(false);
	}, [artifactCacheKey, fetchContent]);

	useEffect(() => {
		if (!artifactPath || !runId) return;

		const normalizedArtifactPath = artifactPath.replace(/^\.rp1\//, "");

		const unsubscribe = onFileChange((msg) => {
			if (
				msg.changeType === "modify" &&
				(msg.path === artifactPath || msg.path === normalizedArtifactPath)
			) {
				fetchContent(true);
			}
		});

		return unsubscribe;
	}, [artifactPath, runId, onFileChange, fetchContent]);

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	const handleTocNavigate = useCallback((id: string) => {
		const element = document.getElementById(id);
		if (element) {
			element.scrollIntoView({ behavior: "smooth", block: "start" });
		}
	}, []);

	const handleToggleToc = useCallback(() => {
		setTocOpen((prev) => {
			const next = !prev;
			// Mutual exclusivity: close annotations when opening ToC
			if (next) setAnnotationSidebarOpen(false);
			return next;
		});
	}, []);

	const handleToggleAnnotations = useCallback(() => {
		setAnnotationSidebarOpen((prev) => {
			const next = !prev;
			// Mutual exclusivity: close ToC when opening annotations
			if (next) setTocOpen(false);
			return next;
		});
	}, []);

	if (!step) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="type-secondary text-fg-ghost">Select a step.</span>
			</div>
		);
	}

	const stepArtifacts = artifacts.filter((a) => a.step === step.id);
	const showTocToggle = headings.length > 0 && !tocOpen;

	return (
		<div className="flex h-full flex-col overflow-hidden min-w-0">
			<div className="shrink-0 px-4 md:px-[40px] pt-[24px] pb-[16px]">
				<div className="flex items-center justify-between">
					<h2 className="type-secondary text-fg-muted">{step.name}</h2>
					<div className="flex items-center gap-3">
						<SaveStatusIndicator status={saveStatus} />
						{showTocToggle && (
							<button
								type="button"
								onClick={handleToggleToc}
								className="text-fg-ghost transition-colors duration-150 hover:text-fg"
								aria-label="Open table of contents"
							>
								<List className="h-3.5 w-3.5" strokeWidth={1.5} />
							</button>
						)}
						{selectedArtifact && (
							<AnnotationToggleBtn
								artifactPath={selectedArtifact.path}
								onClick={handleToggleAnnotations}
								variant="inline"
							/>
						)}
					</div>
				</div>

				{(hasSubflow || stepArtifacts.length > 0) && (
					<nav className="mt-[8px] flex flex-wrap gap-x-[16px] gap-y-[4px]">
						{hasSubflow && (
							<span
								className={cn(
									"type-secondary inline-flex items-center gap-1",
									showSubflow ? "text-fg font-medium" : "text-fg-ghost",
								)}
							>
								<GitBranch className="h-3 w-3 shrink-0" strokeWidth={1.5} />
								<button
									type="button"
									onClick={() => setShowSubflow(true)}
									className="transition-colors duration-150 hover:opacity-80"
								>
									Execution Flow
								</button>
							</span>
						)}
						{stepArtifacts.map((artifact) => {
							const isSelected =
								!showSubflow && selectedArtifact?.path === artifact.path;
							const isCopied = copiedPath === artifact.path;
							const IconComponent = isCopied ? Check : FileText;
							return (
								<span
									key={artifact.path}
									className={cn(
										"type-secondary inline-flex items-center gap-1",
										isSelected ? "text-fg font-medium" : "text-fg-ghost",
									)}
								>
									<button
										type="button"
										title={artifact.absolutePath ?? artifact.path}
										onClick={(e) => {
											e.stopPropagation();
											const absPath = artifact.absolutePath ?? artifact.path;
											navigator.clipboard.writeText(absPath).then(() => {
												setCopiedPath(artifact.path);
												setTimeout(() => setCopiedPath(null), 2000);
											});
										}}
										className="shrink-0 transition-colors duration-150 hover:text-fg"
										aria-label={`Copy path for ${getFileName(artifact.path)}`}
									>
										<IconComponent className="h-3 w-3" strokeWidth={1.5} />
									</button>
									<button
										type="button"
										onClick={() => {
											setShowSubflow(false);
											onArtifactSelect?.(artifact);
										}}
										className="transition-colors duration-150 hover:opacity-80"
									>
										{getFileName(artifact.path)}
									</button>
								</span>
							);
						})}
					</nav>
				)}
			</div>

			<div className="flex flex-1 min-h-0 min-w-0 overflow-hidden">
				{showSubflow && hasSubflow ? (
					<ScrollArea
						className="flex-1 min-h-0 min-w-0"
						viewportRef={scrollViewportRef}
					>
						<div className="px-4 md:px-[40px] py-4">
							<MermaidDiagram
								code={subflowDiagram as string}
								title="Execution Flow"
							/>
						</div>
					</ScrollArea>
				) : (
					<ScrollArea
						className="flex-1 min-h-0 min-w-0"
						viewportRef={scrollViewportRef}
					>
						<ContentPanel
							content={content}
							path={selectedArtifact?.path ?? null}
							isLoading={contentLoading}
							error={contentError}
							emptyMessage={
								hasSubflow
									? "Select an artifact to view, or switch to Execution Flow."
									: stepArtifacts.length > 0
										? "Select an artifact to view."
										: "No artifacts for this step."
							}
							onHeadingsExtracted={handleHeadingsExtracted}
							onSaveStatusChange={setSaveStatus}
							runId={runId}
							docId={selectedArtifact?.docId}
							showFrontmatter={showFrontmatter}
							scrollViewportRef={scrollViewportRef}
						/>
					</ScrollArea>
				)}

				{tocOpen && headings.length > 0 && (
					<div className="w-[200px] shrink-0 border-l border-border overflow-y-auto">
						<TableOfContents
							headings={headings}
							activeId={null}
							onNavigate={handleTocNavigate}
							onClose={handleToggleToc}
						/>
					</div>
				)}

				{annotationSidebarOpen && selectedArtifact && (
					<div className="w-[280px] shrink-0 border-l border-border overflow-y-auto">
						<AnnotationSidebar
							artifactPath={selectedArtifact.path}
							onClose={() => setAnnotationSidebarOpen(false)}
							className="h-full"
						/>
					</div>
				)}
			</div>
		</div>
	);
}

export function ArtifactViewerPanel(props: ArtifactViewerPanelProps) {
	return (
		<AnnotationProvider
			artifactPath={props.selectedArtifact?.path ?? ""}
			docId={props.selectedArtifact?.docId}
		>
			<ArtifactViewerInner {...props} />
		</AnnotationProvider>
	);
}
