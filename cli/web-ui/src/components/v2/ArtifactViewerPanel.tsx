import { FileText, List } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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

export interface ArtifactViewerPanelProps {
	readonly step: Step | null;
	readonly artifacts: readonly Artifact[];
	readonly selectedArtifact: Artifact | null;
	readonly onArtifactSelect?: (artifact: Artifact) => void;
	readonly runId?: string;
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
}: ArtifactViewerPanelProps) {
	const [content, setContentRaw] = useState<string | null>(null);
	const [contentRevision, setContentRevision] = useState(0);
	const setContent = useCallback((c: string | null) => {
		setContentRaw(c);
		setContentRevision((r) => r + 1);
	}, []);
	const [contentLoading, setContentLoading] = useState(false);
	const [contentError, setContentError] = useState<string | null>(null);
	const [headings, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const [annotationSidebarOpen, setAnnotationSidebarOpen] = useState(false);
	const [tocOpen, setTocOpen] = useState(false);
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const { onFileChange } = useWebSocket();

	const artifactPath = selectedArtifact?.path ?? null;

	const fetchContent = useCallback(
		async (preserveScroll: boolean) => {
			if (!artifactPath || !runId) {
				setContent(null);
				return;
			}

			if (!preserveScroll) {
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
				setContent(data.content);
			} catch (err) {
				setContentError(err instanceof Error ? err.message : String(err));
				setContent(null);
			} finally {
				if (!preserveScroll) {
					setContentLoading(false);
				}
			}
		},
		[artifactPath, runId, setContent],
	);

	useEffect(() => {
		fetchContent(false);
	}, [fetchContent]);

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
		<div className="flex h-full flex-col overflow-hidden">
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

				{stepArtifacts.length > 0 && (
					<nav className="mt-[8px] flex flex-wrap gap-x-[16px] gap-y-[4px]">
						{stepArtifacts.map((artifact) => {
							const isSelected = selectedArtifact?.path === artifact.path;
							return (
								<button
									key={artifact.path}
									type="button"
									onClick={() => onArtifactSelect?.(artifact)}
									className={cn(
										"type-secondary transition-colors duration-150 hover:opacity-80 inline-flex items-center gap-1",
										isSelected ? "text-fg font-medium" : "text-fg-ghost",
									)}
								>
									<FileText
										className="h-3 w-3 shrink-0"
										strokeWidth={1.5}
										aria-hidden="true"
									/>
									{getFileName(artifact.path)}
								</button>
							);
						})}
					</nav>
				)}
			</div>

			<div className="flex flex-1 min-h-0 overflow-hidden">
				<ScrollArea
					className="flex-1 min-h-0 max-w-full overflow-hidden"
					viewportRef={scrollViewportRef}
				>
					<ContentPanel
						key={contentRevision}
						content={content}
						path={selectedArtifact?.path ?? null}
						isLoading={contentLoading}
						error={contentError}
						emptyMessage={
							stepArtifacts.length > 0
								? "Select an artifact to view."
								: "No artifacts for this step."
						}
						onHeadingsExtracted={handleHeadingsExtracted}
						onSaveStatusChange={setSaveStatus}
						runId={runId}
						docId={selectedArtifact?.docId}
						scrollViewportRef={scrollViewportRef}
					/>
				</ScrollArea>

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
