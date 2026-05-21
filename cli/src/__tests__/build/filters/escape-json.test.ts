/**
 * Unit tests for the escape_json Liquid filter.
 */

import { describe, expect, test } from "bun:test";
import { escapeJson } from "../../../build/filters/escape-json.js";

describe("escape_json filter", () => {
	test("escapes JSON string syntax without adding surrounding quotes", () => {
		const result = escapeJson('Path "C:\\Users\\rp1"\nnext\tline');

		expect(result).toBe('Path \\"C:\\\\Users\\\\rp1\\"\\nnext\\tline');
		expect(JSON.parse(`"${result}"`)).toBe('Path "C:\\Users\\rp1"\nnext\tline');
	});
});
