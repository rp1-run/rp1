export enum LogLevel {
  TRACE = 0,
  DEBUG = 1,
  INFO = 2,
  WARN = 3,
  ERROR = 4,
}

export interface LoggerOptions {
  level: LogLevel;
  color: boolean;
  timestamps?: boolean;
}

export interface Logger {
  trace(message: string, ...args: unknown[]): void;
  debug(message: string, ...args: unknown[]): void;
  info(message: string, ...args: unknown[]): void;
  warn(message: string, ...args: unknown[]): void;
  error(message: string, ...args: unknown[]): void;
}

const COLORS = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  red: "\x1b[31m",
  green: "\x1b[32m",
};

const PREFIXES: Record<LogLevel, { label: string; color: string }> = {
  [LogLevel.TRACE]: { label: "TRACE", color: COLORS.dim },
  [LogLevel.DEBUG]: { label: "DEBUG", color: COLORS.cyan },
  [LogLevel.INFO]: { label: "INFO", color: COLORS.green },
  [LogLevel.WARN]: { label: "WARN", color: COLORS.yellow },
  [LogLevel.ERROR]: { label: "ERROR", color: COLORS.red },
};

export function createLogger(options: LoggerOptions): Logger {
  const { level, color, timestamps = false } = options;

  function log(msgLevel: LogLevel, message: string, ...args: unknown[]): void {
    if (msgLevel < level) return;

    const prefix = PREFIXES[msgLevel];
    const timestamp = timestamps ? `[${new Date().toISOString()}] ` : "";
    const levelStr = color
      ? `${prefix.color}[${prefix.label}]${COLORS.reset}`
      : `[${prefix.label}]`;

    const output = msgLevel >= LogLevel.ERROR ? console.error : console.log;
    output(`${timestamp}${levelStr} ${message}`, ...args);
  }

  return {
    trace: (msg, ...args) => log(LogLevel.TRACE, msg, ...args),
    debug: (msg, ...args) => log(LogLevel.DEBUG, msg, ...args),
    info: (msg, ...args) => log(LogLevel.INFO, msg, ...args),
    warn: (msg, ...args) => log(LogLevel.WARN, msg, ...args),
    error: (msg, ...args) => log(LogLevel.ERROR, msg, ...args),
  };
}
