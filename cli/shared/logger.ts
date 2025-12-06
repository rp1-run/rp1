import { createConsola, type ConsolaInstance } from "consola";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export const LogLevel = {
  TRACE: "trace" as LogLevel,
  DEBUG: "debug" as LogLevel,
  INFO: "info" as LogLevel,
  WARN: "warn" as LogLevel,
  ERROR: "error" as LogLevel,
} as const;

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

  start(message: string): void;
  success(message: string): void;
  fail(message: string): void;

  box(message: string): void;
}

const LOG_LEVEL_MAP: Record<LogLevel, number> = {
  trace: 5,
  debug: 4,
  info: 3,
  warn: 2,
  error: 1,
};

export function createLogger(options: LoggerOptions): Logger {
  const consola: ConsolaInstance = createConsola({
    level: LOG_LEVEL_MAP[options.level],
    formatOptions: {
      colors: options.color,
      date: options.timestamps ?? false,
    },
  });

  return {
    trace: (msg, ...args) => consola.trace(msg, ...args),
    debug: (msg, ...args) => consola.debug(msg, ...args),
    info: (msg, ...args) => consola.info(msg, ...args),
    warn: (msg, ...args) => consola.warn(msg, ...args),
    error: (msg, ...args) => consola.error(msg, ...args),

    start: (msg) => consola.start(msg),
    success: (msg) => consola.success(msg),
    fail: (msg) => consola.fail(msg),

    box: (msg) => consola.box(msg),
  };
}
