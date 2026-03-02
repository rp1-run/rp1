/**
 * rp1 session plugin for OpenCode
 *
 * Launches arcade daemon and checks for updates on session startup.
 * Auto-discovered from ~/.config/opencode/plugins/ directory.
 *
 * Environment variables:
 *   RP1_BINARY - Path to rp1 binary (default: "rp1" from PATH)
 */

import { execSync } from "child_process";

const TIMEOUT_MS = 8000;

export const Rp1Plugin = async (_ctx: any) => {
  return {
    event: async (input: { event: { type: string } }) => {
      if (input.event.type !== "session.created") {
        return;
      }

      const rp1Binary = process.env.RP1_BINARY || "rp1";

      // Launch arcade daemon silently
      try {
        execSync(rp1Binary + " arcade --no-open", {
          timeout: 5000,
          stdio: ["pipe", "pipe", "pipe"],
        });
      } catch {
        // Silent fail
      }

      // Check for updates
      try {
        const result = execSync(rp1Binary + " check-update --json", {
          timeout: TIMEOUT_MS,
          encoding: "utf-8",
          stdio: ["pipe", "pipe", "pipe"],
        });

        const data = JSON.parse(result);

        if (data.update_available && data.latest_version) {
          // Use console to show update notice (visible in OpenCode logs)
          console.log(
            `[rp1] Update available: v${data.current_version} → v${data.latest_version}. Run /self-update`,
          );
        }
      } catch {
        // Graceful degradation
      }
    },
  };
};
