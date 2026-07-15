#!/usr/bin/env bun

import { readFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { TEST_SANDBOX_ENV_KEYS } from "./test-with-isolated-home.js";

const PROTECTED_ENV_KEYS = new Set<string>(TEST_SANDBOX_ENV_KEYS);
const STANDARD_TEST_SCRIPTS = [
	"scripts/check-test-home-env.ts",
	"scripts/coverage-threshold.ts",
	"scripts/ensure-teach-me-widgets.ts",
	"scripts/test-coverage.ts",
	"scripts/test-with-isolated-home.ts",
] as const;
const NODE_CHILD_FUNCTIONS = new Set([
	"exec",
	"execFile",
	"execFileSync",
	"execSync",
	"fork",
	"spawn",
	"spawnSync",
]);
const ASSIGNMENT_OPERATORS = new Set<ts.SyntaxKind>([
	ts.SyntaxKind.EqualsToken,
	ts.SyntaxKind.PlusEqualsToken,
	ts.SyntaxKind.MinusEqualsToken,
	ts.SyntaxKind.AsteriskEqualsToken,
	ts.SyntaxKind.AsteriskAsteriskEqualsToken,
	ts.SyntaxKind.SlashEqualsToken,
	ts.SyntaxKind.PercentEqualsToken,
	ts.SyntaxKind.LessThanLessThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.GreaterThanGreaterThanGreaterThanEqualsToken,
	ts.SyntaxKind.AmpersandEqualsToken,
	ts.SyntaxKind.BarEqualsToken,
	ts.SyntaxKind.CaretEqualsToken,
	ts.SyntaxKind.BarBarEqualsToken,
	ts.SyntaxKind.AmpersandAmpersandEqualsToken,
	ts.SyntaxKind.QuestionQuestionEqualsToken,
]);

export type TestHomeEnvironmentRule =
	| "test-home-env-mutation"
	| "test-home-env-replacement";

export interface TestHomeEnvironmentViolation {
	readonly file: string;
	readonly line: number;
	readonly column: number;
	readonly rule: TestHomeEnvironmentRule;
	readonly message: string;
}

const scriptKindFor = (fileName: string): ts.ScriptKind => {
	if (fileName.endsWith(".tsx")) return ts.ScriptKind.TSX;
	if (fileName.endsWith(".jsx")) return ts.ScriptKind.JSX;
	if (/\.(?:c|m)?js$/.test(fileName)) return ts.ScriptKind.JS;
	return ts.ScriptKind.TS;
};

const unwrap = (expression: ts.Expression): ts.Expression => {
	let current = expression;
	while (
		ts.isParenthesizedExpression(current) ||
		ts.isAsExpression(current) ||
		ts.isTypeAssertionExpression(current) ||
		ts.isNonNullExpression(current) ||
		ts.isSatisfiesExpression(current)
	) {
		current = current.expression;
	}
	return current;
};

const literalMemberName = (
	access: ts.PropertyAccessExpression | ts.ElementAccessExpression,
): string | undefined => {
	if (ts.isPropertyAccessExpression(access)) return access.name.text;
	const argument = access.argumentExpression
		? unwrap(access.argumentExpression)
		: undefined;
	return argument &&
		(ts.isStringLiteralLike(argument) ||
			ts.isNoSubstitutionTemplateLiteral(argument))
		? argument.text
		: undefined;
};

const directProcessEnvironment = (expression: ts.Expression): boolean => {
	const current = unwrap(expression);
	if (
		!ts.isPropertyAccessExpression(current) &&
		!ts.isElementAccessExpression(current)
	) {
		return false;
	}
	const owner = unwrap(current.expression);
	return (
		ts.isIdentifier(owner) &&
		owner.text === "process" &&
		literalMemberName(current) === "env"
	);
};

const directProtectedEnvironmentKey = (
	expression: ts.Expression,
): string | undefined => {
	const current = unwrap(expression);
	if (
		!ts.isPropertyAccessExpression(current) &&
		!ts.isElementAccessExpression(current)
	) {
		return undefined;
	}
	const key = literalMemberName(current);
	return key &&
		PROTECTED_ENV_KEYS.has(key) &&
		directProcessEnvironment(current.expression)
		? key
		: undefined;
};

const propertyName = (name: ts.PropertyName): string | undefined => {
	if (ts.isIdentifier(name) || ts.isStringLiteralLike(name)) return name.text;
	if (
		ts.isComputedPropertyName(name) &&
		(ts.isStringLiteralLike(name.expression) ||
			ts.isNoSubstitutionTemplateLiteral(name.expression))
	) {
		return name.expression.text;
	}
	return undefined;
};

const boundaryName = (
	node: ts.CallExpression | ts.NewExpression,
): string | undefined => {
	const expression = unwrap(node.expression);
	if (ts.isNewExpression(node)) {
		if (ts.isIdentifier(expression) && expression.text === "Worker") {
			return "Worker";
		}
		if (
			ts.isPropertyAccessExpression(expression) &&
			expression.name.text === "Worker"
		) {
			return "Worker";
		}
		return undefined;
	}
	if (
		ts.isIdentifier(expression) &&
		NODE_CHILD_FUNCTIONS.has(expression.text)
	) {
		return `Node ${expression.text}`;
	}
	if (!ts.isPropertyAccessExpression(expression)) return undefined;
	const owner = unwrap(expression.expression);
	if (
		ts.isIdentifier(owner) &&
		owner.text === "Bun" &&
		(expression.name.text === "spawn" || expression.name.text === "spawnSync")
	) {
		return `Bun.${expression.name.text}`;
	}
	return NODE_CHILD_FUNCTIONS.has(expression.name.text)
		? `Node ${expression.name.text}`
		: undefined;
};

const explicitEnvironmentProperty = (
	argument: ts.Expression,
): ts.PropertyAssignment | undefined => {
	const current = unwrap(argument);
	if (!ts.isObjectLiteralExpression(current)) return undefined;
	return current.properties.find(
		(property): property is ts.PropertyAssignment =>
			ts.isPropertyAssignment(property) &&
			propertyName(property.name) === "env",
	);
};

const isExplicitUnsafeEnvironment = (expression: ts.Expression): boolean => {
	const current = unwrap(expression);
	if (directProcessEnvironment(current)) return false;
	if (!ts.isObjectLiteralExpression(current)) return false;

	let inheritsProcessEnvironment = false;
	let hasUnknownSpread = false;
	let overridesProtectedKey = false;
	for (const property of current.properties) {
		if (ts.isSpreadAssignment(property)) {
			if (directProcessEnvironment(property.expression)) {
				inheritsProcessEnvironment = true;
			} else {
				hasUnknownSpread = true;
			}
			continue;
		}
		if (
			"name" in property &&
			property.name &&
			PROTECTED_ENV_KEYS.has(propertyName(property.name) ?? "")
		) {
			overridesProtectedKey = true;
		}
	}

	if (overridesProtectedKey) return true;
	if (inheritsProcessEnvironment) return false;
	return !hasUnknownSpread;
};

export const analyzeTestHomeEnvironmentSource = (
	source: string,
	fileName: string,
): readonly TestHomeEnvironmentViolation[] => {
	const sourceFile = ts.createSourceFile(
		fileName,
		source,
		ts.ScriptTarget.Latest,
		true,
		scriptKindFor(fileName),
	);
	const violations: TestHomeEnvironmentViolation[] = [];
	const report = (
		node: ts.Node,
		rule: TestHomeEnvironmentRule,
		message: string,
	): void => {
		const position = sourceFile.getLineAndCharacterOfPosition(
			node.getStart(sourceFile),
		);
		violations.push({
			file: fileName,
			line: position.line + 1,
			column: position.character + 1,
			rule,
			message,
		});
	};

	const visit = (node: ts.Node): void => {
		if (
			ts.isBinaryExpression(node) &&
			ASSIGNMENT_OPERATORS.has(node.operatorToken.kind)
		) {
			const key = directProtectedEnvironmentKey(node.left);
			if (key) {
				report(
					node.left,
					"test-home-env-mutation",
					`Do not mutate process.env.${key} directly; use the admitted sandbox environment`,
				);
			}
		}
		if (ts.isDeleteExpression(node)) {
			const key = directProtectedEnvironmentKey(node.expression);
			if (key) {
				report(
					node.expression,
					"test-home-env-mutation",
					`Do not mutate process.env.${key} directly; use the admitted sandbox environment`,
				);
			}
		}
		if (
			(ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node)) &&
			(node.operator === ts.SyntaxKind.PlusPlusToken ||
				node.operator === ts.SyntaxKind.MinusMinusToken)
		) {
			const key = directProtectedEnvironmentKey(node.operand);
			if (key) {
				report(
					node.operand,
					"test-home-env-mutation",
					`Do not mutate process.env.${key} directly; use the admitted sandbox environment`,
				);
			}
		}
		if (ts.isCallExpression(node) || ts.isNewExpression(node)) {
			const boundary = boundaryName(node);
			if (boundary) {
				for (const argument of node.arguments ?? []) {
					const environment = explicitEnvironmentProperty(argument);
					if (
						environment &&
						isExplicitUnsafeEnvironment(environment.initializer)
					) {
						report(
							environment.name,
							"test-home-env-replacement",
							`${boundary} env must inherit process.env without overriding protected sandbox keys`,
						);
					}
				}
			}
		}
		ts.forEachChild(node, visit);
	};

	visit(sourceFile);
	return violations;
};

export const formatTestHomeEnvironmentViolation = (
	violation: TestHomeEnvironmentViolation,
): string =>
	`${violation.file}:${violation.line}:${violation.column} [${violation.rule}] ${violation.message}`;

export const discoverTestHomeEnvironmentSources = async (
	cliRoot = resolve(import.meta.dir, ".."),
): Promise<readonly string[]> => {
	const glob = new Bun.Glob("src/__tests__/**/*.{ts,tsx,js,jsx,mjs,cjs}");
	const testSources: string[] = [];
	for await (const path of glob.scan({ cwd: cliRoot, onlyFiles: true })) {
		testSources.push(path);
	}
	return [...new Set([...testSources, ...STANDARD_TEST_SCRIPTS])].sort();
};

export const checkTestHomeEnvironment = async (
	cliRoot = resolve(import.meta.dir, ".."),
): Promise<readonly TestHomeEnvironmentViolation[]> => {
	const violations: TestHomeEnvironmentViolation[] = [];
	for (const sourcePath of await discoverTestHomeEnvironmentSources(cliRoot)) {
		const absolutePath = join(cliRoot, sourcePath);
		violations.push(
			...analyzeTestHomeEnvironmentSource(
				await readFile(absolutePath, "utf-8"),
				relative(cliRoot, absolutePath),
			),
		);
	}
	return violations;
};

const main = async (): Promise<void> => {
	const cliRoot = resolve(import.meta.dir, "..");
	const violations = await checkTestHomeEnvironment(cliRoot);
	if (violations.length > 0) {
		console.error(
			`Test home environment check failed with ${violations.length} direct violation(s):`,
		);
		for (const violation of violations) {
			console.error(formatTestHomeEnvironmentViolation(violation));
		}
		process.exitCode = 1;
		return;
	}
	console.log("Test home environment check passed");
};

if (import.meta.main) {
	await main();
}
