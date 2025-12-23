/**
 * Package manager library for detecting installation method and running updates.
 * Supports Homebrew (macOS/Linux), Scoop (Windows), and manual installations.
 */

import { execSync } from "node:child_process";
import { platform } from "node:os";

/**
 * Supported installation methods for rp1.
 */
export type InstallMethod = "homebrew" | "scoop" | "manual";

/**
 * Result of installation method detection.
 */
export interface DetectionResult {
	readonly method: InstallMethod;
	readonly confidence: "high" | "medium";
	readonly details: string;
}

/**
 * Result of running an update operation.
 */
export interface UpdateResult {
	readonly success: boolean;
	readonly previousVersion: string;
	readonly newVersion: string | null;
	readonly output: string;
	readonly error: string | null;
}

/**
 * Check if a command exists in the system PATH.
 *
 * @param command - Command name to check
 * @returns true if command exists, false otherwise
 */
const commandExists = (command: string): boolean => {
	try {
		const checkCmd =
			platform() === "win32" ? `where ${command}` : `which ${command}`;
		execSync(checkCmd, { stdio: "pipe", encoding: "utf-8" });
		return true;
	} catch {
		return false;
	}
};

/**
 * Detect if rp1 was installed via Homebrew.
 * Runs `brew list rp1` to check if rp1 is managed by Homebrew.
 *
 * @returns DetectionResult if Homebrew manages rp1, null otherwise
 */
const detectHomebrew = (): DetectionResult | null => {
	// Only check Homebrew on macOS and Linux
	const currentPlatform = platform();
	if (currentPlatform !== "darwin" && currentPlatform !== "linux") {
		return null;
	}

	// Check if brew command exists
	if (!commandExists("brew")) {
		return null;
	}

	try {
		// Check if rp1 is installed via Homebrew
		execSync("brew list rp1", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 10000,
		});

		return {
			method: "homebrew",
			confidence: "high",
			details: "rp1 is installed via Homebrew (brew list rp1 succeeded)",
		};
	} catch {
		// brew list failed - rp1 is not managed by Homebrew
		return null;
	}
};

/**
 * Detect if rp1 was installed via Scoop.
 * Runs `scoop info rp1` to check if rp1 is managed by Scoop.
 *
 * @returns DetectionResult if Scoop manages rp1, null otherwise
 */
const detectScoop = (): DetectionResult | null => {
	// Only check Scoop on Windows
	if (platform() !== "win32") {
		return null;
	}

	// Check if scoop command exists
	if (!commandExists("scoop")) {
		return null;
	}

	try {
		// Check if rp1 is installed via Scoop
		const output = execSync("scoop info rp1", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 10000,
		});

		// Verify that rp1 is actually installed (not just found in buckets)
		if (output.includes("Installed:")) {
			return {
				method: "scoop",
				confidence: "high",
				details: "rp1 is installed via Scoop (scoop info rp1 shows Installed)",
			};
		}

		return null;
	} catch {
		// scoop info failed - rp1 is not managed by Scoop
		return null;
	}
};

/**
 * Detect the installation method used to install rp1.
 * Checks for Homebrew (macOS/Linux) and Scoop (Windows), falls back to manual.
 *
 * Detection Algorithm:
 * 1. On Windows: Check if scoop manages rp1 via `scoop info rp1`
 * 2. On macOS/Linux: Check if brew manages rp1 via `brew list rp1`
 * 3. Fallback: Return "manual" if neither package manager manages rp1
 *
 * @returns DetectionResult with method, confidence level, and details
 */
export const detectInstallMethod = async (): Promise<DetectionResult> => {
	const currentPlatform = platform();

	// On Windows, check Scoop first
	if (currentPlatform === "win32") {
		const scoopResult = detectScoop();
		if (scoopResult) {
			return scoopResult;
		}

		return {
			method: "manual",
			confidence: "medium",
			details:
				"rp1 was not found in Scoop; assuming manual installation or alternative package manager",
		};
	}

	// On macOS or Linux, check Homebrew
	if (currentPlatform === "darwin" || currentPlatform === "linux") {
		const brewResult = detectHomebrew();
		if (brewResult) {
			return brewResult;
		}

		return {
			method: "manual",
			confidence: "medium",
			details:
				"rp1 was not found in Homebrew; assuming manual installation or alternative package manager",
		};
	}

	// Unknown platform - default to manual
	return {
		method: "manual",
		confidence: "medium",
		details: `Unknown platform (${currentPlatform}); assuming manual installation`,
	};
};

/**
 * Run Homebrew upgrade for rp1.
 *
 * @param previousVersion - Version before update
 * @returns UpdateResult with success status and output
 */
const runBrewUpgrade = (previousVersion: string): UpdateResult => {
	try {
		// Run brew upgrade rp1
		const output = execSync("brew upgrade rp1", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 300000, // 5 minute timeout for downloads
		});

		// Get new version after upgrade
		let newVersion: string | null = null;
		try {
			const versionOutput = execSync("rp1 --version", {
				stdio: "pipe",
				encoding: "utf-8",
				timeout: 5000,
			});
			// Extract version number from output (e.g., "rp1 0.3.0" -> "0.3.0")
			const match = versionOutput.match(/\d+\.\d+\.\d+/);
			if (match) {
				newVersion = match[0];
			}
		} catch {
			// Could not determine new version, but upgrade may have succeeded
		}

		return {
			success: true,
			previousVersion,
			newVersion,
			output: output.trim(),
			error: null,
		};
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		return {
			success: false,
			previousVersion,
			newVersion: null,
			output: "",
			error: errorMessage,
		};
	}
};

/**
 * Run Scoop update for rp1.
 *
 * @param previousVersion - Version before update
 * @returns UpdateResult with success status and output
 */
const runScoopUpdate = (previousVersion: string): UpdateResult => {
	try {
		// Run scoop update rp1
		const output = execSync("scoop update rp1", {
			stdio: "pipe",
			encoding: "utf-8",
			timeout: 300000, // 5 minute timeout for downloads
		});

		// Get new version after upgrade
		let newVersion: string | null = null;
		try {
			const versionOutput = execSync("rp1 --version", {
				stdio: "pipe",
				encoding: "utf-8",
				timeout: 5000,
			});
			// Extract version number from output
			const match = versionOutput.match(/\d+\.\d+\.\d+/);
			if (match) {
				newVersion = match[0];
			}
		} catch {
			// Could not determine new version, but upgrade may have succeeded
		}

		return {
			success: true,
			previousVersion,
			newVersion,
			output: output.trim(),
			error: null,
		};
	} catch (e) {
		const errorMessage = e instanceof Error ? e.message : String(e);
		return {
			success: false,
			previousVersion,
			newVersion: null,
			output: "",
			error: errorMessage,
		};
	}
};

/**
 * Run the appropriate update command based on installation method.
 *
 * @param method - Installation method to use for update
 * @param previousVersion - Current version before update
 * @returns UpdateResult with success status, versions, and output
 */
export const runUpdate = async (
	method: InstallMethod,
	previousVersion: string,
): Promise<UpdateResult> => {
	switch (method) {
		case "homebrew":
			return runBrewUpgrade(previousVersion);

		case "scoop":
			return runScoopUpdate(previousVersion);

		case "manual":
			return {
				success: false,
				previousVersion,
				newVersion: null,
				output: "",
				error:
					"Automatic update is not available for manual installations. " +
					"Please download the latest version from: https://github.com/rp1-run/rp1/releases",
			};
	}
};
