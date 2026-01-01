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
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	type ErrorResponse,
	getDaemonStatus,
	type HealthResponse,
	type RegisterResponse,
	registerProjectWithDaemon,
	stopDaemon as stopDaemonViaIpc,
} from "./ipc";

export {
	connectToDaemon,
	type DaemonStartResult,
	ensureDaemon,
	getStatus,
	restartDaemon,
	stopDaemon,
} from "./manager";
