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
  | { _tag: "PortInUseError"; port: number };

export const usageError = (
  message: string,
  suggestion?: string
): CLIError => ({
  _tag: "UsageError",
  message,
  suggestion,
});

export const notFoundError = (
  resource: string,
  suggestion?: string
): CLIError => ({
  _tag: "NotFoundError",
  resource,
  suggestion,
});

export const configError = (
  message: string,
  suggestion?: string
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
        `Try using a different port: rp1 view --port ${error.port + 1}`
      );
    case "RuntimeError":
      return format(error.message);
  }
};

export const tryCatchTE = <A>(
  f: () => Promise<A>,
  onError: (e: unknown) => CLIError
): TE.TaskEither<CLIError, A> => TE.tryCatch(f, onError);
