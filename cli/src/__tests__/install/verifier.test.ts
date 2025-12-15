/**
 * Unit tests for verifier.ts - Installation verification.
 * Tests rp1's verification logic for installed artifacts.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";

import { isHealthy, type VerificationReport } from "../../install/models.js";
import {
  createTempDir,
  cleanupTempDir,
} from "../helpers/index.js";

describe("verifier", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await createTempDir("verifier-test");
  });

  afterEach(async () => {
    await cleanupTempDir(tempDir);
  });

  describe("isHealthy", () => {
    test("returns true when all counts match and no critical issues", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [],
      };

      expect(isHealthy(report)).toBe(true);
    });

    test("returns false when commands are missing", () => {
      const report: VerificationReport = {
        commandsFound: 5,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [],
      };

      expect(isHealthy(report)).toBe(false);
    });

    test("returns false when agents are missing", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 2,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [],
      };

      expect(isHealthy(report)).toBe(false);
    });

    test("returns true when only skills are missing (skills are optional)", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 0,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: ["Missing skills (3): skill1, skill2, skill3"],
      };

      expect(isHealthy(report)).toBe(true);
    });

    test("returns false when critical issues exist (non-skills)", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: ["Invalid YAML in sample-command.md"],
      };

      expect(isHealthy(report)).toBe(false);
    });

    test("returns true when only skill-related issues exist", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 2,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [
          "Missing skills (1): skill3. Note: Skills require opencode-skills plugin.",
        ],
      };

      expect(isHealthy(report)).toBe(true);
    });

    test("returns false when mixed critical and skill issues exist", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 2,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [
          "Missing skills (1): skill3",
          "Cannot read command1.md: ENOENT",
        ],
      };

      expect(isHealthy(report)).toBe(false);
    });

    test("returns true when only plugins are missing (plugins are optional)", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 0,
        pluginsExpected: 1,
        issues: ["Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks."],
      };

      expect(isHealthy(report)).toBe(true);
    });

    test("returns true when only plugin-related issues exist", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 0,
        pluginsExpected: 1,
        issues: [
          "Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
        ],
      };

      expect(isHealthy(report)).toBe(true);
    });

    test("returns true when both skills and plugins are missing (both optional)", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 0,
        skillsExpected: 3,
        pluginsFound: 0,
        pluginsExpected: 1,
        issues: [
          "Missing skills (3): skill1, skill2, skill3",
          "Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks.",
        ],
      };

      expect(isHealthy(report)).toBe(true);
    });
  });

  describe("VerificationReport structure", () => {
    test("report contains all required fields including plugins", () => {
      const report: VerificationReport = {
        commandsFound: 0,
        commandsExpected: 0,
        agentsFound: 0,
        agentsExpected: 0,
        skillsFound: 0,
        skillsExpected: 0,
        pluginsFound: 0,
        pluginsExpected: 0,
        issues: [],
      };

      expect(report).toHaveProperty("commandsFound");
      expect(report).toHaveProperty("commandsExpected");
      expect(report).toHaveProperty("agentsFound");
      expect(report).toHaveProperty("agentsExpected");
      expect(report).toHaveProperty("skillsFound");
      expect(report).toHaveProperty("skillsExpected");
      expect(report).toHaveProperty("pluginsFound");
      expect(report).toHaveProperty("pluginsExpected");
      expect(report).toHaveProperty("issues");
      expect(Array.isArray(report.issues)).toBe(true);
    });
  });

  describe("plugin verification", () => {
    test("reports missing plugins as issues", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 0,
        pluginsExpected: 1,
        issues: ["Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks."],
      };

      expect(report.pluginsFound).toBe(0);
      expect(report.pluginsExpected).toBe(1);
      expect(report.issues.some(i => i.includes("Missing plugins"))).toBe(true);
      expect(report.issues.some(i => i.includes("rp1-base-hooks"))).toBe(true);
    });

    test("correctly counts installed plugins", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 1,
        pluginsExpected: 1,
        issues: [],
      };

      expect(report.pluginsFound).toBe(1);
      expect(report.pluginsExpected).toBe(1);
      expect(report.pluginsFound).toBe(report.pluginsExpected);
    });

    test("handles missing plugin directory gracefully", () => {
      const report: VerificationReport = {
        commandsFound: 10,
        commandsExpected: 10,
        agentsFound: 5,
        agentsExpected: 5,
        skillsFound: 3,
        skillsExpected: 3,
        pluginsFound: 0,
        pluginsExpected: 1,
        issues: ["Missing plugins (1): rp1-base-hooks. Note: Plugins provide session hooks."],
      };

      expect(report.pluginsFound).toBe(0);
      expect(isHealthy(report)).toBe(true);
    });
  });
});
