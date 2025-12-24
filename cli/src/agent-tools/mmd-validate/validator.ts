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

	return pipe(
		// Initialize browser once before parallel validation
		initBrowser(),
		TE.chain((page) =>
			pipe(
				// Create validation tasks for all blocks
				blocks.map((block) =>
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
		TE.map((results): MmdValidateData => {
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
