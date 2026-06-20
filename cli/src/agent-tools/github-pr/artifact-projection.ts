/**
 * Pure projection of an rp1 artifact into a deterministic PR/issue comment body.
 *
 * Given artifact text and the repo-relative source path to display, it produces
 * the exact comment body. The output is a byte-exact contract verified against
 * golden fixtures; this module never reads GitHub and never mutates the artifact.
 *
 * Line endings are normalized to LF before projection, so a CRLF (`\r\n`)
 * artifact yields byte-identical output to its LF twin.
 */

/** GitHub's hard cap on a single comment body, in bytes. */
export const MAX_BYTES = 65536;

/**
 * Result of a projection: the rendered comment body plus any ladder warnings.
 */
export interface ProjectionResult {
	readonly body: string;
	readonly warnings: readonly string[];
}

/** Parsed frontmatter mapping plus the body that follows it. */
interface FrontmatterSplit {
	readonly fm: Record<string, string>;
	readonly body: string;
}

/** A summary slice and the remaining body, with an optional ladder warning. */
interface SummaryExtraction {
	readonly summary: string;
	readonly rest: string;
	readonly warning: string | null;
}

/**
 * A frontmatter key line: starts at column 0, identifier-ish key, then ": ".
 * Indented continuation lines (multi-line quoted values) never match, so a
 * colon inside a wrapped value cannot create a bogus key.
 */
const KEY_RE = /^([A-Za-z][A-Za-z0-9_-]*):\s?(.*)$/;

/** Python `str.rstrip()`: strip trailing ASCII whitespace ( \t\n\r\f\v). */
const rstrip = (s: string): string => s.replace(/[ \t\n\r\f\v]+$/, "");

/** Python `str.strip()`: strip leading and trailing ASCII whitespace. */
const strip = (s: string): string =>
	s.replace(/^[ \t\n\r\f\v]+/, "").replace(/[ \t\n\r\f\v]+$/, "");

/** Python `str.lstrip("\n")`: strip only leading newline characters. */
const lstripNewlines = (s: string): string => s.replace(/^\n+/, "");

/**
 * Split optional YAML frontmatter from the body.
 *
 * If the text does not open with a `---` block, fm is `{}` and the body is the
 * whole text. Values keep their first-line content; surrounding quotes are
 * stripped. CRLF line endings are tolerated (LF behavior unchanged).
 */
export const splitFrontmatter = (text: string): FrontmatterSplit => {
	const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/.exec(text);
	if (!m) {
		return { fm: {}, body: text };
	}
	const fm: Record<string, string> = {};
	for (const line of m[1].split(/\r\n|\r|\n/)) {
		const km = KEY_RE.exec(line);
		if (!km) {
			continue;
		}
		const key = strip(km[1]);
		let val = strip(km[2]);
		if (val && (val[0] === '"' || val[0] === "'")) {
			if (val.length >= 2 && val[val.length - 1] === val[0]) {
				val = val.slice(1, -1);
			} else {
				val = val.slice(1);
			}
		}
		fm[key] = val;
	}
	return { fm, body: m[2] };
};

/** Title-case a slug: split on `-`/`_`, capitalize each non-empty word. */
const titleCase = (slug: string): string => {
	const words = slug.replace(/_/g, "-").split("-");
	return words
		.filter((w) => w.length > 0)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
		.join(" ");
};

/** First `# ` heading text in the body, or null. */
const firstH1 = (body: string): string | null => {
	const m = /^#\s+(.+?)\s*$/m.exec(body);
	return m ? m[1] : null;
};

/** Field lookup that strips the value, returning "" when absent. */
const field = (fm: Record<string, string>, key: string): string =>
	strip(fm[key] ?? "");

/** Filename stem (basename without final extension). */
const stem = (path: string): string => {
	const base = path.slice(path.replace(/\\/g, "/").lastIndexOf("/") + 1);
	const dot = base.lastIndexOf(".");
	return dot > 0 ? base.slice(0, dot) : base;
};

/**
 * Derive the title.
 * Precedence: `artifact` field -> first H1 -> `producer` -> filename stem.
 */
export const deriveTitle = (
	fm: Record<string, string>,
	body: string,
	artifactPath: string,
): string => {
	const art = field(fm, "artifact");
	if (art) {
		const title = titleCase(art);
		const issue = field(fm, "issue_id");
		return issue ? `${title} — ${issue}` : title;
	}
	const h1 = firstH1(body);
	if (h1) {
		return h1;
	}
	const prod = field(fm, "producer");
	if (prod) {
		return titleCase(prod);
	}
	return titleCase(stem(artifactPath));
};

/** Drop a single leading `# ...` line and the blank lines around it. */
export const stripLeadingH1 = (body: string): string => {
	let b = lstripNewlines(body);
	if (b.startsWith("# ")) {
		const nl = b.indexOf("\n");
		b = nl !== -1 ? b.slice(nl + 1) : "";
	}
	return lstripNewlines(b);
};

/**
 * An author-placed split marker on its own line. Case-sensitive token; any
 * surrounding whitespace (and internal spacing inside the comment) is
 * tolerated. An inline marker mid-paragraph never matches.
 */
const SPLIT_RE = /^[ \t]*<!--[ \t]*rp1:split[ \t]*-->[ \t]*$/m;

const SUMMARY_RE =
	/^##\s+(?:\d+\.\s+)?(Executive Summary|Summary|Overview|TL;DR)\s*$/im;

/** Normalize a slice: strip edge blank lines, end in one newline (or ""). */
const norm = (s: string): string => {
	const t = rstrip(lstripNewlines(s));
	return t ? `${t}\n` : "";
};

/** Section shape: content after a heading line up to the next `## `. */
const sectionAfter = (
	body: string,
	headingEnd: number,
): { summary: string; rest: string } => {
	const start = headingEnd + 1; // skip the newline after the heading line
	const slice = body.slice(start);
	const nxt = /^## /m.exec(slice);
	const end = nxt ? start + nxt.index : body.length;
	const summary = norm(body.slice(start, end));
	const rest = end < body.length ? norm(body.slice(end)) : "";
	return { summary, rest };
};

/** Lead shape: content before idx is the summary, idx onward is the rest. */
const leadSplit = (
	body: string,
	idx: number,
): { summary: string; rest: string } => ({
	summary: norm(body.slice(0, idx)),
	rest: norm(body.slice(idx)),
});

/**
 * Deterministic summary ladder. First match wins.
 *
 * Rung 0 is an explicit author-placed `<!-- rp1:split -->` marker: content
 * before it is the summary, content after it is the rest, and the marker line
 * itself is dropped. It overrides every heuristic rung below (including a named
 * Executive Summary heading) because it is the author's stated intent.
 */
export const extractSummary = (body: string): SummaryExtraction => {
	const split = SPLIT_RE.exec(body);
	if (split) {
		// rung 0 — explicit split marker
		const summary = norm(body.slice(0, split.index));
		const rest = norm(body.slice(split.index + split[0].length));
		const warning = summary
			? null
			: "WARNING: <!-- rp1:split --> marker found but no content precedes it; " +
				"the Executive Summary will be empty.";
		return { summary, rest, warning };
	}

	const named = SUMMARY_RE.exec(body);
	if (named) {
		// rung 1
		const { summary, rest } = sectionAfter(body, named.index + named[0].length);
		return { summary, rest, warning: null };
	}

	const h2 = /^## .*$/m.exec(body);
	if (h2) {
		// rung 2
		const heading = strip(h2[0].slice(3));
		const { summary, rest } = sectionAfter(body, h2.index + h2[0].length);
		return {
			summary,
			rest,
			warning: `WARNING: no Executive Summary section found; falling back to first H2 ("${heading}").`,
		};
	}

	const sub = /^#{3,6}\s/m.exec(body);
	if (sub) {
		// rung 3
		return {
			...leadSplit(body, sub.index),
			warning:
				"WARNING: no H2 found; splitting before first subheading (rung 3).",
		};
	}

	const thematic = /^(?:---|\*\*\*|___)\s*$/m.exec(body);
	if (thematic) {
		// rung 4
		return {
			...leadSplit(body, thematic.index),
			warning:
				"WARNING: no headings found; splitting at first thematic break (rung 4).",
		};
	}

	const blank = /\n[ \t]*\n/.exec(body);
	if (blank) {
		// rung 5 — split at the first blank line
		return {
			...leadSplit(body, blank.index + 1),
			warning:
				"WARNING: no structure found; using lead paragraph as summary (rung 5).",
		};
	}

	// rung 6 — single block
	return {
		summary: norm(body),
		rest: "",
		warning:
			"WARNING: single-block body; posting whole body as summary (rung 6).",
	};
};

const BANNER =
	"> ⚠️ **This artifact is marked `incomplete`.** " +
	"Reviewers: the analysis below may evolve.";

/**
 * Header table rows, skipping any field that has no value.
 * Source path is always shown, so the table is never empty.
 */
export const buildTableRows = (
	fm: Record<string, string>,
	sourcePath: string,
): string[] => {
	const rows = ["| Field | Value |", "|-------|-------|"];
	const producer = field(fm, "producer");
	const atype = field(fm, "artifact") || field(fm, "type");
	const issue = field(fm, "issue_id");
	const status = field(fm, "status");
	const date = field(fm, "date");
	const doc = field(fm, "rp1_doc_id");
	if (producer) {
		rows.push(`| Producer | \`${producer}\` |`);
	}
	if (atype) {
		rows.push(`| Artifact type | \`${atype}\` |`);
	}
	if (issue) {
		rows.push(`| Issue ID | \`${issue}\` |`);
	}
	if (status) {
		rows.push(`| Status | \`${status}\` |`);
	}
	if (date) {
		rows.push(`| Generated | ${date} |`);
	}
	if (doc) {
		rows.push(`| Doc ID | \`${doc}\` |`);
	}
	rows.push(
		`| Source path | \`${sourcePath}\` (gitignored, local to author) |`,
	);
	return rows;
};

/** Return the incomplete banner line, or null. */
export const buildBanner = (fm: Record<string, string>): string | null =>
	field(fm, "status").toLowerCase() === "incomplete" ? BANNER : null;

/** Idempotency key: `rp1_doc_id` when present, else `path:<source_path>`. */
export const markerKey = (
	fm: Record<string, string>,
	sourcePath: string,
): string => {
	const doc = field(fm, "rp1_doc_id");
	return doc ? doc : `path:${sourcePath}`;
};

const FOOTER_RULE = "---";
const FOOTER_SUB =
	"<sub>\u{1F916} Posted by `publish-artifact`. Re-run the skill to update " +
	"this comment in place. Local artifact is gitignored and may be edited by " +
	"`rp1` agents.</sub>";

/**
 * Build the exact comment body.
 * `summaryBody`/`restBody` end in one `\n` (rest may be "").
 */
export const assemble = (
	key: string,
	title: string,
	tableRows: readonly string[],
	banner: string | null,
	summaryBody: string,
	restBody: string,
): string => {
	const lines: string[] = [
		`<!-- rp1-artifact: ${key} -->`,
		`## \u{1F4CB} rp1 Artifact: ${title}`,
		"",
	];
	lines.push(...tableRows);
	lines.push("");
	if (banner) {
		lines.push(banner);
		lines.push("");
	}
	lines.push("### Executive Summary");
	lines.push("");
	lines.push(...rstripNewlinesOnly(summaryBody).split("\n"));
	if (restBody) {
		lines.push("");
		lines.push("<details>");
		lines.push(
			"<summary><strong>Full artifact</strong> (click to expand)</summary>",
		);
		lines.push("");
		lines.push(...rstripNewlinesOnly(restBody).split("\n"));
		lines.push("");
		lines.push("</details>");
	}
	lines.push("");
	lines.push(FOOTER_RULE);
	lines.push(FOOTER_SUB);
	return `${lines.join("\n")}\n`;
};

/** Python `str.rstrip("\n")`: strip only trailing newline characters. */
const rstripNewlinesOnly = (s: string): string => s.replace(/\n+$/, "");

/** Return an error message if body exceeds GitHub's cap, else null. */
export const checkSize = (body: string): string | null => {
	const n = new TextEncoder().encode(body).length;
	if (n > MAX_BYTES) {
		return `Comment body exceeds GitHub's 65 KB cap (${n} bytes). Multi-comment chunking is not yet supported.`;
	}
	return null;
};

/**
 * Pure projection from artifact text + source path to the comment body.
 *
 * @param text - Raw artifact file contents.
 * @param sourcePath - Repo-relative path shown in the Source path row and the
 *   `path:` marker key.
 */
export const project = (text: string, sourcePath: string): ProjectionResult => {
	// Normalize line endings up front (faithful to Python's universal-newline
	// read). Otherwise a CRLF artifact leaks a stray `\r` into every projected
	// line, because `assemble` splits the body on `\n`.
	const normalized = text.replace(/\r\n?/g, "\n");
	const { fm, body } = splitFrontmatter(normalized);
	const title = deriveTitle(fm, body, sourcePath);
	const body1 = stripLeadingH1(body);
	const { summary, rest, warning } = extractSummary(body1);
	const warnings = warning ? [warning] : [];
	const rows = buildTableRows(fm, sourcePath);
	const banner = buildBanner(fm);
	const key = markerKey(fm, sourcePath);
	const out = assemble(key, title, rows, banner, summary, rest);
	return { body: out, warnings };
};
