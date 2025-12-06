export {
  pipe,
  flow,
  identity,
  type Either,
  left,
  right,
  isLeft,
  isRight,
  fold,
  map,
  mapLeft,
  chain,
  getOrElse,
  fromPredicate,
  fromOption,
  type TaskEither,
  tryCatch,
  mapTE,
  chainTE,
  foldTE,
  fromEither,
  rightTE,
  leftTE,
  chainFirstTE,
  bindTE,
  DoTE,
  type Option,
  some,
  none,
  fromNullable,
  isSome,
  isNone,
  fromPredicateO,
  altO,
  mapO,
  getOrElseO,
  foldO,
  findFirst,
  mapA,
  type Task,
} from "./fp.js";

export {
  ExitCode,
  type CLIError,
  type CLIErrorWithExit,
  usageError,
  notFoundError,
  configError,
  runtimeError,
  portInUseError,
  // Build error factories
  parseError,
  transformError,
  validationError,
  generationError,
  // Install error factories
  prerequisiteError,
  installError,
  backupError,
  verificationError,
  getExitCode,
  withExitCode,
  formatError,
  tryCatchTE,
} from "./errors.js";

export {
  LogLevel,
  type LoggerOptions,
  type Logger,
  createLogger,
} from "./logger.js";

export { type RuntimeInfo, detectRuntime, isBun } from "./runtime.js";

export {
  type CLIConfig,
  type ViewConfig,
  findRp1Root,
  parseViewArgs,
  resolveRp1Root,
  loadViewConfig,
} from "./config.js";

export {
  type PromptOptions,
  confirmAction,
  selectOption,
  selectMultiple,
} from "./prompts.js";
