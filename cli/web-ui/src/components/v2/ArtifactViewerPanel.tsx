import { FileText, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { UnifiedContentRenderer } from "@/components/v2/UnifiedContentRenderer";
import type { HeadingEntry } from "@/hooks/useHeadingExtraction";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/providers/WebSocketProvider";
import type { Artifact, Step } from "@/types/runs";

const ANNOTATIONS_ENABLED =
	typeof import.meta !== "undefined" &&
	import.meta.env?.RP1_ANNOTATIONS_ENABLED !== "false";

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

export function ArtifactViewerPanel({
	step,
	artifacts,
	selectedArtifact,
	onArtifactSelect,
	runId,
}: ArtifactViewerPanelProps) {
	const [content, setContent] = useState<string | null>(null);
	const [contentLoading, setContentLoading] = useState(false);
	const [contentError, setContentError] = useState<string | null>(null);
	const [, setHeadings] = useState<readonly HeadingEntry[]>([]);
	const scrollViewportRef = useRef<HTMLDivElement>(null);
	const { onFileChange } = useWebSocket();

	const fetchContent = useCallback(
		async (preserveScroll: boolean) => {
			if (!selectedArtifact || !runId) {
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
					`/api/v2/runs/${runId}/artifacts/${encodeURIComponent(selectedArtifact.path)}`,
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
		[selectedArtifact, runId],
	);

	useEffect(() => {
		fetchContent(false);
	}, [fetchContent]);

	useEffect(() => {
		if (!selectedArtifact || !runId) return;

		const unsubscribe = onFileChange((msg) => {
			if (msg.path === selectedArtifact.path && msg.changeType === "modify") {
				fetchContent(true);
			}
		});

		return unsubscribe;
	}, [selectedArtifact, runId, onFileChange, fetchContent]);

	const handleHeadingsExtracted = useCallback((newHeadings: HeadingEntry[]) => {
		setHeadings(newHeadings);
	}, []);

	if (!step) {
		return (
			<div className="flex h-full items-center justify-center">
				<span className="type-secondary text-fg-ghost">Select a step.</span>
			</div>
		);
	}

	const stepArtifacts = artifacts.filter((a) => a.step === step.id);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<div className="shrink-0 px-4 md:px-[40px] pt-[24px] pb-[16px]">
				<h2 className="type-secondary text-fg-muted">{step.name}</h2>

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

			<ScrollArea
				className="flex-1 min-h-0 max-w-full overflow-hidden"
				viewportRef={scrollViewportRef}
			>
				<div
					className="artifact-viewer-content max-w-full overflow-hidden break-words px-4 md:px-[40px]"
					style={{
						paddingTop: "40px",
						paddingBottom: "40px",
						fontSize: "14px",
						lineHeight: "1.7",
						fontFamily: "var(--font-mono, 'Commit Mono', monospace)",
						overflowWrap: "break-word",
						wordBreak: "break-word",
					}}
				>
					{contentLoading ? (
						<div className="flex items-center justify-center py-16">
							<Loader2 className="h-4 w-4 animate-spin text-fg-ghost" />
						</div>
					) : contentError ? (
						<div className="flex flex-col items-center justify-center py-16">
							<p className="type-secondary text-failure">
								Failed to load artifact
							</p>
							<p className="mt-2 type-secondary text-fg-ghost">
								{contentError}
							</p>
						</div>
					) : content !== null && selectedArtifact ? (
						<UnifiedContentRenderer
							content={content}
							path={selectedArtifact.path}
							onHeadingsExtracted={handleHeadingsExtracted}
							enableAnnotations={ANNOTATIONS_ENABLED}
						/>
					) : (
						<div className="flex items-center justify-center py-16">
							<span className="text-fg-ghost">
								{stepArtifacts.length > 0
									? "Select an artifact to view."
									: "No artifacts for this step."}
							</span>
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
}
