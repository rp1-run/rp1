import * as TE from "fp-ts/lib/TaskEither.js";

export enum ExitCode {
	SUCCESS = 0,
	GENERAL_ERROR = 1,
	USAGE_ERROR = 2,
	CONFIG_ERROR = 3,
	NOT_FOUND = 4,
}

export type CLIError =
	| { _tag: "UsageError"; message: string; suggestion?: string }
	| { _tag: "NotFoundError"; resource: string; suggestion?: string }
	| { _tag: "ConfigError"; message: string; suggestion?: string }
	| { _tag: "RuntimeError"; message: string; cause?: unknown }
	| { _tag: "PortInUseError"; port: number }
	// Build errors
	| { _tag: "ParseError"; file: string; message: string }
	| { _tag: "TransformError"; file: string; message: string }
	| {
			_tag: "ValidationError";
			file: string;
			level: "L1" | "L2";
			message: string;
	  }
	| { _tag: "GenerationError"; file: string; message: string }
	// Install errors
	| {
			_tag: "PrerequisiteError";
			check: string;
			message: string;
			suggestion?: string;
	  }
	| { _tag: "InstallError"; operation: string; message: string }
	| { _tag: "BackupError"; message: string }
	| { _tag: "VerificationError"; message: string; issues: string[] };

export const usageError = (message: string, suggestion?: string): CLIError => ({
	_tag: "UsageError",
	message,
	suggestion,
});

export const notFoundError = (
	resource: string,
	suggestion?: string,
): CLIError => ({
	_tag: "NotFoundError",
	resource,
	suggestion,
});

export const configError = (
	message: string,
	suggestion?: string,
): CLIError => ({
	_tag: "ConfigError",
	message,
	suggestion,
});

export const runtimeError = (message: string, cause?: unknown): CLIError => ({
	_tag: "RuntimeError",
	message,
	cause,
});

export const portInUseError = (port: number): CLIError => ({
	_tag: "PortInUseError",
	port,
});

// Build error factories
export const parseError = (file: string, message: string): CLIError => ({
	_tag: "ParseError",
	file,
	message,
});

export const transformError = (file: string, message: string): CLIError => ({
	_tag: "TransformError",
	file,
	message,
});

export const validationError = (
	file: string,
	level: "L1" | "L2",
	message: string,
): CLIError => ({
	_tag: "ValidationError",
	file,
	level,
	message,
});

export const generationError = (file: string, message: string): CLIError => ({
	_tag: "GenerationError",
	file,
	message,
});

// Install error factories
export const prerequisiteError = (
	check: string,
	message: string,
	suggestion?: string,
): CLIError => ({
	_tag: "PrerequisiteError",
	check,
	message,
	suggestion,
});

export const installError = (operation: string, message: string): CLIError => ({
	_tag: "InstallError",
	operation,
	message,
});

export const backupError = (message: string): CLIError => ({
	_tag: "BackupError",
	message,
});

export const verificationError = (
	message: string,
	issues: string[],
): CLIError => ({
	_tag: "VerificationError",
	message,
	issues,
});

export const getExitCode = (error: CLIError): ExitCode => {
	switch (error._tag) {
		case "UsageError":
			return ExitCode.USAGE_ERROR;
		case "NotFoundError":
			return ExitCode.NOT_FOUND;
		case "ConfigError":
			return ExitCode.CONFIG_ERROR;
		case "PortInUseError":
			return ExitCode.CONFIG_ERROR;
		case "RuntimeError":
			return ExitCode.GENERAL_ERROR;
		// Build errors
		case "ParseError":
		case "TransformError":
		case "ValidationError":
		case "GenerationError":
			return ExitCode.GENERAL_ERROR;
		// Install errors
		case "PrerequisiteError":
		case "InstallError":
		case "BackupError":
		case "VerificationError":
			return ExitCode.GENERAL_ERROR;
	}
};

export type CLIErrorWithExit = CLIError & { exitCode: ExitCode };

export const withExitCode = (error: CLIError): CLIErrorWithExit => ({
	...error,
	exitCode: getExitCode(error),
});

export const formatError = (error: CLIError, color = true): string => {
	const red = color ? "\x1b[31m" : "";
	const yellow = color ? "\x1b[33m" : "";
	const reset = color ? "\x1b[0m" : "";

	const format = (msg: string, suggestion?: string): string => {
		let output = `${red}Error:${reset} ${msg}`;
		if (suggestion) {
			output += `\n\n${yellow}Suggestion:${reset} ${suggestion}`;
		}
		return output;
	};

	switch (error._tag) {
		case "UsageError":
			return format(error.message, error.suggestion);
		case "NotFoundError":
			return format(`${error.resource} not found`, error.suggestion);
		case "ConfigError":
			return format(error.message, error.suggestion);
		case "PortInUseError":
			return format(
				`Port ${error.port} is already in use`,
				`Try using a different port: rp1 view --port ${error.port + 1}`,
			);
		case "RuntimeError":
			return format(error.message);
		// Build errors
		case "ParseError":
			return format(`Parse error in ${error.file}: ${error.message}`);
		case "TransformError":
			return format(`Transform error in ${error.file}: ${error.message}`);
		case "ValidationError":
			return format(
				`${error.level} validation error in ${error.file}: ${error.message}`,
			);
		case "GenerationError":
			return format(`Generation error for ${error.file}: ${error.message}`);
		// Install errors
		case "PrerequisiteError":
			return format(
				`Prerequisite check '${error.check}' failed: ${error.message}`,
				error.suggestion,
			);
		case "InstallError":
			return format(
				`Installation failed during ${error.operation}: ${error.message}`,
			);
		case "BackupError":
			return format(`Backup failed: ${error.message}`);
		case "VerificationError":
			return format(
				`Verification failed: ${error.message}\nIssues:\n${error.issues.map((i) => `  • ${i}`).join("\n")}`,
			);
	}
};

export const tryCatchTE = <A>(
	f: () => Promise<A>,
	onError: (e: unknown) => CLIError,
): TE.TaskEither<CLIError, A> => TE.tryCatch(f, onError);
