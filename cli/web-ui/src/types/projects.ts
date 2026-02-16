/**
 * Type definitions for V2 projects.
 * Canonical project type shared between hooks, components, and API layer.
 */

/** A registered project with enriched run statistics */
export interface V2Project {
	readonly id: string;
	readonly name: string;
	readonly path: string;
	readonly available: boolean;
	readonly runCount: number;
	readonly lastActivityAt: string | null;
}
