/**
 * rp1 session plugin for OpenCode
 *
 * Launches arcade daemon and checks for updates during plugin init.
 * Injects arcade URL and update notices into the system prompt.
 *
 * Auto-discovered from ~/.config/opencode/plugins/ directory.
 *
 * Environment variables:
 *   RP1_BINARY - Absolute path to rp1 binary (default: resolved via `which`)
 */

import type { Plugin } from "@opencode-ai/plugin";

export const Rp1Plugin: Plugin = async ({ $ }) => {
  let arcadeReady = false;
  let updateNotice: string | undefined;

  // Resolve rp1 binary path
  let rp1 = process.env.RP1_BINARY || "";
  if (!rp1) {
    try {
      rp1 = (await $`which rp1`.text()).trim();
    } catch {
      rp1 = "rp1";
    }
  }

  // Start arcade daemon at init time (runs on every OpenCode bootstrap,
  // regardless of whether the user creates a new session or resumes one)
  try {
    await $`${rp1} arcade --no-open`.quiet();
    arcadeReady = true;
  } catch {
    // Daemon may already be running or rp1 not available
  }

  // Check for updates (best-effort)
  try {
    const result = await $`${rp1} update --check --json`.text();
    const data = JSON.parse(result);
    if (data.update_available && data.latest_version) {
      updateNotice = `rp1 update available: v${data.current_version} → v${data.latest_version}  |  Run /self-update`;
    }
  } catch {
    // Update check is best-effort
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
        lines.push(`🚀 ${updateNotice}`);
      }
      if (lines.length > 0) {
        output.system.push(lines.join("\n"));
      }
    },
  };
};
