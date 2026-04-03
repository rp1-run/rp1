/**
 * Canonical artifact name representation.
 *
 * The canonical form is "{plugin}:{artifact}" (e.g., "dev:build").
 * All other representations are derivations:
 *   - User-facing:    "rp1-dev:build"     (toUserFacing)
 *   - Plugin name:    "rp1-dev"           (toPluginName)
 *   - Canonical str:  "dev:build"         (toCanonicalString)
 */

import * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "./errors.js";
import { usageError } from "./errors.js";

/** Known plugin short names. */
export const PLUGIN_NAMES = ["base", "dev", "utils"] as const;
export type PluginName = (typeof PLUGIN_NAMES)[number];

/** A parsed, platform-independent artifact identity. */
export interface CanonicalName {
	readonly plugin: string;
	readonly artifact: string;
}

/**
 * Parse a canonical string "plugin:artifact" (e.g., "dev:build").
 * Does NOT accept the "rp1-" prefix — use parseUserFacing for that.
 */
export const parseCanonical = (
	input: string,
): E.Either<CLIError, CanonicalName> => {
	const colonIndex = input.indexOf(":");
	if (colonIndex < 0) {
		return E.left(
			usageError(
				`Invalid canonical name: "${input}"`,
				'Expected "plugin:artifact" format (e.g., "dev:build").',
			),
		);
	}

	const plugin = input.slice(0, colonIndex);
	const artifact = input.slice(colonIndex + 1);

	if (!plugin || !artifact) {
		return E.left(
			usageError(
				`Invalid canonical name: "${input}"`,
				"Both plugin and artifact parts are required.",
			),
		);
	}

	return E.right({ plugin, artifact });
};

/**
 * Parse a user-facing string "rp1-plugin:artifact" (e.g., "rp1-dev:build").
 * Strips the "rp1-" prefix from the plugin portion.
 * Also accepts unprefixed "plugin:artifact" for convenience.
 */
export const parseUserFacing = (
	input: string,
): E.Either<CLIError, CanonicalName> => {
	const colonIndex = input.indexOf(":");
	if (colonIndex < 0) {
		return E.left(
			usageError(
				`Invalid name format: "${input}"`,
				'Use "rp1-plugin:artifact" format (e.g., "rp1-dev:build").',
			),
		);
	}

	const pluginPart = input.slice(0, colonIndex);
	const artifact = input.slice(colonIndex + 1);

	if (!pluginPart || !artifact) {
		return E.left(
			usageError(
				`Invalid name format: "${input}"`,
				"Both plugin and artifact parts are required.",
			),
		);
	}

	const plugin = pluginPart.replace(/^rp1-/, "");

	return E.right({ plugin, artifact });
};

/** "dev:build" */
export const toCanonicalString = (name: CanonicalName): string =>
	`${name.plugin}:${name.artifact}`;

/** "rp1-dev:build" */
export const toUserFacing = (name: CanonicalName): string =>
	`rp1-${name.plugin}:${name.artifact}`;

/** "rp1-dev" */
export const toPluginName = (name: CanonicalName): string =>
	`rp1-${name.plugin}`;
