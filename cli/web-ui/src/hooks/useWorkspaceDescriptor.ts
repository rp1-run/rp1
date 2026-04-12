import { useEffect, useMemo } from "react";
import { useLocation } from "react-router-dom";
import { normalizeWorkspaceRoute } from "@/lib/workspace-routes";
import type { CommandDefinition } from "./useContextualShortcuts";
import { useWorkspaceTabs } from "./useWorkspaceTabs";

export interface UseWorkspaceDescriptorOptions {
	readonly title?: string | null;
	readonly subtitle?: string | null;
	readonly projectId?: string | null;
	readonly unavailable?: boolean;
}

interface UseWorkspaceDescriptorResult {
	readonly workspaceCommands: readonly CommandDefinition[];
}

function createCurrentPath(
	pathname: string,
	search: string,
	hash: string,
): string {
	return `${pathname}${search}${hash}`;
}

export function useWorkspaceDescriptor({
	title,
	subtitle,
	projectId,
	unavailable = false,
}: UseWorkspaceDescriptorOptions): UseWorkspaceDescriptorResult {
	const location = useLocation();
	const {
		tabs,
		activeKey,
		activateWorkspace,
		closeWorkspace,
		updateWorkspaceMetadata,
	} = useWorkspaceTabs();

	const currentPath = createCurrentPath(
		location.pathname,
		location.search,
		location.hash,
	);
	const normalized = useMemo(
		() => normalizeWorkspaceRoute(currentPath),
		[currentPath],
	);
	const currentKey = normalized.type === "workspace" ? normalized.key : null;
	const currentIndex =
		currentKey === null ? -1 : tabs.findIndex((tab) => tab.key === currentKey);
	const previousTab =
		currentIndex > 0 ? (tabs[currentIndex - 1] ?? null) : null;
	const nextTab =
		currentIndex >= 0 && currentIndex < tabs.length - 1
			? (tabs[currentIndex + 1] ?? null)
			: null;

	useEffect(() => {
		if (normalized.type !== "workspace") {
			return;
		}

		const trimmedTitle = title?.trim();
		if (!trimmedTitle) {
			return;
		}

		updateWorkspaceMetadata(normalized.key, {
			title: trimmedTitle,
			subtitle: subtitle?.trim() ? subtitle.trim() : null,
			projectId: projectId ?? normalized.projectId,
		});
	}, [normalized, title, subtitle, projectId, updateWorkspaceMetadata]);

	useEffect(() => {
		if (normalized.type !== "workspace" || !unavailable) {
			return;
		}

		closeWorkspace(normalized.key);
	}, [normalized, unavailable, closeWorkspace]);

	const workspaceCommands = useMemo<readonly CommandDefinition[]>(() => {
		if (currentKey === null || activeKey !== currentKey) {
			return [];
		}

		const commands: CommandDefinition[] = [];

		if (previousTab) {
			commands.push({
				id: "previous-workspace",
				label: "Previous Workspace",
				description: `Open ${previousTab.title}`,
				keywords: ["workspace", "tab", "previous", "back"],
				action: () => activateWorkspace(previousTab.key),
			});
		}

		if (nextTab) {
			commands.push({
				id: "next-workspace",
				label: "Next Workspace",
				description: `Open ${nextTab.title}`,
				keywords: ["workspace", "tab", "next", "forward"],
				action: () => activateWorkspace(nextTab.key),
			});
		}

		commands.push({
			id: "close-workspace",
			label: "Close Workspace",
			description: "Close the current workspace tab",
			keywords: ["workspace", "tab", "close"],
			action: () => closeWorkspace(currentKey),
		});

		return commands;
	}, [
		activeKey,
		activateWorkspace,
		closeWorkspace,
		currentKey,
		nextTab,
		previousTab,
	]);

	return { workspaceCommands };
}
