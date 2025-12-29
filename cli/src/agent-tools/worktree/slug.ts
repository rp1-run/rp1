/**
 * Task slug generation for worktree branch naming.
 * Converts task descriptions into URL-safe, hyphen-separated slugs
 * suitable for git branch names.
 */

/**
 * Common stop words to filter from task descriptions.
 * These words don't add meaningful context to branch names.
 */
const STOP_WORDS: ReadonlySet<string> = new Set([
	"a",
	"an",
	"the",
	"to",
	"for",
	"in",
	"on",
	"at",
	"by",
	"with",
	"from",
	"of",
	"and",
	"or",
	"but",
	"is",
	"are",
	"was",
	"were",
	"be",
	"been",
	"being",
	"have",
	"has",
	"had",
	"do",
	"does",
	"did",
	"will",
	"would",
	"could",
	"should",
	"may",
	"might",
	"must",
	"shall",
	"can",
	"that",
	"this",
	"these",
	"those",
	"it",
	"its",
]);

/**
 * Maximum length for generated slugs.
 * Truncation occurs at word boundaries to maintain readability.
 */
const MAX_SLUG_LENGTH = 50;

/**
 * Generate a URL-safe slug from a task description.
 *
 * Algorithm:
 * 1. Extract words (split on whitespace/punctuation)
 * 2. Lowercase all words
 * 3. Filter common stop words (a, an, the, to, for, etc.)
 * 4. Join with hyphens
 * 5. Remove consecutive hyphens
 * 6. Truncate to 50 chars at word boundary
 * 7. Remove trailing hyphens
 *
 * @param taskDescription - The task description to convert
 * @returns A lowercase, hyphen-separated, alphanumeric slug
 *
 * @example
 * generateSlug("Fix the authentication bug in login")
 * // => "fix-authentication-bug-login"
 *
 * @example
 * generateSlug("Add dark mode toggle to settings")
 * // => "add-dark-mode-toggle-settings"
 */
export const generateSlug = (taskDescription: string): string => {
	const words = taskDescription
		.toLowerCase()
		.split(/[^a-z0-9]+/)
		.filter((word) => word.length > 0);

	const meaningfulWords = words.filter((word) => !STOP_WORDS.has(word));

	// Handle empty result (all stop words or empty input)
	if (meaningfulWords.length === 0) {
		return "";
	}

	let slug = meaningfulWords.join("-");

	slug = slug.replace(/-+/g, "-");
	if (slug.length > MAX_SLUG_LENGTH) {
		const truncateIndex = slug.lastIndexOf("-", MAX_SLUG_LENGTH);
		if (truncateIndex > 0) {
			slug = slug.substring(0, truncateIndex);
		} else {
			// No hyphen found before limit, hard truncate
			slug = slug.substring(0, MAX_SLUG_LENGTH);
		}
	}

	slug = slug.replace(/-+$/, "");

	return slug;
};
