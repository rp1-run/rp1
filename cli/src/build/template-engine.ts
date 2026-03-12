/**
 * LiquidJS template engine wrapper for the build pipeline.
 *
 * Creates a configured Liquid instance with strict mode settings and
 * wraps rendering errors into CLIError (GenerationError variant).
 *
 * This module is imported ONLY by build scripts (not by cli/src/main.ts),
 * ensuring LiquidJS is excluded from the compiled binary.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as E from "fp-ts/lib/Either.js";
import { Liquid } from "liquidjs";
import type { CLIError } from "../../shared/errors.js";
import { generationError } from "../../shared/errors.js";
import { registerFilters } from "./filters/index.js";

/**
 * Configuration for creating a template engine instance.
 */
export interface TemplateEngineConfig {
	readonly templateRoot?: string;
}

/**
 * Template engine interface for rendering Liquid templates.
 */
export interface TemplateEngine {
	render(
		templatePath: string,
		context: Record<string, unknown>,
	): Promise<E.Either<CLIError, string>>;
}

/**
 * Resolves the default template root directory relative to this module.
 */
const defaultTemplateRoot = (): string => {
	const currentDir = dirname(fileURLToPath(import.meta.url));
	return join(currentDir, "templates");
};

/**
 * Creates a configured LiquidJS template engine instance.
 *
 * Configuration:
 * - strictVariables: true (fail on undefined variables)
 * - strictFilters: true (fail on undefined filters)
 * - greedy: true (whitespace control — required for {%- %} to trim properly)
 * - extname: .liquid
 * - root: cli/src/build/templates/ (or custom templateRoot)
 */
export function createTemplateEngine(
	config?: TemplateEngineConfig,
): TemplateEngine {
	const root = config?.templateRoot ?? defaultTemplateRoot();

	const liquid = new Liquid({
		root,
		extname: ".liquid",
		strictVariables: true,
		strictFilters: true,
		greedy: true,
		lenientIf: true,
	});

	registerFilters(liquid);

	return {
		async render(
			templatePath: string,
			context: Record<string, unknown>,
		): Promise<E.Either<CLIError, string>> {
			try {
				const result = await liquid.renderFile(templatePath, context);
				return E.right(result);
			} catch (e) {
				const message = e instanceof Error ? e.message : String(e);
				return E.left(
					generationError(
						templatePath,
						`Template rendering failed: ${message}`,
					),
				);
			}
		},
	};
}
