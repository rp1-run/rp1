/**
 * Canonical effective-status rule for sub-agent lifecycle events.
 * Non-namespaced steps keep their identity. Namespaced lifecycle steps collapse
 * to the namespace prefix, with `unit` appended only for namespaced steps so
 * reducers and Arcade both let the latest logical work-item state supersede
 * earlier lifecycle labels for the same work item.
 */
export const isNamespacedLifecycleStep = (step: string): boolean => {
	const separatorIndex = step.indexOf(":");
	return separatorIndex > 0 && separatorIndex < step.length - 1;
};

export const getLogicalStepKey = (
	step: string,
	unit?: string | null,
): string => {
	if (!isNamespacedLifecycleStep(step)) {
		return step;
	}

	const separatorIndex = step.indexOf(":");
	const logicalStep = step.slice(0, separatorIndex);
	return unit ? `${logicalStep}::${unit}` : logicalStep;
};

export const getLogicalStepDisplayId = (step: string): string => {
	if (!isNamespacedLifecycleStep(step)) {
		return step;
	}

	return step.slice(0, step.indexOf(":"));
};
