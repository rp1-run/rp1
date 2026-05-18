export interface LineCoverageSummary {
	readonly hit: number;
	readonly found: number;
	readonly ratio: number;
}

export interface LcovLineCoverageOptions {
	readonly excludeSource?: (sourceFile: string) => boolean;
}

export function summarizeCliLcovLineCoverage(
	content: string,
): LineCoverageSummary {
	return summarizeLcovLineCoverage(content, {
		excludeSource: isCliCoverageExcludedSource,
	});
}

export function summarizeLcovLineCoverage(
	content: string,
	options: LcovLineCoverageOptions = {},
): LineCoverageSummary {
	let hit = 0;
	let found = 0;
	let includeRecord = true;

	for (const line of content.split(/\r?\n/)) {
		if (line.startsWith("SF:")) {
			const sourceFile = line.slice(3).trim();
			includeRecord = !options.excludeSource?.(sourceFile);
			continue;
		}

		if (line === "end_of_record") {
			includeRecord = true;
			continue;
		}

		if (!includeRecord) {
			continue;
		}

		if (line.startsWith("LH:")) {
			hit += parseLcovCount(line, "LH");
			continue;
		}

		if (line.startsWith("LF:")) {
			found += parseLcovCount(line, "LF");
		}
	}

	return {
		hit,
		found,
		ratio: found === 0 ? 1 : hit / found,
	};
}

export function meetsLineThreshold(
	summary: LineCoverageSummary,
	threshold: number,
): boolean {
	return summary.ratio >= threshold;
}

export function formatCoveragePercent(ratio: number): string {
	return `${(ratio * 100).toFixed(2)}%`;
}

export function isCliCoverageExcludedSource(sourceFile: string): boolean {
	const normalized = sourceFile.replaceAll("\\", "/");

	return (
		normalized.startsWith("web-ui/src/") || normalized.includes("/web-ui/src/")
	);
}

function parseLcovCount(line: string, field: "LH" | "LF"): number {
	const rawValue = line.slice(field.length + 1).trim();
	const value = Number(rawValue);

	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Invalid LCOV ${field} value: ${rawValue}`);
	}

	return value;
}
