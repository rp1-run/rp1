export interface LineCoverageSummary {
	readonly hit: number;
	readonly found: number;
	readonly ratio: number;
}

export function summarizeLcovLineCoverage(
	content: string,
): LineCoverageSummary {
	let hit = 0;
	let found = 0;

	for (const line of content.split(/\r?\n/)) {
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

function parseLcovCount(line: string, field: "LH" | "LF"): number {
	const rawValue = line.slice(field.length + 1).trim();
	const value = Number(rawValue);

	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`Invalid LCOV ${field} value: ${rawValue}`);
	}

	return value;
}
