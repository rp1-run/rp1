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
