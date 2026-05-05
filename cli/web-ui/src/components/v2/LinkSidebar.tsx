import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useState } from "react";
import {
	getLinkArtifactContext,
	getLinkArtifactLabel,
	LINK_ARTIFACT_CONFIG,
	openLinkArtifact,
} from "@/lib/link-artifacts";
import { cn } from "@/lib/utils";
import type { Artifact } from "@/types/runs";
import { PanelHeader, PanelHeaderIconButton } from "./PanelHeader";

export interface LinkSidebarProps {
	readonly artifacts: readonly Artifact[];
	readonly onClose: () => void;
	readonly onOpenLink?: (artifact: Artifact) => void;
	readonly className?: string;
}

export function LinkSidebar({
	artifacts,
	onClose,
	onOpenLink = openLinkArtifact,
	className,
}: LinkSidebarProps) {
	const [copiedArtifactId, setCopiedArtifactId] = useState<string | null>(null);
	const LinkIcon = LINK_ARTIFACT_CONFIG.icon;

	const handleCopy = (artifact: Artifact) => {
		const target = getLinkArtifactContext(artifact);
		if (!navigator.clipboard?.writeText) return;

		void navigator.clipboard
			.writeText(target)
			.then(() => {
				setCopiedArtifactId(artifact.docId);
				setTimeout(() => setCopiedArtifactId(null), 2000);
			})
			.catch(() => {});
	};

	return (
		<aside
			className={cn("flex h-full flex-col", className)}
			aria-label="Links panel"
		>
			<PanelHeader
				icon={LinkIcon}
				title="Links"
				meta={
					<span className="type-secondary text-fg-ghost tabular-nums">
						{artifacts.length}
					</span>
				}
				actions={
					<PanelHeaderIconButton
						icon={X}
						ariaLabel="Close links panel"
						onClick={onClose}
					/>
				}
			/>

			<div className="min-h-0 flex-1 overflow-y-auto">
				{artifacts.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-8 text-center">
						<LinkIcon
							className="mb-2 h-8 w-8 text-muted-foreground/50"
							aria-hidden="true"
						/>
						<p className="text-sm text-muted-foreground">No links</p>
					</div>
				) : (
					<ul className="space-y-1 p-2">
						{artifacts.map((artifact) => {
							const label = getLinkArtifactLabel(artifact);
							const target = getLinkArtifactContext(artifact);
							const isCopied = copiedArtifactId === artifact.docId;
							const CopyIcon = isCopied ? Check : Copy;
							const sourceContext = artifact.sourceContext?.trim() ?? "";

							return (
								<li key={artifact.docId}>
									<div
										className={cn(
											"flex w-full items-start gap-2 rounded-md border border-transparent px-2 py-1.5 text-left transition-colors",
											"hover:border-border hover:bg-muted/50",
										)}
									>
										<button
											type="button"
											onClick={() => onOpenLink(artifact)}
											className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
											aria-label={`Open ${label}`}
											title={target}
										>
											<div className="flex items-start gap-2">
												<span className="min-w-0 flex-1">
													<span className="block whitespace-normal break-words text-sm leading-snug text-fg">
														{label}
													</span>
													<span className="mt-0.5 block whitespace-normal break-words text-xs leading-snug text-muted-foreground">
														{target}
													</span>
													{sourceContext && (
														<span className="mt-1 block whitespace-normal break-words text-xs leading-snug text-fg-muted">
															{sourceContext}
														</span>
													)}
												</span>
												<ExternalLink
													className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground"
													strokeWidth={1.5}
													aria-hidden="true"
												/>
											</div>
										</button>
										<button
											type="button"
											onClick={() => handleCopy(artifact)}
											className="mt-0.5 shrink-0 text-fg-ghost transition-colors duration-150 hover:text-fg focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-border"
											aria-label={`Copy URL for ${label}`}
											title={target}
										>
											<CopyIcon
												className="h-3.5 w-3.5"
												strokeWidth={1.5}
												aria-hidden="true"
											/>
										</button>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<footer className="shrink-0 border-t border-border px-3 py-2">
				<p className="text-xs text-muted-foreground">
					{artifacts.length} link{artifacts.length !== 1 ? "s" : ""}
				</p>
			</footer>
		</aside>
	);
}
