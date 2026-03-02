import { useCallback, useEffect, useState } from "react";

interface WorkflowState {
	readonly id: string;
	readonly label: string | null;
	readonly isInitial: boolean;
	readonly isTerminal: boolean;
}

interface WorkflowTransition {
	readonly sourceId: string;
	readonly targetId: string;
	readonly label: string | null;
}

export interface WorkflowOrderedStep {
	readonly id: string;
	readonly label: string;
	readonly index: number;
}

export interface WorkflowDefinition {
	readonly name: string;
	readonly states: readonly WorkflowState[];
	readonly transitions: readonly WorkflowTransition[];
	readonly orderedSteps: readonly WorkflowOrderedStep[];
}

interface UseWorkflowStepsResult {
	workflow: WorkflowDefinition | null;
	isLoading: boolean;
	error: Error | null;
}

const workflowCache = new Map<string, WorkflowDefinition>();

/**
 * Map a command string (e.g., "/build") to a workflow name (e.g., "build").
 * Returns null for commands that cannot map to a workflow name.
 */
export function commandToWorkflowName(command: string): string | null {
	if (!command || !command.startsWith("/")) return null;
	const name = command.slice(1);
	return name.length > 0 ? name : null;
}

/**
 * Fetch and cache a state machine workflow definition from the workflows API.
 * Used by the run detail page to render step timelines from state machine data
 * instead of relying solely on server-derived steps.
 *
 * When workflowName is null/undefined, returns null workflow (no fetch).
 * When the workflow has no state.mmd (404), returns null workflow without error.
 * Results are cached in a module-level Map (workflow definitions are static per session).
 */
export function useWorkflowSteps(
	workflowName: string | null | undefined,
): UseWorkflowStepsResult {
	const [workflow, setWorkflow] = useState<WorkflowDefinition | null>(() =>
		workflowName ? (workflowCache.get(workflowName) ?? null) : null,
	);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const fetchWorkflow = useCallback(async (name: string) => {
		const cached = workflowCache.get(name);
		if (cached) {
			setWorkflow(cached);
			setIsLoading(false);
			return;
		}

		setIsLoading(true);
		try {
			const response = await fetch(
				`/api/v2/workflows/${encodeURIComponent(name)}`,
			);
			if (!response.ok) {
				if (response.status === 404) {
					setWorkflow(null);
					setError(null);
					return;
				}
				throw new Error(`Failed to fetch workflow: ${response.statusText}`);
			}
			const data = (await response.json()) as WorkflowDefinition;
			workflowCache.set(name, data);
			setWorkflow(data);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			setWorkflow(null);
		} finally {
			setIsLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!workflowName) {
			setWorkflow(null);
			setIsLoading(false);
			setError(null);
			return;
		}

		fetchWorkflow(workflowName);
	}, [workflowName, fetchWorkflow]);

	return { workflow, isLoading, error };
}
