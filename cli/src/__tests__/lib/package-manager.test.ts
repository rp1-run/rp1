/**
 * Unit tests for the package manager library.
 * Tests use mocking via Bun's mock module to simulate different platform/command
 * scenarios since detectInstallMethod and runUpdate call external commands.
 */

import {
	afterEach,
	beforeEach,
	describe,
	expect,
	mock,
	spyOn,
	test,
} from "bun:test";
import * as childProcess from "node:child_process";
import * as os from "node:os";
import {
	type DetectionResult,
	detectInstallMethod,
	type InstallMethod,
	runUpdate,
	type UpdateResult,
} from "../../lib/package-manager.js";

describe("package-manager", () => {
	describe("detectInstallMethod", () => {
		let execSyncSpy: ReturnType<typeof spyOn>;
		let platformSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			execSyncSpy = spyOn(childProcess, "execSync");
			platformSpy = spyOn(os, "platform");
		});

		afterEach(() => {
			mock.restore();
		});

		describe("homebrew detection (macOS/Linux)", () => {
			test("returns homebrew when brew list rp1 succeeds on macOS", async () => {
				platformSpy.mockReturnValue("darwin");

				// Mock execSync: first call for `which brew` succeeds, second for `brew list rp1` succeeds
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "which brew") {
						return "/opt/homebrew/bin/brew";
					}
					if (cmd === "brew list rp1") {
						return "/opt/homebrew/Cellar/rp1/0.2.3";
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("homebrew");
				expect(result.confidence).toBe("high");
				expect(result.details).toContain("Homebrew");
			});

			test("returns homebrew when brew list rp1 succeeds on Linux", async () => {
				platformSpy.mockReturnValue("linux");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "which brew") {
						return "/home/linuxbrew/.linuxbrew/bin/brew";
					}
					if (cmd === "brew list rp1") {
						return "/home/linuxbrew/.linuxbrew/Cellar/rp1/0.2.3";
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("homebrew");
				expect(result.confidence).toBe("high");
			});

			test("returns manual when brew command not found", async () => {
				platformSpy.mockReturnValue("darwin");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "which brew") {
						throw new Error("brew not found");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
				expect(result.details).toContain("not found in Homebrew");
			});

			test("returns manual when brew list rp1 fails", async () => {
				platformSpy.mockReturnValue("darwin");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "which brew") {
						return "/opt/homebrew/bin/brew";
					}
					if (cmd === "brew list rp1") {
						throw new Error("Error: No such keg: /opt/homebrew/Cellar/rp1");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
			});
		});

		describe("scoop detection (Windows)", () => {
			test("returns scoop when scoop info rp1 succeeds", async () => {
				platformSpy.mockReturnValue("win32");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "where scoop") {
						return "C:\\Users\\user\\scoop\\shims\\scoop.cmd";
					}
					if (cmd === "scoop info rp1") {
						return `Name: rp1
Description: AI Plugin System
Version: 0.2.3
Installed: Yes
Website: https://rp1.run`;
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("scoop");
				expect(result.confidence).toBe("high");
				expect(result.details).toContain("Scoop");
			});

			test("returns manual when scoop command not found", async () => {
				platformSpy.mockReturnValue("win32");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "where scoop") {
						throw new Error("scoop not found");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
				expect(result.details).toContain("not found in Scoop");
			});

			test("returns manual when scoop info rp1 fails", async () => {
				platformSpy.mockReturnValue("win32");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "where scoop") {
						return "C:\\Users\\user\\scoop\\shims\\scoop.cmd";
					}
					if (cmd === "scoop info rp1") {
						throw new Error("Could not find manifest for 'rp1'");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
			});

			test("returns manual when scoop info output lacks Installed marker", async () => {
				platformSpy.mockReturnValue("win32");

				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "where scoop") {
						return "C:\\Users\\user\\scoop\\shims\\scoop.cmd";
					}
					if (cmd === "scoop info rp1") {
						return `Name: rp1
Description: AI Plugin System
Version: 0.2.3
Website: https://rp1.run`;
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
			});
		});

		describe("manual/unknown platform detection", () => {
			test("returns manual for unknown platform", async () => {
				platformSpy.mockReturnValue("freebsd" as NodeJS.Platform);

				const result = await detectInstallMethod();

				expect(result.method).toBe("manual");
				expect(result.confidence).toBe("medium");
				expect(result.details).toContain("Unknown platform");
			});
		});

		describe("result structure", () => {
			test("returns DetectionResult with all required fields", async () => {
				platformSpy.mockReturnValue("darwin");
				execSyncSpy.mockImplementation(() => {
					throw new Error("command not found");
				});

				const result = await detectInstallMethod();

				expect(result).toHaveProperty("method");
				expect(result).toHaveProperty("confidence");
				expect(result).toHaveProperty("details");
				expect(["homebrew", "scoop", "manual"]).toContain(result.method);
				expect(["high", "medium"]).toContain(result.confidence);
				expect(typeof result.details).toBe("string");
			});
		});
	});

	describe("runUpdate", () => {
		let execSyncSpy: ReturnType<typeof spyOn>;

		beforeEach(() => {
			execSyncSpy = spyOn(childProcess, "execSync");
		});

		afterEach(() => {
			mock.restore();
		});

		describe("homebrew update path", () => {
			test("executes brew upgrade rp1 and returns success", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") {
						return `==> Upgrading 1 outdated package:
rp1 0.2.3 -> 0.3.0
==> Upgrading rp1
==> Downloading https://github.com/rp1-run/rp1/releases/download/v0.3.0/rp1-darwin-arm64.tar.gz
==> Installing rp1
`;
					}
					if (cmd === "rp1 --version") {
						return "rp1 0.3.0";
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(true);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBe("0.3.0");
				expect(result.error).toBeNull();
				expect(result.output).toContain("Upgrading");
			});

			test("returns success even when version check fails after upgrade", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") {
						return "==> Upgrading rp1\n";
					}
					if (cmd === "rp1 --version") {
						throw new Error("command not found");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(true);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBeNull(); // Could not determine new version
				expect(result.error).toBeNull();
			});

			test("returns failure when brew upgrade fails", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") {
						throw new Error("Error: rp1 not installed");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBeNull();
				expect(result.error).not.toBeNull();
				expect(result.error).toContain("not installed");
				expect(result.output).toBe("");
			});
		});

		describe("scoop update path", () => {
			test("executes scoop update rp1 and returns success", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "scoop update rp1") {
						return `Updating 'rp1' (0.2.3 -> 0.3.0)
Downloading new version
Installing new version
Removing old version
'rp1' (0.3.0) was installed successfully!`;
					}
					if (cmd === "rp1 --version") {
						return "rp1 0.3.0";
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("scoop", "0.2.3");

				expect(result.success).toBe(true);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBe("0.3.0");
				expect(result.error).toBeNull();
				expect(result.output).toContain("installed successfully");
			});

			test("returns success even when version check fails after update", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "scoop update rp1") {
						return "'rp1' was updated successfully!";
					}
					if (cmd === "rp1 --version") {
						throw new Error("command not found");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("scoop", "0.2.3");

				expect(result.success).toBe(true);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBeNull();
				expect(result.error).toBeNull();
			});

			test("returns failure when scoop update fails", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "scoop update rp1") {
						throw new Error("Could not find manifest for 'rp1'");
					}
					throw new Error(`Unexpected command: ${cmd}`);
				});

				const result = await runUpdate("scoop", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBeNull();
				expect(result.error).not.toBeNull();
				expect(result.error).toContain("manifest");
				expect(result.output).toBe("");
			});
		});

		describe("manual installation path", () => {
			test("returns failure with guidance for manual installations", async () => {
				const result = await runUpdate("manual", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.previousVersion).toBe("0.2.3");
				expect(result.newVersion).toBeNull();
				expect(result.error).not.toBeNull();
				expect(result.error).toContain("Automatic update is not available");
				expect(result.error).toContain("github.com/rp1-run/rp1/releases");
				expect(result.output).toBe("");
			});

			test("does not execute any commands for manual installation", async () => {
				let commandCalled = false;
				execSyncSpy.mockImplementation(() => {
					commandCalled = true;
					return "";
				});

				await runUpdate("manual", "0.2.3");

				expect(commandCalled).toBe(false);
			});
		});

		describe("error handling", () => {
			test("captures error message from Error objects", async () => {
				execSyncSpy.mockImplementation(() => {
					throw new Error("Connection timed out");
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.error).toBe("Connection timed out");
			});

			test("converts non-Error throws to strings", async () => {
				execSyncSpy.mockImplementation(() => {
					throw "string error";
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.error).toBe("string error");
			});

			test("handles timeout errors", async () => {
				execSyncSpy.mockImplementation(() => {
					const error = new Error("ETIMEDOUT");
					(error as NodeJS.ErrnoException).code = "ETIMEDOUT";
					throw error;
				});

				const result = await runUpdate("homebrew", "0.2.3");

				expect(result.success).toBe(false);
				expect(result.error).toContain("ETIMEDOUT");
			});
		});

		describe("result structure", () => {
			test("returns UpdateResult with all required fields for success", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") return "Success";
					if (cmd === "rp1 --version") return "rp1 1.0.0";
					throw new Error(`Unexpected: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "0.9.0");

				expect(result).toHaveProperty("success");
				expect(result).toHaveProperty("previousVersion");
				expect(result).toHaveProperty("newVersion");
				expect(result).toHaveProperty("output");
				expect(result).toHaveProperty("error");
				expect(typeof result.success).toBe("boolean");
				expect(typeof result.previousVersion).toBe("string");
			});

			test("returns UpdateResult with all required fields for failure", async () => {
				execSyncSpy.mockImplementation(() => {
					throw new Error("update failed");
				});

				const result = await runUpdate("scoop", "0.9.0");

				expect(result).toHaveProperty("success");
				expect(result).toHaveProperty("previousVersion");
				expect(result).toHaveProperty("newVersion");
				expect(result).toHaveProperty("output");
				expect(result).toHaveProperty("error");
				expect(result.success).toBe(false);
				expect(result.newVersion).toBeNull();
				expect(result.error).not.toBeNull();
			});
		});

		describe("version parsing", () => {
			test("extracts version from rp1 --version output with prefix", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") return "Done";
					if (cmd === "rp1 --version") return "rp1 version 2.1.0";
					throw new Error(`Unexpected: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "2.0.0");

				expect(result.newVersion).toBe("2.1.0");
			});

			test("extracts version from plain version string", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "scoop update rp1") return "Done";
					if (cmd === "rp1 --version") return "3.2.1";
					throw new Error(`Unexpected: ${cmd}`);
				});

				const result = await runUpdate("scoop", "3.2.0");

				expect(result.newVersion).toBe("3.2.1");
			});

			test("handles version with v prefix", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") return "Done";
					if (cmd === "rp1 --version") return "v1.2.3";
					throw new Error(`Unexpected: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "1.2.2");

				expect(result.newVersion).toBe("1.2.3");
			});

			test("returns null when version string has no semver", async () => {
				execSyncSpy.mockImplementation((cmd: string) => {
					if (cmd === "brew upgrade rp1") return "Done";
					if (cmd === "rp1 --version") return "rp1 development build";
					throw new Error(`Unexpected: ${cmd}`);
				});

				const result = await runUpdate("homebrew", "1.0.0");

				expect(result.success).toBe(true);
				expect(result.newVersion).toBeNull();
			});
		});
	});

	describe("type exports", () => {
		test("InstallMethod includes all valid methods", () => {
			const methods: InstallMethod[] = ["homebrew", "scoop", "manual"];

			expect(methods).toHaveLength(3);
			expect(methods).toContain("homebrew");
			expect(methods).toContain("scoop");
			expect(methods).toContain("manual");
		});

		test("DetectionResult has correct shape", () => {
			const result: DetectionResult = {
				method: "homebrew",
				confidence: "high",
				details: "test details",
			};

			expect(result.method).toBe("homebrew");
			expect(result.confidence).toBe("high");
			expect(result.details).toBe("test details");
		});

		test("UpdateResult has correct shape", () => {
			const successResult: UpdateResult = {
				success: true,
				previousVersion: "1.0.0",
				newVersion: "1.1.0",
				output: "update output",
				error: null,
			};

			const failureResult: UpdateResult = {
				success: false,
				previousVersion: "1.0.0",
				newVersion: null,
				output: "",
				error: "update failed",
			};

			expect(successResult.success).toBe(true);
			expect(failureResult.success).toBe(false);
		});
	});
});
