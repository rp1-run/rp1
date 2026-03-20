export interface LineDiffEntry {
	type: "added" | "modified" | "deleted" | "unchanged";
	line: number;
	before: string | null;
	after: string | null;
}

function computeLcsTable(baseline: string[], current: string[]): number[][] {
	const m = baseline.length;
	const n = current.length;
	const dp: number[][] = Array.from({ length: m + 1 }, () =>
		new Array<number>(n + 1).fill(0),
	);

	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			if (baseline[i - 1] === current[j - 1]) {
				dp[i]![j] = dp[i - 1]![j - 1]! + 1;
			} else {
				dp[i]![j] = Math.max(dp[i - 1]![j]!, dp[i]![j - 1]!);
			}
		}
	}

	return dp;
}

interface EditOp {
	kind: "keep" | "delete" | "insert";
	baselineIndex?: number;
	currentIndex?: number;
}

function backtrackEditScript(
	dp: number[][],
	baseline: string[],
	current: string[],
): EditOp[] {
	const ops: EditOp[] = [];
	let i = baseline.length;
	let j = current.length;

	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && baseline[i - 1] === current[j - 1]) {
			ops.push({ kind: "keep", baselineIndex: i - 1, currentIndex: j - 1 });
			i--;
			j--;
		} else if (j > 0 && (i === 0 || dp[i]![j - 1]! >= dp[i - 1]![j]!)) {
			ops.push({ kind: "insert", currentIndex: j - 1 });
			j--;
		} else {
			ops.push({ kind: "delete", baselineIndex: i - 1 });
			i--;
		}
	}

	ops.reverse();
	return ops;
}

export function diffLines(
	baseline: string[],
	current: string[],
): LineDiffEntry[] {
	const dp = computeLcsTable(baseline, current);
	const ops = backtrackEditScript(dp, baseline, current);

	const result: LineDiffEntry[] = [];
	let currentLineNum = 0;

	let idx = 0;
	while (idx < ops.length) {
		const op = ops[idx]!;

		if (op.kind === "keep") {
			currentLineNum++;
			result.push({
				type: "unchanged",
				line: currentLineNum,
				before: baseline[op.baselineIndex!]!,
				after: current[op.currentIndex!]!,
			});
			idx++;
		} else if (
			op.kind === "delete" &&
			idx + 1 < ops.length &&
			ops[idx + 1]!.kind === "insert"
		) {
			currentLineNum++;
			const del = op;
			const ins = ops[idx + 1]!;
			result.push({
				type: "modified",
				line: currentLineNum,
				before: baseline[del.baselineIndex!]!,
				after: current[ins.currentIndex!]!,
			});
			idx += 2;
		} else if (op.kind === "delete") {
			result.push({
				type: "deleted",
				line: currentLineNum + 1,
				before: baseline[op.baselineIndex!]!,
				after: null,
			});
			idx++;
		} else {
			currentLineNum++;
			result.push({
				type: "added",
				line: currentLineNum,
				before: null,
				after: current[op.currentIndex!]!,
			});
			idx++;
		}
	}

	return result;
}
