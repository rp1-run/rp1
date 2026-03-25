/**
 * rp1 session plugin for OpenCode
 *
 * Launches arcade daemon and checks for updates during plugin init
 * (not on session.created, which only fires for new sessions — not
 * resumed ones). Injects arcade URL and update notices into the
 * system prompt so the AI surfaces them to the user.
 *
 * Auto-discovered from ~/.config/opencode/plugins/ directory.
 *
 * Environment variables:
 *   RP1_BINARY - Path to rp1 binary (default: "rp1" from PATH)
 */

import { execSync } from "child_process";

const TIMEOUT_MS = 8000;

let arcadeReady = false;
let updateNotice: string | undefined;

export const Rp1Plugin = async (_ctx: any) => {
  const rp1Binary = process.env.RP1_BINARY || "rp1";

  // Start arcade daemon at init time (runs on every OpenCode bootstrap,
  // regardless of whether the user creates a new session or resumes one)
  try {
    execSync(rp1Binary + " arcade --no-open", {
      timeout: 5000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    arcadeReady = true;
  } catch {
    // Daemon may already be running or rp1 not available
  }

  // Check for updates
  try {
    const result = execSync(rp1Binary + " update --check --json", {
      timeout: TIMEOUT_MS,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    const data = JSON.parse(result);
    if (data.update_available && data.latest_version) {
      updateNotice = `rp1 update available: v${data.current_version} → v${data.latest_version}  |  Run /self-update`;
    }
  } catch {
    // Graceful degradation
  }

  return {
    "experimental.chat.system.transform": async (
      _input: { sessionID?: string; model: any },
      output: { system: string[] },
    ) => {
      const lines: string[] = [];
      if (arcadeReady) {
        lines.push("🕹️ rp1 Arcade is live at http://localhost:7710");
      }
      if (updateNotice) {
        lines.push(`🔄 ${updateNotice}`);
      }
      if (lines.length > 0) {
        output.system.push(lines.join("\n"));
      }
    },
  };
};
