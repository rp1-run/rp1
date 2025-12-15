// Re-export plugin for Bun module resolution
// (opencode.json's "main" field isn't read by Bun's resolver)
export * from "./plugin/index.ts";
