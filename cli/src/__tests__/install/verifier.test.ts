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
        issues: [
          "Missing skills (1): skill3",
          "Cannot read command1.md: ENOENT",
        ],
      };

      expect(isHealthy(report)).toBe(false);
    });
  });

  // Note: verifyInstallation and listInstalledCommands use homedir()
  // making them harder to unit test without mocking. These would be
  // better suited for integration tests where we can set up the full
  // ~/.config/opencode structure in a temp directory.

  describe("VerificationReport structure", () => {
    test("report contains all required fields", () => {
      const report: VerificationReport = {
        commandsFound: 0,
        commandsExpected: 0,
        agentsFound: 0,
        agentsExpected: 0,
        skillsFound: 0,
        skillsExpected: 0,
        issues: [],
      };

      expect(report).toHaveProperty("commandsFound");
      expect(report).toHaveProperty("commandsExpected");
      expect(report).toHaveProperty("agentsFound");
      expect(report).toHaveProperty("agentsExpected");
      expect(report).toHaveProperty("skillsFound");
      expect(report).toHaveProperty("skillsExpected");
      expect(report).toHaveProperty("issues");
      expect(Array.isArray(report.issues)).toBe(true);
    });
  });
});
