import { describe, expect, test } from "bun:test";
import {
	type CodeTourDocument,
	formatCodeTourValidationIssues,
	parseCodeTourDocument,
	validateCodeTourDocument,
} from "../../../shared/code-tour.js";
import type { PRCartographyDocument } from "../../../shared/pr-cartography.js";

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

const validCartography = (): PRCartographyDocument => ({
	version: "1.0",
	kind: "pr-cartography",
	source: {
		source: "github_pr",
		target: "482",
		reviewId: "pr-482",
		baseRef: "main",
		headRef: "feat/tier",
		repo: "acme/billing",
		url: "https://github.com/acme/billing/pull/482",
	},
	evidenceIndex: [
		{
			id: "E-DIFF-001",
			kind: "diff",
			source: "db/schema/users.sql",
			summary: "Adds tier schema fields.",
		},
		{
			id: "E-FILE-001",
			kind: "file",
			source: "apps/api/users/route.ts",
			summary: "Surfaces tier fields through the users API.",
		},
	],
	files: [
		{
			id: "file-users-sql",
			path: "db/schema/users.sql",
			evidenceIds: ["E-DIFF-001"],
		},
		{
			id: "file-users-route",
			path: "apps/api/users/route.ts",
			evidenceIds: ["E-FILE-001"],
		},
	],
	fragments: [
		{
			id: "cart-frag-users-sql",
			fileId: "file-users-sql",
			path: "db/schema/users.sql",
			line: 24,
			lineEnd: 24,
			evidenceIds: ["E-DIFF-001"],
		},
		{
			id: "cart-frag-users-route",
			fileId: "file-users-route",
			path: "apps/api/users/route.ts",
			line: 12,
			lineEnd: 12,
			evidenceIds: ["E-FILE-001"],
		},
	],
	boundaries: [
		{
			id: "boundary-tier-contract",
			label: "Tier contract",
			summary: "The tier data contract moves from storage into the API.",
			fragmentIds: ["cart-frag-users-sql", "cart-frag-users-route"],
			contractIds: ["contract-tier-api"],
			evidenceIds: ["E-DIFF-001", "E-FILE-001"],
			confidence: "supported",
		},
	],
	contracts: [
		{
			id: "contract-tier-api",
			label: "Tier API response",
			kind: "api-response",
			producer: "db/schema/users.sql",
			consumer: "apps/api/users/route.ts",
			fragmentIds: ["cart-frag-users-route"],
			evidenceIds: ["E-FILE-001"],
		},
	],
	entities: [
		{
			id: "entity-user-tier",
			label: "User tier",
			kind: "model-field",
			fragmentIds: ["cart-frag-users-sql"],
			evidenceIds: ["E-DIFF-001"],
		},
	],
	sideEffects: [
		{
			id: "effect-api-output",
			label: "API output includes tier",
			kind: "user-visible-output",
			fragmentIds: ["cart-frag-users-route"],
			evidenceIds: ["E-FILE-001"],
		},
	],
	riskSurfaces: [
		{
			id: "risk-response-compatibility",
			label: "Response compatibility",
			question: "Does the new field preserve existing response consumers?",
			fragmentIds: ["cart-frag-users-route"],
			evidenceIds: ["E-FILE-001"],
			confidence: "question",
		},
	],
	relationships: [
		{
			from: "boundary-tier-contract",
			to: "contract-tier-api",
			kind: "uses-contract",
			label: "uses contract",
			evidenceIds: ["E-DIFF-001", "E-FILE-001"],
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

	test("accepts optional provenance fields resolved against PR cartography", () => {
		const document = validTour();
		const result = validateCodeTourDocument(
			{
				...document,
				concepts: [
					{
						...document.concepts[0],
						evidenceIds: ["E-DIFF-001"],
						cartographyRefs: [
							"boundary-tier-contract",
							{ kind: "contract", id: "contract-tier-api" },
						],
					},
					document.concepts[1],
				],
				fragments: [
					{
						...document.fragments[0],
						evidenceIds: ["E-DIFF-001"],
						cartographyRefs: [{ kind: "fragment", id: "cart-frag-users-sql" }],
					},
					document.fragments[1],
				],
				edges: {
					concept: [
						{
							from: "schema-change",
							to: "users-api",
							label: "feeds",
							kind: "data-flow",
							evidenceIds: ["E-FILE-001"],
							cartographyRefs: [
								{
									kind: "relationship",
									from: "boundary-tier-contract",
									to: "contract-tier-api",
									relationshipKind: "uses-contract",
								},
							],
						},
					],
				},
				tour: [
					{
						...(document.tour?.[0] ?? {}),
						conceptId: "schema-change",
						title: "Start with schema",
						evidenceIds: ["E-DIFF-001"],
						cartographyRefs: [
							{ kind: "riskSurface", id: "risk-response-compatibility" },
						],
					},
				],
			},
			{ cartography: validCartography() },
		);

		expect(result.ok).toBe(true);
		if (result.ok) {
			expect(result.document.concepts[0]?.evidenceIds).toEqual(["E-DIFF-001"]);
		}
	});

	test("keeps Code Tour artifacts without provenance valid with cartography supplied", () => {
		const result = validateCodeTourDocument(validTour(), {
			cartography: validCartography(),
		});

		expect(result.ok).toBe(true);
	});

	test("rejects unresolved provenance references when cartography is supplied", () => {
		const document = validTour();
		const result = validateCodeTourDocument(
			{
				...document,
				concepts: [
					{
						...document.concepts[0],
						evidenceIds: ["missing-evidence"],
						cartographyRefs: [
							"missing-cartography-id",
							{ kind: "boundary", id: "missing-boundary" },
						],
					},
					document.concepts[1],
				],
				edges: {
					concept: [
						{
							from: "schema-change",
							to: "users-api",
							cartographyRefs: [
								{
									kind: "relationship",
									from: "boundary-tier-contract",
									to: "contract-tier-api",
									relationshipKind: "missing-kind",
								},
							],
						},
					],
				},
			},
			{ cartography: validCartography() },
		);

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatCodeTourValidationIssues(result.issues);
			expect(formatted).toContain(
				'$.concepts[0].evidenceIds[0]: Unknown evidence id "missing-evidence"',
			);
			expect(formatted).toContain(
				'$.concepts[0].cartographyRefs[0]: Unknown cartography id "missing-cartography-id"',
			);
			expect(formatted).toContain(
				'$.concepts[0].cartographyRefs[1].id: Unknown boundary cartography id "missing-boundary"',
			);
			expect(formatted).toContain(
				'$.edges.concept[0].cartographyRefs[0]: Unknown cartography relationship from "boundary-tier-contract" to "contract-tier-api" with kind "missing-kind"',
			);
		}
	});

	test("rejects malformed provenance values", () => {
		const document = validTour();
		const result = validateCodeTourDocument({
			...document,
			concepts: [
				{
					...document.concepts[0],
					evidenceIds: "E-DIFF-001",
					cartographyRefs: [
						"",
						42,
						{ kind: "unknown", id: "boundary-tier-contract" },
						{ kind: "contract" },
						{ kind: "relationship", from: "boundary-tier-contract" },
					],
				},
				document.concepts[1],
			],
		});

		expect(result.ok).toBe(false);
		if (!result.ok) {
			const formatted = formatCodeTourValidationIssues(result.issues);
			expect(formatted).toContain(
				"$.concepts[0].evidenceIds: Expected an array of evidence ids",
			);
			expect(formatted).toContain(
				"$.concepts[0].cartographyRefs[0]: Expected a non-empty cartography id",
			);
			expect(formatted).toContain(
				"$.concepts[0].cartographyRefs[1]: Expected a cartography reference object",
			);
			expect(formatted).toContain(
				"$.concepts[0].cartographyRefs[2].kind: Expected a known cartography reference kind",
			);
			expect(formatted).toContain(
				"$.concepts[0].cartographyRefs[3].id: Required string is missing",
			);
			expect(formatted).toContain(
				"$.concepts[0].cartographyRefs[4].to: Required string is missing",
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
