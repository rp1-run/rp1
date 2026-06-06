import type {
	PRCartographyDocument,
	PRCartographyRelationship,
} from "./pr-cartography.js";

export const CODE_TOUR_VERSION = "1.0" as const;

export interface CodeTourAuthor {
	readonly name?: string;
	readonly handle?: string;
}

export interface CodeTourSource {
	readonly kind: string;
	readonly repo?: string;
	readonly id?: string;
	readonly url?: string;
	readonly ref?: string;
	readonly createdAt?: string;
	readonly author?: CodeTourAuthor;
}

export interface CodeTourDomain {
	readonly label: string;
	readonly color: string;
}

export type CodeTourDomains = Readonly<Record<string, CodeTourDomain>>;

export type CodeTourCartographyRefKind =
	| "file"
	| "fragment"
	| "boundary"
	| "contract"
	| "entity"
	| "sideEffect"
	| "riskSurface"
	| "relationship";

export interface CodeTourTypedCartographyRef {
	readonly kind: CodeTourCartographyRefKind;
	readonly id?: string;
	readonly from?: string;
	readonly to?: string;
	readonly relationshipKind?: string;
}

export type CodeTourCartographyRef = string | CodeTourTypedCartographyRef;

export interface CodeTourProvenance {
	readonly evidenceIds?: readonly string[];
	readonly cartographyRefs?: readonly CodeTourCartographyRef[];
}

export interface CodeTourConcept extends CodeTourProvenance {
	readonly id: string;
	readonly label: string;
	readonly domain: string;
	readonly epicenter?: boolean;
	readonly summary?: string;
	readonly fragments: readonly string[];
}

export type CodeTourTokenKind =
	| ""
	| "kw"
	| "fn"
	| "str"
	| "num"
	| "cmt"
	| "type";

export type CodeTourToken = readonly [CodeTourTokenKind, string];

export interface CodeTourCodeLine {
	readonly type?: "add" | "del";
	readonly tokens: readonly CodeTourToken[];
}

export interface CodeTourFragmentHighlight {
	readonly lines?: readonly number[];
}

export interface CodeTourFragment extends CodeTourProvenance {
	readonly id: string;
	readonly label: string;
	readonly path: string;
	readonly line?: number;
	readonly lineEnd?: number;
	readonly tree?: string;
	readonly url?: string;
	readonly language?: string;
	readonly code: readonly CodeTourCodeLine[];
	readonly highlight?: CodeTourFragmentHighlight;
}

export interface CodeTourEdge extends CodeTourProvenance {
	readonly from: string;
	readonly to: string;
	readonly label?: string;
	readonly kind?: string;
}

export interface CodeTourEdges {
	readonly concept?: readonly CodeTourEdge[];
	readonly fragment?: readonly CodeTourEdge[];
}

export interface CodeTourStep extends CodeTourProvenance {
	readonly conceptId: string;
	readonly title: string;
	readonly sub?: string;
	readonly reason?: string;
}

export interface CodeTourDocument {
	readonly version: typeof CODE_TOUR_VERSION;
	readonly kind: string;
	readonly title: string;
	readonly source: CodeTourSource;
	readonly domains: CodeTourDomains;
	readonly concepts: readonly CodeTourConcept[];
	readonly fragments: readonly CodeTourFragment[];
	readonly edges?: CodeTourEdges;
	readonly tour?: readonly CodeTourStep[];
}

export interface CodeTourValidationIssue {
	readonly path: string;
	readonly message: string;
}

export interface CodeTourValidationOptions {
	readonly cartography?: PRCartographyDocument;
}

export type CodeTourValidationResult =
	| { readonly ok: true; readonly document: CodeTourDocument }
	| { readonly ok: false; readonly issues: readonly CodeTourValidationIssue[] };

const idPattern = /^[a-zA-Z0-9_-]+$/;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const tokenKinds = new Set(["", "kw", "fn", "str", "num", "cmt", "type"]);
const cartographyRefKinds = new Set<CodeTourCartographyRefKind>([
	"file",
	"fragment",
	"boundary",
	"contract",
	"entity",
	"sideEffect",
	"riskSurface",
	"relationship",
]);

type CodeTourCartographyIdRefKind = Exclude<
	CodeTourCartographyRefKind,
	"relationship"
>;

interface CodeTourCartographyIndex {
	readonly evidenceIds: ReadonlySet<string>;
	readonly allIds: ReadonlySet<string>;
	readonly idsByKind: Record<CodeTourCartographyIdRefKind, ReadonlySet<string>>;
	readonly relationships: readonly PRCartographyRelationship[];
}

const cartographyKindLabels: Record<CodeTourCartographyIdRefKind, string> = {
	file: "file",
	fragment: "fragment",
	boundary: "boundary",
	contract: "contract",
	entity: "entity",
	sideEffect: "side effect",
	riskSurface: "risk surface",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
	Object.hasOwn(value, key);

const pushIssue = (
	issues: CodeTourValidationIssue[],
	path: string,
	message: string,
): void => {
	issues.push({ path, message });
};

const readRequiredString = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: CodeTourValidationIssue[],
): string | undefined => {
	if (!hasOwn(record, key)) {
		pushIssue(issues, path, "Required string is missing");
		return undefined;
	}

	const value = record[key];
	if (typeof value !== "string" || value.trim() === "") {
		pushIssue(issues, path, "Expected a non-empty string");
		return undefined;
	}

	return value;
};

const validateOptionalString = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	if (typeof record[key] !== "string") {
		pushIssue(issues, path, "Expected a string");
	}
};

const validateOptionalBoolean = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	if (typeof record[key] !== "boolean") {
		pushIssue(issues, path, "Expected a boolean");
	}
};

const validateOptionalNonNegativeInteger = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	const value = record[key];
	if (!Number.isInteger(value) || (value as number) < 0) {
		pushIssue(issues, path, "Expected a non-negative integer");
	}
};

const validateId = (
	id: string | undefined,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (id !== undefined && !idPattern.test(id)) {
		pushIssue(
			issues,
			path,
			"Expected an identifier using only letters, numbers, underscores, or hyphens",
		);
	}
};

const createCartographyIndex = (
	cartography: PRCartographyDocument | undefined,
): CodeTourCartographyIndex | undefined => {
	if (cartography === undefined) {
		return undefined;
	}

	const idSets = {
		file: new Set(cartography.files.map((file) => file.id)),
		fragment: new Set(cartography.fragments.map((fragment) => fragment.id)),
		boundary: new Set(cartography.boundaries.map((boundary) => boundary.id)),
		contract: new Set(cartography.contracts.map((contract) => contract.id)),
		entity: new Set(cartography.entities.map((entity) => entity.id)),
		sideEffect: new Set(
			cartography.sideEffects.map((sideEffect) => sideEffect.id),
		),
		riskSurface: new Set(
			cartography.riskSurfaces.map((riskSurface) => riskSurface.id),
		),
	};

	return {
		evidenceIds: new Set(
			cartography.evidenceIndex.map((evidence) => evidence.id),
		),
		allIds: new Set(Object.values(idSets).flatMap((ids) => [...ids])),
		idsByKind: idSets,
		relationships: cartography.relationships,
	};
};

const validateOptionalEvidenceIds = (
	record: Record<string, unknown>,
	path: string,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	if (!hasOwn(record, "evidenceIds") || record.evidenceIds === undefined) {
		return;
	}

	if (!Array.isArray(record.evidenceIds)) {
		pushIssue(issues, path, "Expected an array of evidence ids");
		return;
	}

	record.evidenceIds.forEach((evidenceId, index) => {
		const itemPath = `${path}[${index}]`;
		if (typeof evidenceId !== "string" || evidenceId.trim() === "") {
			pushIssue(issues, itemPath, "Expected a non-empty evidence id");
			return;
		}

		validateId(evidenceId, itemPath, issues);
		if (
			cartographyIndex !== undefined &&
			!cartographyIndex.evidenceIds.has(evidenceId)
		) {
			pushIssue(issues, itemPath, `Unknown evidence id "${evidenceId}"`);
		}
	});
};

const relationshipMatches = (
	relationship: PRCartographyRelationship,
	from: string,
	to: string,
	relationshipKind: string | undefined,
): boolean =>
	relationship.from === from &&
	relationship.to === to &&
	(relationshipKind === undefined || relationship.kind === relationshipKind);

const validateRelationshipCartographyRef = (
	reference: Record<string, unknown>,
	path: string,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	const from = readRequiredString(reference, "from", `${path}.from`, issues);
	const to = readRequiredString(reference, "to", `${path}.to`, issues);
	validateId(from, `${path}.from`, issues);
	validateId(to, `${path}.to`, issues);
	validateOptionalString(
		reference,
		"relationshipKind",
		`${path}.relationshipKind`,
		issues,
	);

	if (
		cartographyIndex === undefined ||
		from === undefined ||
		to === undefined
	) {
		return;
	}

	const relationshipKind =
		typeof reference.relationshipKind === "string"
			? reference.relationshipKind
			: undefined;
	const hasRelationship = cartographyIndex.relationships.some((relationship) =>
		relationshipMatches(relationship, from, to, relationshipKind),
	);

	if (!hasRelationship) {
		const kindSuffix =
			relationshipKind === undefined ? "" : ` with kind "${relationshipKind}"`;
		pushIssue(
			issues,
			path,
			`Unknown cartography relationship from "${from}" to "${to}"${kindSuffix}`,
		);
	}
};

const validateTypedCartographyRef = (
	reference: Record<string, unknown>,
	path: string,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	const kind = readRequiredString(reference, "kind", `${path}.kind`, issues);
	if (
		kind === undefined ||
		!cartographyRefKinds.has(kind as CodeTourCartographyRefKind)
	) {
		if (kind !== undefined) {
			pushIssue(
				issues,
				`${path}.kind`,
				"Expected a known cartography reference kind",
			);
		}
		return;
	}

	if (kind === "relationship") {
		validateRelationshipCartographyRef(
			reference,
			path,
			issues,
			cartographyIndex,
		);
		return;
	}

	const id = readRequiredString(reference, "id", `${path}.id`, issues);
	validateId(id, `${path}.id`, issues);

	if (cartographyIndex === undefined || id === undefined) {
		return;
	}

	const refKind = kind as CodeTourCartographyIdRefKind;
	if (!cartographyIndex.idsByKind[refKind].has(id)) {
		pushIssue(
			issues,
			`${path}.id`,
			`Unknown ${cartographyKindLabels[refKind]} cartography id "${id}"`,
		);
	}
};

const validateOptionalCartographyRefs = (
	record: Record<string, unknown>,
	path: string,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	if (
		!hasOwn(record, "cartographyRefs") ||
		record.cartographyRefs === undefined
	) {
		return;
	}

	if (!Array.isArray(record.cartographyRefs)) {
		pushIssue(issues, path, "Expected an array of cartography references");
		return;
	}

	record.cartographyRefs.forEach((reference, index) => {
		const itemPath = `${path}[${index}]`;
		if (typeof reference === "string") {
			if (reference.trim() === "") {
				pushIssue(issues, itemPath, "Expected a non-empty cartography id");
				return;
			}

			validateId(reference, itemPath, issues);
			if (
				cartographyIndex !== undefined &&
				!cartographyIndex.allIds.has(reference)
			) {
				pushIssue(issues, itemPath, `Unknown cartography id "${reference}"`);
			}
			return;
		}

		if (!isRecord(reference)) {
			pushIssue(issues, itemPath, "Expected a cartography reference object");
			return;
		}

		validateTypedCartographyRef(reference, itemPath, issues, cartographyIndex);
	});
};

const validateProvenance = (
	record: Record<string, unknown>,
	path: string,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	validateOptionalEvidenceIds(
		record,
		`${path}.evidenceIds`,
		issues,
		cartographyIndex,
	);
	validateOptionalCartographyRefs(
		record,
		`${path}.cartographyRefs`,
		issues,
		cartographyIndex,
	);
};

const validateSource = (
	value: unknown,
	issues: CodeTourValidationIssue[],
): void => {
	if (!isRecord(value)) {
		pushIssue(issues, "$.source", "Expected an object");
		return;
	}

	readRequiredString(value, "kind", "$.source.kind", issues);
	validateOptionalString(value, "repo", "$.source.repo", issues);
	validateOptionalString(value, "id", "$.source.id", issues);
	validateOptionalString(value, "url", "$.source.url", issues);
	validateOptionalString(value, "ref", "$.source.ref", issues);
	validateOptionalString(value, "createdAt", "$.source.createdAt", issues);

	if (hasOwn(value, "author") && value.author !== undefined) {
		if (!isRecord(value.author)) {
			pushIssue(issues, "$.source.author", "Expected an object");
			return;
		}

		validateOptionalString(
			value.author,
			"name",
			"$.source.author.name",
			issues,
		);
		validateOptionalString(
			value.author,
			"handle",
			"$.source.author.handle",
			issues,
		);
	}
};

const validateDomains = (
	value: unknown,
	issues: CodeTourValidationIssue[],
): Set<string> => {
	const domainIds = new Set<string>();

	if (!isRecord(value)) {
		pushIssue(
			issues,
			"$.domains",
			"Expected an object with at least one domain",
		);
		return domainIds;
	}

	const entries = Object.entries(value);
	if (entries.length === 0) {
		pushIssue(issues, "$.domains", "Expected at least one domain");
	}

	for (const [domainId, domain] of entries) {
		const path = `$.domains.${domainId}`;
		if (domainId.trim() === "") {
			pushIssue(issues, "$.domains", "Domain IDs must be non-empty strings");
		}
		domainIds.add(domainId);

		if (!isRecord(domain)) {
			pushIssue(issues, path, "Expected an object");
			continue;
		}

		readRequiredString(domain, "label", `${path}.label`, issues);
		const color = readRequiredString(domain, "color", `${path}.color`, issues);
		if (color !== undefined && !hexColorPattern.test(color)) {
			pushIssue(issues, `${path}.color`, "Expected a 6-digit hex color");
		}
	}

	return domainIds;
};

const validateConcepts = (
	value: unknown,
	domainIds: ReadonlySet<string>,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): {
	readonly conceptIds: Set<string>;
	readonly fragmentReferences: { readonly path: string; readonly id: string }[];
} => {
	const conceptIds = new Set<string>();
	const fragmentReferences: { readonly path: string; readonly id: string }[] =
		[];

	if (!Array.isArray(value)) {
		pushIssue(
			issues,
			"$.concepts",
			"Expected an array with at least one concept",
		);
		return { conceptIds, fragmentReferences };
	}

	if (value.length === 0) {
		pushIssue(issues, "$.concepts", "Expected at least one concept");
	}

	value.forEach((concept, index) => {
		const path = `$.concepts[${index}]`;
		if (!isRecord(concept)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const id = readRequiredString(concept, "id", `${path}.id`, issues);
		validateId(id, `${path}.id`, issues);
		if (id !== undefined) {
			if (conceptIds.has(id)) {
				pushIssue(issues, `${path}.id`, `Duplicate concept id "${id}"`);
			}
			conceptIds.add(id);
		}

		readRequiredString(concept, "label", `${path}.label`, issues);
		const domain = readRequiredString(
			concept,
			"domain",
			`${path}.domain`,
			issues,
		);
		if (domain !== undefined && !domainIds.has(domain)) {
			pushIssue(issues, `${path}.domain`, `Unknown domain "${domain}"`);
		}

		validateOptionalBoolean(concept, "epicenter", `${path}.epicenter`, issues);
		validateOptionalString(concept, "summary", `${path}.summary`, issues);
		validateProvenance(concept, path, issues, cartographyIndex);

		if (!Array.isArray(concept.fragments)) {
			pushIssue(
				issues,
				`${path}.fragments`,
				"Expected a non-empty array of fragment ids",
			);
			return;
		}

		if (concept.fragments.length === 0) {
			pushIssue(
				issues,
				`${path}.fragments`,
				"Expected at least one fragment id",
			);
		}

		concept.fragments.forEach((fragmentId, fragmentIndex) => {
			const fragmentPath = `${path}.fragments[${fragmentIndex}]`;
			if (typeof fragmentId !== "string" || fragmentId.trim() === "") {
				pushIssue(issues, fragmentPath, "Expected a non-empty fragment id");
				return;
			}
			fragmentReferences.push({ path: fragmentPath, id: fragmentId });
		});
	});

	return { conceptIds, fragmentReferences };
};

const validateCodeLine = (
	value: unknown,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (!isRecord(value)) {
		pushIssue(issues, path, "Expected an object");
		return;
	}

	if (
		hasOwn(value, "type") &&
		value.type !== undefined &&
		value.type !== "add" &&
		value.type !== "del"
	) {
		pushIssue(issues, `${path}.type`, 'Expected "add" or "del"');
	}

	if (!Array.isArray(value.tokens)) {
		pushIssue(issues, `${path}.tokens`, "Expected an array of token pairs");
		return;
	}

	value.tokens.forEach((token, tokenIndex) => {
		const tokenPath = `${path}.tokens[${tokenIndex}]`;
		if (!Array.isArray(token) || token.length !== 2) {
			pushIssue(issues, tokenPath, "Expected a [kind, text] token pair");
			return;
		}

		const [kind, text] = token;
		if (typeof kind !== "string" || !tokenKinds.has(kind)) {
			pushIssue(issues, `${tokenPath}[0]`, "Expected a known token kind");
		}
		if (typeof text !== "string") {
			pushIssue(issues, `${tokenPath}[1]`, "Expected token text");
		}
	});
};

const validateHighlight = (
	value: unknown,
	path: string,
	issues: CodeTourValidationIssue[],
): void => {
	if (!isRecord(value)) {
		pushIssue(issues, path, "Expected an object");
		return;
	}

	if (!hasOwn(value, "lines") || value.lines === undefined) {
		return;
	}

	if (!Array.isArray(value.lines)) {
		pushIssue(issues, `${path}.lines`, "Expected an array of line indexes");
		return;
	}

	value.lines.forEach((line, index) => {
		if (!Number.isInteger(line) || (line as number) < 0) {
			pushIssue(
				issues,
				`${path}.lines[${index}]`,
				"Expected a non-negative integer",
			);
		}
	});
};

const validateFragments = (
	value: unknown,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): Set<string> => {
	const fragmentIds = new Set<string>();

	if (!Array.isArray(value)) {
		pushIssue(
			issues,
			"$.fragments",
			"Expected an array with at least one fragment",
		);
		return fragmentIds;
	}

	if (value.length === 0) {
		pushIssue(issues, "$.fragments", "Expected at least one fragment");
	}

	value.forEach((fragment, index) => {
		const path = `$.fragments[${index}]`;
		if (!isRecord(fragment)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const id = readRequiredString(fragment, "id", `${path}.id`, issues);
		validateId(id, `${path}.id`, issues);
		if (id !== undefined) {
			if (fragmentIds.has(id)) {
				pushIssue(issues, `${path}.id`, `Duplicate fragment id "${id}"`);
			}
			fragmentIds.add(id);
		}

		readRequiredString(fragment, "label", `${path}.label`, issues);
		readRequiredString(fragment, "path", `${path}.path`, issues);
		validateOptionalNonNegativeInteger(
			fragment,
			"line",
			`${path}.line`,
			issues,
		);
		validateOptionalNonNegativeInteger(
			fragment,
			"lineEnd",
			`${path}.lineEnd`,
			issues,
		);
		validateOptionalString(fragment, "tree", `${path}.tree`, issues);
		validateOptionalString(fragment, "url", `${path}.url`, issues);
		validateOptionalString(fragment, "language", `${path}.language`, issues);

		if (!Array.isArray(fragment.code)) {
			pushIssue(issues, `${path}.code`, "Expected an array of code lines");
		} else {
			fragment.code.forEach((line, lineIndex) =>
				validateCodeLine(line, `${path}.code[${lineIndex}]`, issues),
			);
		}

		if (hasOwn(fragment, "highlight") && fragment.highlight !== undefined) {
			validateHighlight(fragment.highlight, `${path}.highlight`, issues);
		}
		validateProvenance(fragment, path, issues, cartographyIndex);
	});

	return fragmentIds;
};

const validateEdgeArray = (
	value: unknown,
	path: string,
	validIds: ReadonlySet<string>,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	if (!Array.isArray(value)) {
		pushIssue(issues, path, "Expected an array of edges");
		return;
	}

	value.forEach((edge, index) => {
		const edgePath = `${path}[${index}]`;
		if (!isRecord(edge)) {
			pushIssue(issues, edgePath, "Expected an object");
			return;
		}

		const from = readRequiredString(edge, "from", `${edgePath}.from`, issues);
		const to = readRequiredString(edge, "to", `${edgePath}.to`, issues);
		if (from !== undefined && !validIds.has(from)) {
			pushIssue(issues, `${edgePath}.from`, `Unknown endpoint "${from}"`);
		}
		if (to !== undefined && !validIds.has(to)) {
			pushIssue(issues, `${edgePath}.to`, `Unknown endpoint "${to}"`);
		}

		validateOptionalString(edge, "label", `${edgePath}.label`, issues);
		validateOptionalString(edge, "kind", `${edgePath}.kind`, issues);
		validateProvenance(edge, edgePath, issues, cartographyIndex);
	});
};

const validateEdges = (
	value: unknown,
	conceptIds: ReadonlySet<string>,
	fragmentIds: ReadonlySet<string>,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	if (value === undefined) {
		return;
	}

	if (!isRecord(value)) {
		pushIssue(issues, "$.edges", "Expected an object");
		return;
	}

	if (hasOwn(value, "concept") && value.concept !== undefined) {
		validateEdgeArray(
			value.concept,
			"$.edges.concept",
			conceptIds,
			issues,
			cartographyIndex,
		);
	}
	if (hasOwn(value, "fragment") && value.fragment !== undefined) {
		validateEdgeArray(
			value.fragment,
			"$.edges.fragment",
			fragmentIds,
			issues,
			cartographyIndex,
		);
	}
};

const validateTour = (
	value: unknown,
	conceptIds: ReadonlySet<string>,
	issues: CodeTourValidationIssue[],
	cartographyIndex: CodeTourCartographyIndex | undefined,
): void => {
	if (value === undefined) {
		return;
	}

	if (!Array.isArray(value)) {
		pushIssue(issues, "$.tour", "Expected an array of tour steps");
		return;
	}

	value.forEach((step, index) => {
		const path = `$.tour[${index}]`;
		if (!isRecord(step)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const conceptId = readRequiredString(
			step,
			"conceptId",
			`${path}.conceptId`,
			issues,
		);
		if (conceptId !== undefined && !conceptIds.has(conceptId)) {
			pushIssue(issues, `${path}.conceptId`, `Unknown concept "${conceptId}"`);
		}

		readRequiredString(step, "title", `${path}.title`, issues);
		validateOptionalString(step, "sub", `${path}.sub`, issues);
		validateOptionalString(step, "reason", `${path}.reason`, issues);
		validateProvenance(step, path, issues, cartographyIndex);
	});
};

export const validateCodeTourDocument = (
	value: unknown,
	options: CodeTourValidationOptions = {},
): CodeTourValidationResult => {
	const issues: CodeTourValidationIssue[] = [];
	const cartographyIndex = createCartographyIndex(options.cartography);

	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [{ path: "$", message: "Expected a Code Tour document object" }],
		};
	}

	const version = readRequiredString(value, "version", "$.version", issues);
	if (version !== undefined && version !== CODE_TOUR_VERSION) {
		pushIssue(
			issues,
			"$.version",
			`Unsupported Code Tour version "${version}"; expected "${CODE_TOUR_VERSION}"`,
		);
	}

	readRequiredString(value, "kind", "$.kind", issues);
	readRequiredString(value, "title", "$.title", issues);

	if (!hasOwn(value, "source")) {
		pushIssue(issues, "$.source", "Required source context is missing");
	} else {
		validateSource(value.source, issues);
	}

	const domainIds = validateDomains(value.domains, issues);
	const { conceptIds, fragmentReferences } = validateConcepts(
		value.concepts,
		domainIds,
		issues,
		cartographyIndex,
	);
	const fragmentIds = validateFragments(
		value.fragments,
		issues,
		cartographyIndex,
	);

	for (const reference of fragmentReferences) {
		if (!fragmentIds.has(reference.id)) {
			pushIssue(issues, reference.path, `Unknown fragment "${reference.id}"`);
		}
	}

	validateEdges(value.edges, conceptIds, fragmentIds, issues, cartographyIndex);
	validateTour(value.tour, conceptIds, issues, cartographyIndex);

	if (issues.length > 0) {
		return { ok: false, issues };
	}

	return { ok: true, document: value as unknown as CodeTourDocument };
};

export const parseCodeTourDocument = (
	content: string,
	options: CodeTourValidationOptions = {},
): CodeTourValidationResult => {
	try {
		return validateCodeTourDocument(JSON.parse(content), options);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			issues: [{ path: "$", message: `Malformed JSON: ${message}` }],
		};
	}
};

export const formatCodeTourValidationIssues = (
	issues: readonly CodeTourValidationIssue[],
): string =>
	issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
