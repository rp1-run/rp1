/**
 * Validation orchestrator for Mermaid diagrams.
 * Validates multiple diagram blocks in parallel using shared browser instance.
 */

import * as A from "fp-ts/lib/Array.js";
import { pipe } from "fp-ts/lib/function.js";
import * as TE from "fp-ts/lib/TaskEither.js";
import type { CLIError } from "../../../shared/errors.js";
import type { BrowserValidationResult } from "./browser.js";
import { closeBrowser, initBrowser, validateInBrowser } from "./browser.js";
import type {
	DiagramBlock,
	DiagramError,
	DiagramValidationResult,
	MmdValidateData,
} from "./models.js";

const ESCAPED_NEWLINE_MESSAGE =
	'Escaped newline found in Mermaid source; use <br> or shorter labels instead of literal "\\n".';

/**
 * Parse mermaid error for line/column information.
 * Attempts to extract location details from error message and hash.
 */
export const parseErrorLocation = (
	error: NonNullable<BrowserValidationResult["error"]>,
	block: DiagramBlock,
): DiagramError => {
	const baseError: DiagramError = {
		diagramIndex: block.index,
		message: error.message,
		line: block.startLine,
	};

	// Try to extract line number from error message
	// Mermaid errors often include "Parse error on line X" or similar patterns
	const lineMatch = error.message.match(/line\s+(\d+)/i);
	if (lineMatch) {
		const relativeLine = parseInt(lineMatch[1], 10);
		return {
			...baseError,
			line: block.startLine + relativeLine - 1,
		};
	}

	// Try to extract from "at line X column Y" pattern
	const lineColMatch = error.message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
	if (lineColMatch) {
		const relativeLine = parseInt(lineColMatch[1], 10);
		const column = parseInt(lineColMatch[2], 10);
		return {
			...baseError,
			line: block.startLine + relativeLine - 1,
			column,
		};
	}

	// Extract context - first non-empty line that might be problematic
	const lines = block.content.split("\n");
	const contextLine = lines.find((l) => l.trim()) || lines[0];

	return {
		...baseError,
		context: contextLine?.slice(0, 80),
	};
};

/**
 * Mermaid accepts escaped newlines syntactically but renders them as visible
 * "\\n" text. Treat this as a validation error before browser parsing so
 * agents repair diagrams instead of shipping visually broken labels.
 */
export const findEscapedNewlineErrors = (
	block: DiagramBlock,
): readonly DiagramError[] =>
	block.content.split("\n").flatMap((line, offset): readonly DiagramError[] => {
		const errors: DiagramError[] = [];
		for (const m of line.matchAll(/\\n/g)) {
			errors.push({
				diagramIndex: block.index,
				message: ESCAPED_NEWLINE_MESSAGE,
				line: block.startLine + offset,
				column: m.index + 1,
				context: line.slice(0, 80),
			});
		}
		return errors;
	});

/**
 * Create validation result from browser result.
 * Maps browser validation result to DiagramValidationResult.
 */
const toValidationResult = (
	result: BrowserValidationResult,
	block: DiagramBlock,
): DiagramValidationResult => {
	if (result.valid) {
		return {
			index: block.index,
			valid: true,
			diagramType: result.diagramType,
			startLine: block.startLine,
		};
	}

	return {
		index: block.index,
		valid: false,
		startLine: block.startLine,
		errors: result.error ? [parseErrorLocation(result.error, block)] : [],
	};
};

const buildValidationData = (
	results: readonly DiagramValidationResult[],
): MmdValidateData => {
	const validCount = results.filter((r) => r.valid).length;
	const invalidCount = results.filter((r) => !r.valid).length;

	return {
		diagrams: results,
		summary: {
			total: results.length,
			valid: validCount,
			invalid: invalidCount,
		},
	};
};

/**
 * Validate all diagram blocks in parallel.
 * Uses shared browser instance and returns MmdValidateData with results and summary.
 */
export const validateDiagrams = (
	blocks: readonly DiagramBlock[],
	_timeout: number,
): TE.TaskEither<CLIError, MmdValidateData> => {
	// Handle empty blocks case
	if (blocks.length === 0) {
		return TE.right({
			diagrams: [],
			summary: { total: 0, valid: 0, invalid: 0 },
		});
	}

	const preValidationResults: Array<DiagramValidationResult | null> =
		blocks.map((block) => {
			const errors = findEscapedNewlineErrors(block);
			return errors.length > 0
				? ({
						index: block.index,
						valid: false,
						startLine: block.startLine,
						errors,
					} satisfies DiagramValidationResult)
				: null;
		});
	const browserBlocks = blocks.filter(
		(_, index) => preValidationResults[index] === null,
	);

	if (browserBlocks.length === 0) {
		return TE.right(
			buildValidationData(
				preValidationResults.filter(
					(result): result is DiagramValidationResult => result !== null,
				),
			),
		);
	}

	return pipe(
		// Initialize browser once before parallel validation
		initBrowser(),
		TE.chain((page) =>
			pipe(
				// Create validation tasks for all blocks
				browserBlocks.map((block) =>
					pipe(
						validateInBrowser(page, block.content),
						TE.map((result) => toValidationResult(result, block)),
					),
				),
				// Execute all validations in parallel
				A.sequence(TE.ApplicativePar),
			),
		),
		// Map results to MmdValidateData
		TE.map((browserResults): MmdValidateData => {
			let browserIndex = 0;
			const mergedResults = preValidationResults.map((result) => {
				if (result) return result;
				const browserResult = browserResults[browserIndex];
				browserIndex += 1;
				return browserResult;
			});

			return buildValidationData(mergedResults);
		}),
		// Clean up browser after validation
		TE.chainFirst(() => closeBrowser()),
		// Handle errors with cleanup
		TE.mapLeft((error) => {
			// Fire and forget cleanup on error
			closeBrowser()();
			return error;
		}),
	);
};
