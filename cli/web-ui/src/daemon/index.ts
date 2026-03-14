/**
 * Daemon module exports.
 * Provides configuration, IPC, and lifecycle management for the background daemon.
 */

export {
	ensureConfigDir,
	getConfigDir,
	getPidFilePath,
	getRegistryPath,
} from "./config-dir";

export {
	type ArtifactNotifyPayload,
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	type ErrorResponse,
	getDaemonStatus,
	type HealthResponse,
	notifyArtifactChange,
	notifyStatusChange,
	type RegisterResponse,
	registerProjectWithDaemon,
	stopDaemon as stopDaemonViaIpc,
	type WorkflowNotifyContext,
} from "./ipc";

export {
	connectToDaemon,
	type DaemonStartResult,
	ensureDaemon,
	forceKillProcess,
	getStatus,
	isProcessRunning,
	restartDaemon,
	stopDaemon,
	waitForProcessExit,
} from "./manager";
