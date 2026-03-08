import { Bot, ChevronDown, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { AgentSubState, Step } from "@/types/runs";
import { StatusBadge } from "./StatusBadge";

function humanizeLabel(id: string): string {
	return id
		.split("-")
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(" ");
}

function AgentSubStateRow({ subState }: { subState: AgentSubState }) {
	return (
		<div className="flex items-center gap-3 py-1.5 px-3 text-sm">
			<Bot
				className="h-3.5 w-3.5 text-muted-foreground shrink-0"
				aria-hidden="true"
			/>
			<span className="font-medium text-foreground">
				{humanizeLabel(subState.agentName)}
			</span>
			{subState.task && (
				<code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
					{subState.task}
				</code>
			)}
			<span className="text-xs text-muted-foreground">
				{humanizeLabel(subState.step)}
			</span>
			<div className="ml-auto">
				<StatusBadge status={subState.status} size="sm" />
			</div>
		</div>
	);
}

export function AgentActivityPanel({ steps }: { steps: readonly Step[] }) {
	const stepsWithAgents = useMemo(
		() => steps.filter((s) => s.agentSubStates && s.agentSubStates.length > 0),
		[steps],
	);

	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		for (const step of stepsWithAgents) {
			if (step.status === "running") {
				initial.add(step.id);
			}
		}
		return initial;
	});

	if (stepsWithAgents.length === 0) return null;

	const toggleStep = (stepId: string) => {
		setExpandedSteps((prev) => {
			const next = new Set(prev);
			if (next.has(stepId)) {
				next.delete(stepId);
			} else {
				next.add(stepId);
			}
			return next;
		});
	};

	return (
		<section
			className="rounded-lg border border-border bg-card overflow-hidden"
			aria-label="Agent Activity"
		>
			<div className="px-4 py-2">
				<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
					Agent Activity
				</h3>
			</div>
			<div className="divide-y divide-border/50">
				{stepsWithAgents.map((step) => {
					const isExpanded = expandedSteps.has(step.id);
					const subStates = step.agentSubStates ?? [];

					return (
						<div key={step.id}>
							<button
								type="button"
								onClick={() => toggleStep(step.id)}
								className={cn(
									"flex w-full items-center gap-2 px-4 py-2 text-left text-sm transition-colors",
									"hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
								)}
								aria-expanded={isExpanded}
							>
								{isExpanded ? (
									<ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								) : (
									<ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
								)}
								<span className="font-medium text-foreground">
									{humanizeLabel(step.id)}
								</span>
								<StatusBadge status={step.status} size="sm" showLabel={false} />
								<span className="ml-auto text-xs text-muted-foreground">
									{subStates.length} agent{subStates.length !== 1 ? "s" : ""}
								</span>
							</button>
							{isExpanded && (
								<div className="bg-muted/10 border-t border-border/30 py-1">
									{subStates.map((subState, idx) => (
										<AgentSubStateRow
											key={`${subState.agentName}-${subState.task ?? idx}`}
											subState={subState}
										/>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</section>
	);
}
