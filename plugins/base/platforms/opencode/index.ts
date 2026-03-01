/**
 * rp1 version check plugin for OpenCode
 *
 * Checks for rp1 updates on session startup and shows a toast notification
 * when an update is available.
 *
 * Environment variables:
 *   RP1_BINARY - Path to rp1 binary (default: "rp1" from PATH)
 */

import { execSync } from "child_process";

interface PluginInput {
  client: {
    tui: {
      showToast: (options: {
        body: {
          title?: string;
          message: string;
          variant: "info" | "success" | "warning" | "error";
          duration?: number;
        };
      }) => Promise<boolean>;
    };
  };
  project: {
    id: string;
    worktree: string;
  };
  directory: string;
  worktree: string;
}

interface Event {
  type: string;
}

interface Hooks {
  event?: (input: { event: Event }) => Promise<void>;
}

interface CheckUpdateResponse {
  current_version: string;
  latest_version: string | null;
  update_available: boolean;
}

const TIMEOUT_MS = 8000;

export const Rp1UpdateCheck = async (context: PluginInput): Promise<Hooks> => {
  const client = context.client;

  return {
    event: async (input: { event: Event }) => {
      // Only check on session.created
      if (input.event.type !== "session.created") {
        return;
      }

      // Use RP1_BINARY env var with fallback to system rp1
      const rp1Binary = process.env.RP1_BINARY || "rp1";

      // Launch arcade daemon silently (before update check)
      try {
        execSync(rp1Binary + " arcade --no-open", {
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // Silent fail - rp1 not on PATH, not in rp1 project, or timeout
      }

      try {
        const result = execSync(rp1Binary + " check-update --json", {
          timeout: TIMEOUT_MS,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        const data: CheckUpdateResponse = JSON.parse(result);

        if (data.update_available && data.latest_version) {
          await client.tui.showToast({
            body: {
              title: "rp1 Update Available",
              message: "v" + data.current_version + " → v" + data.latest_version + ". Run /self-update",
              variant: "info",
              duration: 8000,
            },
          });
        }
      } catch {
        // Graceful degradation - don't block session on errors
        // Errors: rp1 not found, network timeout, JSON parse failure
      }
    },
  };
};
