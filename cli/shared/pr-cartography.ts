export const PR_CARTOGRAPHY_VERSION = "1.0" as const;
export const PR_CARTOGRAPHY_KIND = "pr-cartography" as const;

export type PRCartographyConfidence = "supported" | "question";

export interface PRCartographySource {
	readonly source: string;
	readonly target?: string;
	readonly reviewId?: string;
	readonly baseRef?: string;
	readonly headRef?: string;
	readonly repo?: string;
	readonly url?: string;
}

export interface PRCartographyEvidence {
	readonly id: string;
	readonly kind: string;
	readonly source: string;
	readonly summary: string;
}

export interface PRCartographyFile {
	readonly id: string;
	readonly path: string;
	readonly evidenceIds: readonly string[];
}

export interface PRCartographyFragment {
	readonly id: string;
	readonly fileId: string;
	readonly path: string;
	readonly line?: number;
	readonly lineEnd?: number;
	readonly summary?: string;
	readonly evidenceIds: readonly string[];
}

export interface PRCartographyBoundary {
	readonly id: string;
	readonly label: string;
	readonly summary: string;
	readonly fragmentIds: readonly string[];
	readonly contractIds?: readonly string[];
	readonly entityIds?: readonly string[];
	readonly sideEffectIds?: readonly string[];
	readonly riskSurfaceIds?: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly confidence?: PRCartographyConfidence;
}

export interface PRCartographyContract {
	readonly id: string;
	readonly label: string;
	readonly kind: string;
	readonly producer?: string;
	readonly consumer?: string;
	readonly fragmentIds: readonly string[];
	readonly evidenceIds: readonly string[];
}

export interface PRCartographyEntity {
	readonly id: string;
	readonly label: string;
	readonly kind: string;
	readonly summary?: string;
	readonly fragmentIds: readonly string[];
	readonly evidenceIds: readonly string[];
}

export interface PRCartographySideEffect {
	readonly id: string;
	readonly label: string;
	readonly kind: string;
	readonly summary?: string;
	readonly fragmentIds: readonly string[];
	readonly evidenceIds: readonly string[];
}

export interface PRCartographyRiskSurface {
	readonly id: string;
	readonly label: string;
	readonly question: string;
	readonly summary?: string;
	readonly fragmentIds: readonly string[];
	readonly evidenceIds: readonly string[];
	readonly confidence?: PRCartographyConfidence;
}

export interface PRCartographyRelationship {
	readonly from: string;
	readonly to: string;
	readonly kind: string;
	readonly label?: string;
	readonly evidenceIds: readonly string[];
}

export interface PRCartographyDocument {
	readonly version: typeof PR_CARTOGRAPHY_VERSION;
	readonly kind: typeof PR_CARTOGRAPHY_KIND;
	readonly source: PRCartographySource;
	readonly evidenceIndex: readonly PRCartographyEvidence[];
	readonly files: readonly PRCartographyFile[];
	readonly fragments: readonly PRCartographyFragment[];
	readonly boundaries: readonly PRCartographyBoundary[];
	readonly contracts: readonly PRCartographyContract[];
	readonly entities: readonly PRCartographyEntity[];
	readonly sideEffects: readonly PRCartographySideEffect[];
	readonly riskSurfaces: readonly PRCartographyRiskSurface[];
	readonly relationships: readonly PRCartographyRelationship[];
}

export interface PRCartographyValidationIssue {
	readonly path: string;
	readonly message: string;
}

export type PRCartographyValidationResult =
	| { readonly ok: true; readonly document: PRCartographyDocument }
	| {
			readonly ok: false;
			readonly issues: readonly PRCartographyValidationIssue[];
	  };

type ReferenceKind =
	| "evidence"
	| "file"
	| "fragment"
	| "contract"
	| "entity"
	| "side effect"
	| "risk surface"
	| "relationship endpoint";

type CartographyIdKind =
	| Exclude<ReferenceKind, "evidence" | "relationship endpoint">
	| "boundary";

interface PendingReference {
	readonly path: string;
	readonly id: string;
	readonly kind: ReferenceKind;
}

interface CartographyIdRegistry {
	readonly all: Map<string, string>;
	readonly byKind: Record<CartographyIdKind, Map<string, string>>;
}

const idPattern = /^[a-zA-Z0-9_-]+$/;
const confidenceValues = new Set<PRCartographyConfidence>([
	"supported",
	"question",
]);

const verdictLanguagePatterns: readonly {
	readonly pattern: RegExp;
	readonly label: string;
}[] = [
	{ pattern: /\bapprov(?:e|al|ed|ing)\b/i, label: "approval language" },
	{ pattern: /\breject(?:ion|ed|ing)?\b/i, label: "rejection language" },
	{
		pattern: /\brequest(?:ed|ing)? changes\b/i,
		label: "requested-changes language",
	},
	{ pattern: /\bchanges requested\b/i, label: "requested-changes language" },
	{ pattern: /\bmerge[- ]readiness\b/i, label: "merge-readiness language" },
	{ pattern: /\bready to merge\b/i, label: "merge-readiness language" },
	{ pattern: /\bsafe to merge\b/i, label: "merge-readiness language" },
	{ pattern: /\bshould merge\b/i, label: "merge-readiness language" },
	{ pattern: /\bdo not merge\b/i, label: "merge-readiness language" },
	{ pattern: /\bdon't merge\b/i, label: "merge-readiness language" },
	{
		pattern: /\bblock(?:s|ed|ing)? merge\b/i,
		label: "merge-readiness language",
	},
	{ pattern: /\blgtm\b/i, label: "approval language" },
	{ pattern: /\bship it\b/i, label: "approval language" },
	{ pattern: /\b(?:pr\s+)?comment\b/i, label: "PR-comment language" },
	{ pattern: /\bfinding(?:s)?\b/i, label: "finding language" },
	{ pattern: /\bverdict(?:s)?\b/i, label: "verdict language" },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const hasOwn = (value: Record<string, unknown>, key: string): boolean =>
	Object.hasOwn(value, key);

const pushIssue = (
	issues: PRCartographyValidationIssue[],
	path: string,
	message: string,
): void => {
	issues.push({ path, message });
};

const readRequiredString = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: PRCartographyValidationIssue[],
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
	issues: PRCartographyValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	if (typeof record[key] !== "string") {
		pushIssue(issues, path, "Expected a string");
	}
};

const validateOptionalPositiveInteger = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	const value = record[key];
	if (!Number.isInteger(value) || (value as number) < 1) {
		pushIssue(issues, path, "Expected a positive integer");
	}
};

const validateId = (
	id: string | undefined,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	if (id !== undefined && !idPattern.test(id)) {
		pushIssue(
			issues,
			path,
			"Expected an identifier using only letters, numbers, underscores, or hyphens",
		);
	}
};

const validateConfidence = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		return;
	}

	const value = record[key];
	if (
		typeof value !== "string" ||
		!confidenceValues.has(value as PRCartographyConfidence)
	) {
		pushIssue(issues, path, 'Expected "supported" or "question"');
	}
};

const readIdReferenceArray = (
	record: Record<string, unknown>,
	key: string,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	kind: ReferenceKind,
	options: { readonly required: boolean; readonly atLeastOne?: boolean },
): void => {
	if (!hasOwn(record, key) || record[key] === undefined) {
		if (options.required) {
			pushIssue(issues, path, "Required reference array is missing");
		}
		return;
	}

	const value = record[key];
	if (!Array.isArray(value)) {
		pushIssue(issues, path, "Expected an array of ids");
		return;
	}

	if (options.atLeastOne && value.length === 0) {
		pushIssue(issues, path, "Expected at least one id");
	}

	value.forEach((id, index) => {
		const itemPath = `${path}[${index}]`;
		if (typeof id !== "string" || id.trim() === "") {
			pushIssue(issues, itemPath, "Expected a non-empty id");
			return;
		}
		pendingReferences.push({ path: itemPath, id, kind });
	});
};

const registerEvidenceId = (
	evidenceIds: Map<string, string>,
	id: string | undefined,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	validateId(id, path, issues);
	if (id === undefined) {
		return;
	}

	const existingPath = evidenceIds.get(id);
	if (existingPath !== undefined) {
		pushIssue(
			issues,
			path,
			`Duplicate evidence id "${id}" already defined at ${existingPath}`,
		);
		return;
	}

	evidenceIds.set(id, path);
};

const registerCartographyId = (
	cartographyIds: CartographyIdRegistry,
	kind: CartographyIdKind,
	id: string | undefined,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	validateId(id, path, issues);
	if (id === undefined) {
		return;
	}

	const existingPath = cartographyIds.all.get(id);
	if (existingPath !== undefined) {
		pushIssue(
			issues,
			path,
			`Duplicate cartography id "${id}" already defined at ${existingPath}`,
		);
		return;
	}

	cartographyIds.all.set(id, path);
	cartographyIds.byKind[kind].set(id, path);
};

const createCartographyIdRegistry = (): CartographyIdRegistry => ({
	all: new Map<string, string>(),
	byKind: {
		file: new Map<string, string>(),
		fragment: new Map<string, string>(),
		boundary: new Map<string, string>(),
		contract: new Map<string, string>(),
		entity: new Map<string, string>(),
		"side effect": new Map<string, string>(),
		"risk surface": new Map<string, string>(),
	},
});

const validateSource = (
	value: unknown,
	issues: PRCartographyValidationIssue[],
): void => {
	if (!isRecord(value)) {
		pushIssue(issues, "$.source", "Expected an object");
		return;
	}

	readRequiredString(value, "source", "$.source.source", issues);
	validateOptionalString(value, "target", "$.source.target", issues);
	validateOptionalString(value, "reviewId", "$.source.reviewId", issues);
	validateOptionalString(value, "baseRef", "$.source.baseRef", issues);
	validateOptionalString(value, "headRef", "$.source.headRef", issues);
	validateOptionalString(value, "repo", "$.source.repo", issues);
	validateOptionalString(value, "url", "$.source.url", issues);
};

const validateEvidenceIndex = (
	value: unknown,
	issues: PRCartographyValidationIssue[],
): Map<string, string> => {
	const evidenceIds = new Map<string, string>();

	if (!Array.isArray(value)) {
		pushIssue(issues, "$.evidenceIndex", "Expected an array");
		return evidenceIds;
	}

	if (value.length === 0) {
		pushIssue(issues, "$.evidenceIndex", "Expected at least one item");
	}

	value.forEach((evidence, index) => {
		const path = `$.evidenceIndex[${index}]`;
		if (!isRecord(evidence)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const id = readRequiredString(evidence, "id", `${path}.id`, issues);
		registerEvidenceId(evidenceIds, id, `${path}.id`, issues);
		readRequiredString(evidence, "kind", `${path}.kind`, issues);
		readRequiredString(evidence, "source", `${path}.source`, issues);
		readRequiredString(evidence, "summary", `${path}.summary`, issues);
	});

	return evidenceIds;
};

const validateFiles = (
	value: unknown,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	if (!Array.isArray(value)) {
		pushIssue(issues, "$.files", "Expected an array");
		return;
	}

	if (value.length === 0) {
		pushIssue(issues, "$.files", "Expected at least one item");
	}

	value.forEach((file, index) => {
		const path = `$.files[${index}]`;
		if (!isRecord(file)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const id = readRequiredString(file, "id", `${path}.id`, issues);
		registerCartographyId(cartographyIds, "file", id, `${path}.id`, issues);
		readRequiredString(file, "path", `${path}.path`, issues);
		readIdReferenceArray(
			file,
			"evidenceIds",
			`${path}.evidenceIds`,
			issues,
			pendingReferences,
			"evidence",
			{ required: true, atLeastOne: true },
		);
	});
};

const validateFragments = (
	value: unknown,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	if (!Array.isArray(value)) {
		pushIssue(issues, "$.fragments", "Expected an array");
		return;
	}

	if (value.length === 0) {
		pushIssue(issues, "$.fragments", "Expected at least one item");
	}

	value.forEach((fragment, index) => {
		const path = `$.fragments[${index}]`;
		if (!isRecord(fragment)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const id = readRequiredString(fragment, "id", `${path}.id`, issues);
		registerCartographyId(cartographyIds, "fragment", id, `${path}.id`, issues);
		const fileId = readRequiredString(
			fragment,
			"fileId",
			`${path}.fileId`,
			issues,
		);
		if (fileId !== undefined) {
			pendingReferences.push({
				path: `${path}.fileId`,
				id: fileId,
				kind: "file",
			});
		}
		readRequiredString(fragment, "path", `${path}.path`, issues);
		validateOptionalPositiveInteger(fragment, "line", `${path}.line`, issues);
		validateOptionalPositiveInteger(
			fragment,
			"lineEnd",
			`${path}.lineEnd`,
			issues,
		);
		validateOptionalString(fragment, "summary", `${path}.summary`, issues);
		readIdReferenceArray(
			fragment,
			"evidenceIds",
			`${path}.evidenceIds`,
			issues,
			pendingReferences,
			"evidence",
			{ required: true, atLeastOne: true },
		);
	});
};

const validateBoundary = (
	boundary: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	const id = readRequiredString(boundary, "id", `${path}.id`, issues);
	registerCartographyId(cartographyIds, "boundary", id, `${path}.id`, issues);
	readRequiredString(boundary, "label", `${path}.label`, issues);
	readRequiredString(boundary, "summary", `${path}.summary`, issues);
	validateConfidence(boundary, "confidence", `${path}.confidence`, issues);
	readIdReferenceArray(
		boundary,
		"fragmentIds",
		`${path}.fragmentIds`,
		issues,
		pendingReferences,
		"fragment",
		{ required: true, atLeastOne: true },
	);
	readIdReferenceArray(
		boundary,
		"contractIds",
		`${path}.contractIds`,
		issues,
		pendingReferences,
		"contract",
		{ required: false },
	);
	readIdReferenceArray(
		boundary,
		"entityIds",
		`${path}.entityIds`,
		issues,
		pendingReferences,
		"entity",
		{ required: false },
	);
	readIdReferenceArray(
		boundary,
		"sideEffectIds",
		`${path}.sideEffectIds`,
		issues,
		pendingReferences,
		"side effect",
		{ required: false },
	);
	readIdReferenceArray(
		boundary,
		"riskSurfaceIds",
		`${path}.riskSurfaceIds`,
		issues,
		pendingReferences,
		"risk surface",
		{ required: false },
	);
	readIdReferenceArray(
		boundary,
		"evidenceIds",
		`${path}.evidenceIds`,
		issues,
		pendingReferences,
		"evidence",
		{ required: true, atLeastOne: true },
	);
};

const validateContract = (
	contract: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	const id = readRequiredString(contract, "id", `${path}.id`, issues);
	registerCartographyId(cartographyIds, "contract", id, `${path}.id`, issues);
	readRequiredString(contract, "label", `${path}.label`, issues);
	readRequiredString(contract, "kind", `${path}.kind`, issues);
	validateOptionalString(contract, "producer", `${path}.producer`, issues);
	validateOptionalString(contract, "consumer", `${path}.consumer`, issues);
	readIdReferenceArray(
		contract,
		"fragmentIds",
		`${path}.fragmentIds`,
		issues,
		pendingReferences,
		"fragment",
		{ required: true, atLeastOne: true },
	);
	readIdReferenceArray(
		contract,
		"evidenceIds",
		`${path}.evidenceIds`,
		issues,
		pendingReferences,
		"evidence",
		{ required: true, atLeastOne: true },
	);
};

const validateEntity = (
	entity: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	const id = readRequiredString(entity, "id", `${path}.id`, issues);
	registerCartographyId(cartographyIds, "entity", id, `${path}.id`, issues);
	readRequiredString(entity, "label", `${path}.label`, issues);
	readRequiredString(entity, "kind", `${path}.kind`, issues);
	validateOptionalString(entity, "summary", `${path}.summary`, issues);
	readIdReferenceArray(
		entity,
		"fragmentIds",
		`${path}.fragmentIds`,
		issues,
		pendingReferences,
		"fragment",
		{ required: true, atLeastOne: true },
	);
	readIdReferenceArray(
		entity,
		"evidenceIds",
		`${path}.evidenceIds`,
		issues,
		pendingReferences,
		"evidence",
		{ required: true, atLeastOne: true },
	);
};

const validateSideEffect = (
	sideEffect: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	const id = readRequiredString(sideEffect, "id", `${path}.id`, issues);
	registerCartographyId(
		cartographyIds,
		"side effect",
		id,
		`${path}.id`,
		issues,
	);
	readRequiredString(sideEffect, "label", `${path}.label`, issues);
	readRequiredString(sideEffect, "kind", `${path}.kind`, issues);
	validateOptionalString(sideEffect, "summary", `${path}.summary`, issues);
	readIdReferenceArray(
		sideEffect,
		"fragmentIds",
		`${path}.fragmentIds`,
		issues,
		pendingReferences,
		"fragment",
		{ required: true, atLeastOne: true },
	);
	readIdReferenceArray(
		sideEffect,
		"evidenceIds",
		`${path}.evidenceIds`,
		issues,
		pendingReferences,
		"evidence",
		{ required: true, atLeastOne: true },
	);
};

const validateRiskLanguage = (
	riskSurface: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
): void => {
	for (const field of ["label", "question", "summary"] as const) {
		const value = riskSurface[field];
		if (typeof value !== "string") {
			continue;
		}

		const match = verdictLanguagePatterns.find(({ pattern }) =>
			pattern.test(value),
		);
		if (match !== undefined) {
			pushIssue(
				issues,
				`${path}.${field}`,
				`Risk surfaces must be phrased as reviewer focus or open questions; remove ${match.label}`,
			);
		}
	}
};

const validateRiskSurface = (
	riskSurface: Record<string, unknown>,
	path: string,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
	cartographyIds: CartographyIdRegistry,
): void => {
	const id = readRequiredString(riskSurface, "id", `${path}.id`, issues);
	registerCartographyId(
		cartographyIds,
		"risk surface",
		id,
		`${path}.id`,
		issues,
	);
	readRequiredString(riskSurface, "label", `${path}.label`, issues);
	readRequiredString(riskSurface, "question", `${path}.question`, issues);
	validateOptionalString(riskSurface, "summary", `${path}.summary`, issues);
	validateConfidence(riskSurface, "confidence", `${path}.confidence`, issues);
	validateRiskLanguage(riskSurface, path, issues);
	readIdReferenceArray(
		riskSurface,
		"fragmentIds",
		`${path}.fragmentIds`,
		issues,
		pendingReferences,
		"fragment",
		{ required: true, atLeastOne: true },
	);
	readIdReferenceArray(
		riskSurface,
		"evidenceIds",
		`${path}.evidenceIds`,
		issues,
		pendingReferences,
		"evidence",
		{ required: true, atLeastOne: true },
	);
};

const validateObjectArray = (
	value: unknown,
	path: string,
	issues: PRCartographyValidationIssue[],
	visit: (record: Record<string, unknown>, itemPath: string) => void,
): void => {
	if (!Array.isArray(value)) {
		pushIssue(issues, path, "Expected an array");
		return;
	}

	value.forEach((item, index) => {
		const itemPath = `${path}[${index}]`;
		if (!isRecord(item)) {
			pushIssue(issues, itemPath, "Expected an object");
			return;
		}
		visit(item, itemPath);
	});
};

const validateRelationships = (
	value: unknown,
	issues: PRCartographyValidationIssue[],
	pendingReferences: PendingReference[],
): void => {
	if (!Array.isArray(value)) {
		pushIssue(issues, "$.relationships", "Expected an array");
		return;
	}

	value.forEach((relationship, index) => {
		const path = `$.relationships[${index}]`;
		if (!isRecord(relationship)) {
			pushIssue(issues, path, "Expected an object");
			return;
		}

		const from = readRequiredString(
			relationship,
			"from",
			`${path}.from`,
			issues,
		);
		if (from !== undefined) {
			pendingReferences.push({
				path: `${path}.from`,
				id: from,
				kind: "relationship endpoint",
			});
		}

		const to = readRequiredString(relationship, "to", `${path}.to`, issues);
		if (to !== undefined) {
			pendingReferences.push({
				path: `${path}.to`,
				id: to,
				kind: "relationship endpoint",
			});
		}

		readRequiredString(relationship, "kind", `${path}.kind`, issues);
		validateOptionalString(relationship, "label", `${path}.label`, issues);
		readIdReferenceArray(
			relationship,
			"evidenceIds",
			`${path}.evidenceIds`,
			issues,
			pendingReferences,
			"evidence",
			{ required: true, atLeastOne: true },
		);
	});
};

const resolveReferences = (
	pendingReferences: readonly PendingReference[],
	evidenceIds: ReadonlyMap<string, string>,
	cartographyIds: CartographyIdRegistry,
	issues: PRCartographyValidationIssue[],
): void => {
	for (const reference of pendingReferences) {
		if (reference.kind === "evidence") {
			if (!evidenceIds.has(reference.id)) {
				pushIssue(
					issues,
					reference.path,
					`Unknown evidence id "${reference.id}"`,
				);
			}
			continue;
		}

		if (reference.kind === "relationship endpoint") {
			if (!cartographyIds.all.has(reference.id)) {
				pushIssue(
					issues,
					reference.path,
					`Unknown cartography relationship endpoint "${reference.id}"`,
				);
			}
			continue;
		}

		if (!cartographyIds.byKind[reference.kind].has(reference.id)) {
			pushIssue(
				issues,
				reference.path,
				`Unknown ${reference.kind} id "${reference.id}"`,
			);
		}
	}
};

export const validatePRCartographyDocument = (
	value: unknown,
): PRCartographyValidationResult => {
	const issues: PRCartographyValidationIssue[] = [];
	const pendingReferences: PendingReference[] = [];
	const cartographyIds = createCartographyIdRegistry();

	if (!isRecord(value)) {
		return {
			ok: false,
			issues: [
				{ path: "$", message: "Expected a PR cartography document object" },
			],
		};
	}

	const version = readRequiredString(value, "version", "$.version", issues);
	if (version !== undefined && version !== PR_CARTOGRAPHY_VERSION) {
		pushIssue(
			issues,
			"$.version",
			`Unsupported PR cartography version "${version}"; expected "${PR_CARTOGRAPHY_VERSION}"`,
		);
	}

	const kind = readRequiredString(value, "kind", "$.kind", issues);
	if (kind !== undefined && kind !== PR_CARTOGRAPHY_KIND) {
		pushIssue(
			issues,
			"$.kind",
			`Unsupported PR cartography kind "${kind}"; expected "${PR_CARTOGRAPHY_KIND}"`,
		);
	}

	if (!hasOwn(value, "source")) {
		pushIssue(issues, "$.source", "Required source context is missing");
	} else {
		validateSource(value.source, issues);
	}

	const evidenceIds = validateEvidenceIndex(value.evidenceIndex, issues);

	validateFiles(value.files, issues, pendingReferences, cartographyIds);

	validateFragments(value.fragments, issues, pendingReferences, cartographyIds);

	validateObjectArray(
		value.boundaries,
		"$.boundaries",
		issues,
		(boundary, path) =>
			validateBoundary(
				boundary,
				path,
				issues,
				pendingReferences,
				cartographyIds,
			),
	);

	validateObjectArray(
		value.contracts,
		"$.contracts",
		issues,
		(contract, path) =>
			validateContract(
				contract,
				path,
				issues,
				pendingReferences,
				cartographyIds,
			),
	);

	validateObjectArray(value.entities, "$.entities", issues, (entity, path) =>
		validateEntity(entity, path, issues, pendingReferences, cartographyIds),
	);

	validateObjectArray(
		value.sideEffects,
		"$.sideEffects",
		issues,
		(sideEffect, path) =>
			validateSideEffect(
				sideEffect,
				path,
				issues,
				pendingReferences,
				cartographyIds,
			),
	);

	validateObjectArray(
		value.riskSurfaces,
		"$.riskSurfaces",
		issues,
		(riskSurface, path) =>
			validateRiskSurface(
				riskSurface,
				path,
				issues,
				pendingReferences,
				cartographyIds,
			),
	);

	validateRelationships(value.relationships, issues, pendingReferences);

	resolveReferences(pendingReferences, evidenceIds, cartographyIds, issues);

	if (issues.length > 0) {
		return { ok: false, issues };
	}

	return { ok: true, document: value as unknown as PRCartographyDocument };
};

export const parsePRCartographyDocument = (
	content: string,
): PRCartographyValidationResult => {
	try {
		return validatePRCartographyDocument(JSON.parse(content));
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		return {
			ok: false,
			issues: [{ path: "$", message: `Malformed JSON: ${message}` }],
		};
	}
};

export const formatPRCartographyValidationIssues = (
	issues: readonly PRCartographyValidationIssue[],
): string =>
	issues.map((issue) => `${issue.path}: ${issue.message}`).join("\n");
