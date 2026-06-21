/**
 * Unit tests for PR/issue target parsing.
 *
 * Covers the URL and bare-number forms. In particular, a URL's trailing number
 * must end at a delimiter (`/`, `?`, `#`) or string end, so a malformed URL like
 * `/pull/123abc` is rejected rather than silently parsed as PR 123 — otherwise a
 * write path could hit the wrong PR.
 */

import { describe, expect, test } from "bun:test";
import { parse } from "../../../agent-tools/github-pr/parse-target.js";

const REPO = "owner/repo";

describe("parse target URLs", () => {
	test("parses a PR URL", () => {
		expect(parse("https://github.com/o/r/pull/123", REPO)).toEqual({
			owner: "o",
			repo: "r",
			number: 123,
			kind: "pr",
		});
	});

	test("parses an issue URL", () => {
		expect(parse("https://github.com/o/r/issues/42", REPO)).toEqual({
			owner: "o",
			repo: "r",
			number: 42,
			kind: "issue",
		});
	});

	test("tolerates a trailing path, query, or fragment after the number", () => {
		for (const url of [
			"https://github.com/o/r/pull/123/files",
			"https://github.com/o/r/pull/123?diff=split",
			"https://github.com/o/r/pull/123#issuecomment-1",
		]) {
			expect(parse(url, REPO).number).toBe(123);
		}
	});

	test("rejects a URL whose number is followed by junk (no off-target write)", () => {
		expect(() => parse("https://github.com/o/r/pull/123abc", REPO)).toThrow();
	});

	test("rejects a non-github host", () => {
		expect(() => parse("https://gitlab.com/o/r/pull/1", REPO)).toThrow();
	});
});

describe("parse bare numbers", () => {
	test("uses currentRepo for a bare number", () => {
		expect(parse("7", REPO)).toEqual({
			owner: "owner",
			repo: "repo",
			number: 7,
			kind: "unknown",
		});
	});

	test("throws on a bare number without a valid currentRepo", () => {
		expect(() => parse("7", "norepo")).toThrow();
	});

	test("throws on unrecognizable input", () => {
		expect(() => parse("not-a-target", REPO)).toThrow();
	});
});
