/**
 * Daemon module exports.
 * Provides configuration, IPC, and lifecycle management for the background daemon.
 */

export {
	type DaemonState,
	ensureConfigDir,
	getConfigDir,
	getDaemonStatePath,
	getPidFilePath,
	readDaemonState,
	writeDaemonState,
} from "./config-dir";

export {
	checkHealth,
	createConnection,
	type DaemonConnection,
	type DaemonStatus,
	type ErrorResponse,
	type EventNotificationPayload,
	getDaemonStatus,
	type HealthResponse,
	type NotificationNotifyPayload,
	notifyEvent,
	notifyNotification,
	type RegisterResponse,
	registerProjectWithDaemon,
	stopDaemon as stopDaemonViaIpc,
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
