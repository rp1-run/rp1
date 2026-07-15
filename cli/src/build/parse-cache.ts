/**
 * Per-invocation parse cache for skill and agent source files.
 * Ensures each SKILL.md or agent .md file is read and parsed exactly once
 * per build invocation, even when multiple platform passes consume the
 * same source tree. The map stores the in-flight Promise so concurrent
 * platform passes share one parse instead of racing check-then-set.
 */

import { resolve } from "node:path";
import type * as E from "fp-ts/lib/Either.js";
import type { CLIError } from "../../shared/errors.js";
import type { ClaudeCodeAgent, ClaudeCodeSkill } from "./models.js";
import { parseAgent, parseSkill } from "./parser.js";

export class ParseCache {
	private readonly skills = new Map<
		string,
		Promise<E.Either<CLIError, ClaudeCodeSkill>>
	>();
	private readonly agents = new Map<
		string,
		Promise<E.Either<CLIError, ClaudeCodeAgent>>
	>();

	getSkill(skillDir: string): Promise<E.Either<CLIError, ClaudeCodeSkill>> {
		const key = resolve(skillDir);
		const cached = this.skills.get(key);
		if (cached !== undefined) return cached;

		const pending = parseSkill(skillDir)();
		this.skills.set(key, pending);
		return pending;
	}

	getAgent(filePath: string): Promise<E.Either<CLIError, ClaudeCodeAgent>> {
		const key = resolve(filePath);
		const cached = this.agents.get(key);
		if (cached !== undefined) return cached;

		const pending = parseAgent(filePath)();
		this.agents.set(key, pending);
		return pending;
	}
}
