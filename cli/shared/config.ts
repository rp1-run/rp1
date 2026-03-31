import { resolve } from "node:path";
import * as E from "fp-ts/lib/Either.js";
import { pipe } from "fp-ts/lib/function.js";
import * as O from "fp-ts/lib/Option.js";
import { resolveDirectorySet } from "./directory-resolution.js";
import { type CLIError, notFoundError, usageError } from "./errors.js";

export interface CLIConfig {
	rp1Root: string;
	verbose: boolean;
	trace: boolean;
}

export interface ArcadeConfig extends CLIConfig {
	port: number;
	openBrowser: boolean;
}

export const findRp1Root = (
	startPath: string = process.cwd(),
): O.Option<string> =>
	pipe(
		resolveDirectorySet(startPath),
		E.match(
			() => O.none,
			(result) => O.some(result.projectRoot),
		),
	);

const parsePort = (portStr: string): E.Either<CLIError, number> => {
	const port = parseInt(portStr, 10);
	return Number.isNaN(port) || port < 1 || port > 65535
		? E.left(
				usageError(
					`Invalid port: ${portStr}`,
					"Use a number between 1 and 65535",
				),
			)
		: E.right(port);
};

export const parseArcadeArgs = (
	args: string[],
): E.Either<CLIError, ArcadeConfig> => {
	const config: ArcadeConfig = {
		rp1Root: "",
		port: 7710,
		openBrowser: true,
		verbose: false,
		trace: false,
	};

	for (let i = 0; i < args.length; i++) {
		const arg = args[i];

		if (arg === "--no-open") {
			config.openBrowser = false;
		} else if (arg === "--port" || arg === "-p") {
			const portResult = parsePort(args[++i] || "");
			if (E.isLeft(portResult)) return portResult;
			config.port = portResult.right;
		} else if (arg.startsWith("--port=")) {
			const portResult = parsePort(arg.slice("--port=".length));
			if (E.isLeft(portResult)) return portResult;
			config.port = portResult.right;
		} else if (arg === "--verbose" || arg === "-v") {
			config.verbose = true;
		} else if (arg === "--trace") {
			config.trace = true;
		} else if (!arg.startsWith("-")) {
			config.rp1Root = resolve(arg);
		}
	}

	return E.right(config);
};

export const resolveRp1Root = (
	config: ArcadeConfig,
): E.Either<CLIError, ArcadeConfig> =>
	pipe(
		resolveDirectorySet(config.rp1Root || process.cwd()),
		E.map((directories) => ({
			...config,
			rp1Root: directories.projectRoot,
		})),
		E.chain((resolvedConfig) =>
			pipe(
				resolvedConfig.rp1Root,
				O.fromPredicate((root) => root.length > 0),
				E.fromOption(() =>
					notFoundError(
						".rp1 directory",
						"Run this command from an rp1 project directory, or specify a path: rp1 arcade /path/to/project",
					),
				),
				E.map(() => resolvedConfig),
			),
		),
	);

export const loadArcadeConfig = (
	args: string[],
): E.Either<CLIError, ArcadeConfig> =>
	pipe(parseArcadeArgs(args), E.chain(resolveRp1Root));
