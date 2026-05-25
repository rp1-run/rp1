import { describe, expect, test } from "bun:test";
import {
	type CodeTourDocument,
	formatCodeTourValidationIssues,
	parseCodeTourDocument,
	validateCodeTourDocument,
} from "../../../shared/code-tour.js";

const validTour = (): CodeTourDocument => ({
	version: "1.0",
	kind: "pull-request",
	title: "Add subscription tier",
	source: {
		kind: "github-pr",
		repo: "acme/billing",
		id: "482",
		url: "https://github.com/acme/billing/pull/482",
		ref: "feat/tier",
	},
	domains: {
		infra: {
			label: "Infra",
			color: "#ff8bd4",
		},
		api: {
			label: "API",
			color: "#7ad0ff",
		},
	},
	concepts: [
		{
			id: "schema-change",
			label: "Tier schema",
			domain: "infra",
			epicenter: true,
			summary: "Adds tier columns and a safe backfill.",
			fragments: ["f-users-sql"],
		},
		{
			id: "users-api",
			label: "Users API",
			domain: "api",
			summary: "Serializes the new tier fields.",
			fragments: ["f-users-route"],
		},
	],
	fragments: [
		{
			id: "f-users-sql",
			label: "users.sql",
			path: "db/schema/users.sql",
			line: 24,
			language: "sql",
			code: [
				{
					tokens: [["kw", "ALTER TABLE users"]],
				},
			],
		},
		{
			id: "f-users-route",
			label: "route.ts",
			path: "apps/api/users/route.ts",
			line: 12,
			language: "typescript",
			code: [
				{
					type: "add",
					tokens: [
						["", "tier: "],
						["str", "user.tier"],
					],
				},
			],
			highlight: {
				lines: [0],
			},
		},
	],
	edges: {
		concept: [
			{
				from: "schema-change",
				to: "users-api",
				label: "feeds",
				kind: "data-flow",
			},
		],
		fragment: [
			{
				from: "f-users-sql",
				to: "f-users-route",
				label: "surfaces",
			},
		],
	},
	tour: [
		{
			conceptId: "schema-change",
			title: "Start with schema",
			sub: "Storage contract",
			reason: "The schema change establishes the new field.",
		},
	],
});

describe("validateCodeTourDocument", () => {
	test("accepts a valid Code Tour document", () => {
		const result = validateCodeTourDocument(validTour());

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.document.title).toBe("Add subscription tier");
		}
	});

	test("reports missing required document fields", () => {
		const document = validTour() as unknown as Record<string, unknown>;
		delete document.title;
		delete document.source;

		const result = validateCodeTourDocument(document);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues).toContainEqual({
				path: "$.title",
				message: "Required string is missing",
			});
			expect(result.issues).toContainEqual({
				path: "$.source",
				message: "Required source context is missing",
			});
		}
	});

	test("rejects duplicate concept and fragment ids", () => {
		const document = validTour();
		const result = validateCodeTourDocument({
			...document,
			concepts: [
				...document.concepts,
				{
					id: "users-api",
					label: "Duplicate",
					domain: "api",
					fragments: ["f-users-route"],
				},
			],
			fragments: [
				...document.fragments,
				{
					id: "f-users-route",
					label: "Duplicate",
					path: "apps/api/users/duplicate.ts",
					code: [],
				},
			],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(formatCodeTourValidationIssues(result.issues)).toContain(
				'$.concepts[2].id: Duplicate concept id "users-api"',
			);
			expect(formatCodeTourValidationIssues(result.issues)).toContain(
				'$.fragments[2].id: Duplicate fragment id "f-users-route"',
			);
		}
	});

	test("rejects broken domain and fragment references", () => {
		const document = validTour();
		const result = validateCodeTourDocument({
			...document,
			concepts: [
				{
					...document.concepts[0],
					domain: "missing-domain",
					fragments: ["missing-fragment"],
				},
			],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(formatCodeTourValidationIssues(result.issues)).toContain(
				'$.concepts[0].domain: Unknown domain "missing-domain"',
			);
			expect(formatCodeTourValidationIssues(result.issues)).toContain(
				'$.concepts[0].fragments[0]: Unknown fragment "missing-fragment"',
			);
		}
	});

	test("rejects broken edge endpoint and tour concept references", () => {
		const document = validTour();
		const result = validateCodeTourDocument({
			...document,
			edges: {
				concept: [{ from: "schema-change", to: "missing-concept" }],
				fragment: [{ from: "missing-fragment", to: "f-users-route" }],
			},
			tour: [{ conceptId: "missing-concept", title: "Broken step" }],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatCodeTourValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.edges.concept[0].to: Unknown endpoint "missing-concept"',
			);
			expect(formatted).toContain(
				'$.edges.fragment[0].from: Unknown endpoint "missing-fragment"',
			);
			expect(formatted).toContain(
				'$.tour[0].conceptId: Unknown concept "missing-concept"',
			);
		}
	});

	test("returns readable errors for malformed field shapes", () => {
		const document = validTour();
		const result = validateCodeTourDocument({
			...document,
			version: "2.0",
			domains: {
				infra: {
					label: "Infra",
					color: "pink",
				},
			},
			fragments: [
				{
					id: "bad fragment id",
					label: "broken.ts",
					path: "broken.ts",
					line: -1,
					code: [{ tokens: [["bad", 42]] }],
				},
			],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatCodeTourValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.version: Unsupported Code Tour version "2.0"; expected "1.0"',
			);
			expect(formatted).toContain(
				"$.domains.infra.color: Expected a 6-digit hex color",
			);
			expect(formatted).toContain(
				"$.fragments[0].id: Expected an identifier using only letters, numbers, underscores, or hyphens",
			);
			expect(formatted).toContain(
				"$.fragments[0].line: Expected a non-negative integer",
			);
			expect(formatted).toContain(
				"$.fragments[0].code[0].tokens[0][0]: Expected a known token kind",
			);
			expect(formatted).toContain(
				"$.fragments[0].code[0].tokens[0][1]: Expected token text",
			);
		}
	});
});

describe("parseCodeTourDocument", () => {
	test("parses and validates JSON content", () => {
		const result = parseCodeTourDocument(JSON.stringify(validTour()));

		expect(result.ok).toBe(true);
	});

	test("reports malformed JSON", () => {
		const result = parseCodeTourDocument("{not-json");

		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.issues[0]?.path).toBe("$");
			expect(result.issues[0]?.message).toContain("Malformed JSON");
		}
	});
});
