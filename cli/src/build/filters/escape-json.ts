/**
 * Liquid filter: escape_json
 *
 * Escapes a string for safe embedding inside a JSON string literal.
 */
export const escapeJson = (value: string): string =>
	JSON.stringify(value).slice(1, -1);
