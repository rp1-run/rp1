/**
 * Custom Liquid filter registration.
 *
 * Exports a registration function that binds all custom filters onto
 * a LiquidJS Liquid instance. Filters are pure functions that receive
 * their data through Liquid template arguments and the render context.
 *
 * Each filter module exports a standalone pure function for direct
 * use and unit testing. This module re-exports those functions and
 * provides registerFilters() for engine integration.
 */

import type { Liquid } from "liquidjs";
import type { PlatformRegistry } from "../models.js";
import type { BuildPlatform } from "../template-context.js";
import { allowedToolsFilter } from "./allowed-tools.js";
import { escapeToml } from "./escape-toml.js";
import { escapeYaml } from "./escape-yaml.js";
import { namespaceRef } from "./namespace-ref.js";
import { roleType } from "./role-type.js";
import { slashCommands } from "./slash-commands.js";
import { toolName } from "./tool-name.js";

export {
	allowedToolsFilter,
	escapeToml,
	escapeYaml,
	namespaceRef,
	roleType,
	slashCommands,
	toolName,
};

/**
 * Register all custom Liquid filters on the given engine instance.
 *
 * Filters access platform, registry, and skillMap from the template
 * render context (passed as Liquid variables). The registration wraps
 * each pure filter function to extract these values from the Liquid
 * scope via `this.context`.
 *
 * @param liquid - LiquidJS Liquid instance to register filters on
 */
export function registerFilters(liquid: Liquid): void {
	liquid.registerFilter(
		"namespace_ref",
		(content: string, platform: BuildPlatform) =>
			namespaceRef(content, platform),
	);

	liquid.registerFilter(
		"tool_name",
		function (name: string, _platform: BuildPlatform) {
			const registry = this.context.get(["registry"]) as PlatformRegistry;
			return toolName(name, registry);
		},
	);

	liquid.registerFilter(
		"allowed_tools",
		function (allowedTools: string, platform: BuildPlatform) {
			const registry = this.context.get(["registry"]) as PlatformRegistry;
			return allowedToolsFilter(allowedTools, platform, registry);
		},
	);

	liquid.registerFilter("escape_yaml", (value: string) => escapeYaml(value));

	liquid.registerFilter("escape_toml", (value: string) => escapeToml(value));

	liquid.registerFilter(
		"role_type",
		(agent: { name: string; description: string }) =>
			roleType(agent.name, agent.description),
	);

	liquid.registerFilter(
		"slash_commands",
		function (content: string, platform: BuildPlatform) {
			let skillMap: ReadonlyMap<string, string> | undefined;
			try {
				skillMap = this.context.get(["skillMap"]) as
					| ReadonlyMap<string, string>
					| undefined;
			} catch {
				skillMap = undefined;
			}
			return slashCommands(content, platform, skillMap);
		},
	);
}
