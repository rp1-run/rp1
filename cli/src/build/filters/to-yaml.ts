/**
 * Liquid filter: to_yaml
 *
 * Serializes any value (object, array, primitive) to a YAML string
 * with configurable indentation. Used to emit structured data like
 * arguments and environment arrays into built skill frontmatter
 * without hand-coding each field in the Liquid template.
 *
 * @param value - Any JSON-serializable value
 * @param indent - Number of spaces to indent (default: 4)
 * @returns YAML string with the requested base indentation
 */

import { stringify } from "yaml";

export const toYaml = (value: unknown, indent = 4): string => {
	if (value == null) {
		return "";
	}

	const raw = stringify(value, { indent: 2 });
	if (!raw || raw.trim() === "") {
		return "";
	}

	// Indent every line by the requested amount
	const prefix = " ".repeat(indent);
	return raw
		.trimEnd()
		.split("\n")
		.map((line) => (line.trim() === "" ? "" : `${prefix}${line}`))
		.join("\n");
};
